<script setup lang="ts">
import type { QTableColumn } from 'quasar';
import { Dialog } from 'quasar';
import { computed, reactive, ref, shallowRef, watch } from 'vue';
import UWindow from '@/components/UWindow.vue';
import TaskOutputDialog from '@/components/TaskOutputDialog.vue';
import StorageFileRestoreDialog from './StorageFileRestoreDialog.vue';
import type { PveRecord } from '@/api/resources';
import { getNodeStorage, getStorageContent, previewStorageBackupPrune, pruneStorageBackups, updateStorageContent } from '@/api/storageContent';
import { getNextVmId, restoreVmBackup, getVmBackupConfiguration } from '@/api/vm';
import { gettext } from '@/locale';
import { formatContentDate, formatContentSize, formatStorageContent, textValue } from '@/utils/pveFormat';

const props = defineProps<{ node: string; storage: string; storageType?: string; active?: boolean }>();

const loading = ref(false);
const filter = ref('');
const rows = shallowRef<PveRecord[]>([]);
const selected = ref<PveRecord[]>([]);
const notesVisible = ref(false);
const configVisible = ref(false);
const restoreVisible = ref(false);
const pruneVisible = ref(false);
const pruneRows = shallowRef<PveRecord[]>([]);
const taskVisible = ref(false);
const taskUpid = ref('');
const taskTitle = ref('');
const fileRestoreVisible = ref(false);
const notes = ref('');
const configuration = ref('');
const restoreStorages = shallowRef<PveRecord[]>([]);
const restorePlaceholders = reactive({ name: '', cores: '', memory: '', sockets: '' });
const restoreForm = reactive({ vmid: '', storage: '', bwlimit: '', unique: false, haManaged: false, name: '', cores: '', memory: '', sockets: '', unprivileged: 'keep', start: false, liveRestore: false });
const pruneForm = reactive({ last: '', hourly: '', daily: '', weekly: '', monthly: '', yearly: '' });
const selectedRow = computed(() => selected.value[0]);
const selectedVolid = computed(() => textValue(selectedRow.value?.volid));
const isPbs = computed(() => props.storageType === 'pbs' || textValue(selectedRow.value?.format).startsWith('pbs-'));
const guestType = computed<'qemu' | 'lxc' | undefined>(() => {
  const volid = selectedVolid.value;
  const format = textValue(selectedRow.value?.format);
  if (volid.includes('vzdump-qemu-') || format === 'pbs-vm') return 'qemu';
  if (volid.includes('vzdump-lxc-') || format === 'pbs-ct') return 'lxc';
  return undefined;
});
const canRestore = computed(() => !!selectedRow.value && !!guestType.value);
const pruneLabel = computed(() => selectedRow.value?.vmid && guestType.value ? `${gettext('Prune group')} ${guestType.value}/${textValue(selectedRow.value.vmid)}` : gettext('Prune group'));
const pruneTitle = computed(() => {
  const identity = `${guestType.value || ''}/${textValue(selectedRow.value?.vmid)}`;
  return gettext("Prune Backups for '%s' on Storage '%s'").replace('%s', identity).replace('%s', props.storage);
});
const pruneParams = computed(() => {
  const rules = [
    ['keep-last', pruneForm.last], ['keep-hourly', pruneForm.hourly], ['keep-daily', pruneForm.daily],
    ['keep-weekly', pruneForm.weekly], ['keep-monthly', pruneForm.monthly], ['keep-yearly', pruneForm.yearly],
  ].filter(([, value]) => value !== '').map(([key, value]) => `${key}=${value}`).join(',');
  return { type: guestType.value, vmid: textValue(selectedRow.value?.vmid), 'prune-backups': rules };
});

const columns = computed<QTableColumn<PveRecord>[]>(() => {
  const base: QTableColumn<PveRecord>[] = [
    { name: 'name', label: gettext('Name'), align: 'left', field: (row) => formatStorageContent(row.volid), sortable: true, sort: (a, b) => textValue(a).localeCompare(textValue(b), undefined, { numeric: true }) },
    { name: 'notes', label: gettext('Notes'), align: 'left', field: (row) => textValue(row.notes), sortable: true },
    { name: 'protected', label: gettext('Protected'), align: 'left', field: (row) => Number(row.protected) ? gettext('Yes') : gettext('No'), sortable: true },
    { name: 'date', label: gettext('Date'), align: 'left', field: formatContentDate, sortable: true, sort: (a, b) => textValue(a).localeCompare(textValue(b), undefined, { numeric: true }) },
    { name: 'format', label: gettext('Format'), align: 'left', field: (row) => textValue(row.format, '-'), sortable: true },
    { name: 'size', label: gettext('Size'), align: 'left', field: formatContentSize, sortable: true },
  ];
  if (isPbs.value) base.push(
    { name: 'encrypted', label: gettext('Encrypted'), align: 'left', field: (row) => row.encrypted ? gettext('Yes') : gettext('No'), sortable: true },
    { name: 'verification', label: gettext('Verify State'), align: 'left', field: (row) => textValue((row.verification as PveRecord | undefined)?.state, '-'), sortable: true },
  );
  return base;
});

async function reload() {
  if (!props.node || !props.storage) { rows.value = []; return; }
  loading.value = true;
  try {
    const response = await getStorageContent(props.node, props.storage, 'backup');
    rows.value = [...(response.data || [])].sort((a, b) => Number(b.vdate || b.ctime || 0) - Number(a.vdate || a.ctime || 0));
    selected.value = [];
  } finally { loading.value = false; }
}

function rowClick(_: Event, row: PveRecord) { selected.value = selected.value[0] === row ? [] : [row]; }
async function showConfiguration() {
  if (!selectedVolid.value) return;
  loading.value = true;
  try { configuration.value = String((await getVmBackupConfiguration(props.node, selectedVolid.value)).data || ''); configVisible.value = true; }
  finally { loading.value = false; }
}
function openNotes() { notes.value = textValue(selectedRow.value?.notes); notesVisible.value = true; }
async function saveNotes() {
  if (!selectedVolid.value) return;
  loading.value = true;
  try { await updateStorageContent(props.node, props.storage, selectedVolid.value, { notes: notes.value }); notesVisible.value = false; await reload(); }
  finally { loading.value = false; }
}
async function toggleProtection() {
  if (!selectedRow.value || !selectedVolid.value) return;
  loading.value = true;
  try { await updateStorageContent(props.node, props.storage, selectedVolid.value, { protected: Number(selectedRow.value.protected) ? 0 : 1 }); await reload(); }
  finally { loading.value = false; }
}
function openRestore() {
  if (!canRestore.value) return;
  Object.assign(restoreForm, { vmid: '', storage: '', bwlimit: '', unique: false, haManaged: false, name: '', cores: '', memory: '', sockets: '', unprivileged: 'keep', start: false, liveRestore: false });
  Object.assign(restorePlaceholders, { name: '', cores: '', memory: '', sockets: '' });
  void loadRestoreDefaults();
}
function applyRestoreConfiguration(value: string) {
  let allStoragesAvailable = true;
  value.split('\n').forEach((line) => {
    const match = line.match(/^([^:]+):\s*(\S+)\s*$/);
    if (!match) return;
    const key = match[1] || '';
    const configValue = match[2] || '';
    if (key === 'name' || key === 'hostname') restorePlaceholders.name = configValue;
    if (key === 'memory') restorePlaceholders.memory = configValue;
    if (key === 'cores') restorePlaceholders.cores = configValue;
    if (key === 'sockets') restorePlaceholders.sockets = configValue;
    if (key.startsWith('scsi') || key.startsWith('sata') || key.startsWith('virtio') || key === 'rootfs') {
      const storageHint = configValue.split(':')[0] || '';
      allStoragesAvailable = allStoragesAvailable && restoreStorages.value.some((row) => textValue(row.storage) === storageHint);
    }
  });
  if (!allStoragesAvailable && !restoreForm.storage) restoreForm.storage = textValue(restoreStorages.value[0]?.storage);
}
async function loadRestoreDefaults() {
  loading.value = true;
  try {
    const content = guestType.value === 'lxc' ? 'rootdir' : 'images';
    const [nextId, storages, config] = await Promise.all([getNextVmId(), getNodeStorage(props.node, content), getVmBackupConfiguration(props.node, selectedVolid.value)]);
    restoreForm.vmid = textValue(nextId.data);
    restoreStorages.value = storages.data || [];
    applyRestoreConfiguration(String(config.data || ''));
    if (guestType.value === 'lxc' && !restoreForm.storage) restoreForm.storage = textValue(restoreStorages.value[0]?.storage);
    restoreVisible.value = true;
  } finally { loading.value = false; }
}
function openFileRestore() { if (isPbs.value && selectedVolid.value) fileRestoreVisible.value = true; }
async function restore() {
  if (!canRestore.value || !restoreForm.vmid || !guestType.value) return;
  loading.value = true;
  try {
    if (guestType.value === 'lxc' && !restoreForm.storage) return;
    const isLxc = guestType.value === 'lxc';
    const response = await restoreVmBackup(props.node, { vmid: restoreForm.vmid, ...(isLxc ? { ostemplate: selectedVolid.value, restore: 1, storage: restoreForm.storage, ...(restoreForm.name.trim() ? { hostname: restoreForm.name.trim() } : {}), ...(restoreForm.unprivileged === 'keep' ? {} : { unprivileged: restoreForm.unprivileged === '1' ? 1 : 0 }) } : { archive: selectedVolid.value, ...(restoreForm.storage ? { storage: restoreForm.storage } : {}), ...(restoreForm.name.trim() ? { name: restoreForm.name.trim() } : {}), ...(restoreForm.sockets ? { sockets: Number(restoreForm.sockets) } : {}) }), ...(restoreForm.bwlimit ? { bwlimit: Number(restoreForm.bwlimit) } : {}), unique: restoreForm.unique ? 1 : 0, force: 0, ...(restoreForm.cores ? { cores: Number(restoreForm.cores) } : {}), ...(restoreForm.memory ? { memory: Number(restoreForm.memory) } : {}), ...(restoreForm.haManaged ? { 'ha-managed': 1 } : {}), ...(restoreForm.start && !restoreForm.liveRestore ? { start: 1 } : {}), ...(restoreForm.liveRestore && isPbs.value && !isLxc ? { 'live-restore': 1 } : {}) }, guestType.value);
    restoreVisible.value = false;
    taskUpid.value = String(response.data || '');
    taskTitle.value = gettext('Restore');
    taskVisible.value = !!taskUpid.value;
  } finally { loading.value = false; }
}
async function previewPrune() {
  if (!guestType.value || !selectedRow.value?.vmid) return;
  loading.value = true;
  try { pruneRows.value = addKeepReasons((await previewStorageBackupPrune(props.node, props.storage, pruneParams.value)).data || []); }
  finally { loading.value = false; }
}
async function openPrune() {
  if (!guestType.value || !selectedRow.value?.vmid) return;
  Object.assign(pruneForm, { last: '', hourly: '', daily: '', weekly: '', monthly: '', yearly: '' });
  pruneRows.value = [];
  pruneVisible.value = true;
  await previewPrune();
}
async function prune() {
  if (!guestType.value || !selectedRow.value?.vmid) return;
  loading.value = true;
  try { taskUpid.value = String((await pruneStorageBackups(props.node, props.storage, pruneParams.value)).data || ''); taskTitle.value = gettext('Prune'); pruneVisible.value = false; taskVisible.value = !!taskUpid.value; await reload(); }
  finally { loading.value = false; }
}
function keepReason(row: PveRecord) {
  if (row.mark === 'protected') return `${gettext('Yes')} (protected)`;
  if (row.mark === 'renamed') return `${gettext('Yes')} (renamed)`;
  return row.mark === 'keep' ? `${gettext('Yes')} (${textValue(row.keepReason) || gettext('keep-all')})` : gettext('No');
}
function addKeepReasons(backups: PveRecord[]) {
  const rules = ['keep-last', 'keep-hourly', 'keep-daily', 'keep-weekly', 'keep-monthly', 'keep-yearly'];
  const nextRows = [...backups].sort((left, right) => Number(right.ctime) - Number(left.ctime));
  let ruleIndex = -1;
  let currentRule = 'keep-all';
  let count = 0;
  const nextRule = () => {
    do { ruleIndex += 1; } while (ruleIndex < rules.length && !pruneForm[rules[ruleIndex]!.replace('keep-', '') as keyof typeof pruneForm]);
    currentRule = rules[ruleIndex] || 'keep-all';
    count = 0;
  };
  nextRule();
  return nextRows.map((backup) => {
    if (backup.mark !== 'keep') return backup;
    count += 1;
    const reason = currentRule === 'keep-all' ? currentRule : `${currentRule}: ${count}`;
    const limit = Number(pruneForm[currentRule.replace('keep-', '') as keyof typeof pruneForm]);
    if (currentRule !== 'keep-all' && count >= limit) nextRule();
    return { ...backup, keepReason: reason };
  });
}
const pruneColumns = computed<QTableColumn<PveRecord>[]>(() => [
  { name: 'ctime', label: gettext('Backup Time'), field: (row) => row.ctime ? new Date(Number(row.ctime) * 1000).toLocaleString() : '-', align: 'left' },
  { name: 'keep', label: gettext('Keep (reason)'), field: keepReason, align: 'left' },
]);
function remove() {
  if (!selectedRow.value || Number(selectedRow.value.protected)) return;
  Dialog.create({ title: gettext('Confirm'), message: gettext('Are you sure to delete [%s]?').replace('%s', selectedVolid.value), cancel: true, persistent: true }).onOk(() => void import('@/api/storageContent').then(({ deleteStorageContent }) => deleteStorageContent(props.node, props.storage, selectedVolid.value)).then(reload));
}
watch(() => props.active, (active) => { if (active) void reload(); }, { immediate: true });
</script>

<template>
  <q-table flat row-key="volid" table-header-class="u-table-header" selection="single" :rows="rows" :columns="columns" :selected="selected" :filter="filter" :pagination="{ page: 1, rowsPerPage: 10, sortBy: 'date', descending: true }" :rows-per-page-options="[10]" :loading="loading" :no-data-label="gettext('no record can be found')" @row-click="rowClick" @update:selected="selected = [...$event]">
    <template #top>
      <div class="row q-gutter-sm">
        <q-btn no-caps outline size="12px" color="primary" class="u-button" :disable="!canRestore" :label="gettext('Restore')" @click="openRestore" />
        <q-btn v-if="isPbs" no-caps outline size="12px" class="u-button" :disable="!selectedRow" :label="gettext('File Restore')" @click="openFileRestore" />
        <q-btn no-caps outline size="12px" class="u-button" :disable="!selectedRow" :label="gettext('Show Configuration')" @click="showConfiguration" />
        <q-btn no-caps outline size="12px" class="u-button" :disable="!selectedRow" :label="gettext('Edit Notes')" @click="openNotes" />
        <q-btn no-caps outline size="12px" class="u-button" :disable="!selectedRow" :label="gettext('Change Protection')" @click="toggleProtection" />
        <q-btn no-caps outline size="12px" class="u-button" :disable="!guestType || !selectedRow?.vmid" :label="pruneLabel" @click="openPrune" />
        <q-btn no-caps outline size="12px" class="u-button" :color="selectedRow && !Number(selectedRow.protected) ? 'red' : 'grey'" :disable="!selectedRow || !!Number(selectedRow.protected)" :label="gettext('Remove')" @click="remove" />
      </div>
      <q-space />
      <q-input v-model="filter" borderless dense debounce="300" :placeholder="gettext('Search')"><template #append><q-icon name="search" /></template></q-input>
    </template>
  </q-table>
  <q-dialog v-model="notesVisible" persistent><UWindow :title="gettext('Notes')" width="600px" :loading="loading"><div class="q-pa-md"><q-input v-model="notes" type="textarea" autogrow outlined dense /></div><template #foot><q-btn v-close-popup no-caps flat :label="gettext('Cancel')" /><q-btn no-caps flat color="primary" :label="gettext('OK')" @click="saveNotes" /></template></UWindow></q-dialog>
  <q-dialog v-model="configVisible"><UWindow :title="gettext('Show Configuration')" width="640px"><pre class="q-pa-md backup-config">{{ configuration }}</pre></UWindow></q-dialog>
  <q-dialog v-model="restoreVisible" persistent><UWindow :title="gettext('Restore')" width="640px" :loading="loading"><div class="q-pa-md"><div class="row q-col-gutter-md"><q-input v-model="restoreForm.vmid" class="col-6" dense outlined :label="guestType === 'lxc' ? gettext('CT ID') : gettext('VM ID')" /><q-input v-model="restoreForm.name" class="col-6" dense outlined :placeholder="restorePlaceholders.name" :label="guestType === 'lxc' ? gettext('Hostname') : gettext('Name')" /><q-select v-model="restoreForm.storage" class="col-12" dense outlined emit-value map-options :clearable="guestType !== 'lxc'" :options="restoreStorages.map((row) => ({ label: textValue(row.storage), value: textValue(row.storage) }))" :label="gettext('Target Storage')" /><q-input v-model="restoreForm.cores" class="col-4" dense outlined type="number" :placeholder="restorePlaceholders.cores" :label="gettext('Cores')" /><q-input v-if="guestType === 'qemu'" v-model="restoreForm.sockets" class="col-4" dense outlined type="number" :placeholder="restorePlaceholders.sockets" :label="gettext('Sockets')" /><q-input v-model="restoreForm.memory" :class="guestType === 'qemu' ? 'col-4' : 'col-8'" dense outlined type="number" :placeholder="restorePlaceholders.memory" :label="gettext('Memory (MiB)')" /><q-input v-model="restoreForm.bwlimit" class="col-6" dense outlined type="number" :label="gettext('Bandwidth Limit (KiB/s)')" /><q-select v-if="guestType === 'lxc'" v-model="restoreForm.unprivileged" class="col-6" dense outlined emit-value map-options :label="gettext('Privilege Level')" :options="[{ label: gettext('From Backup'), value: 'keep' }, { label: gettext('Unprivileged'), value: '1' }, { label: gettext('Privileged'), value: '0' }]" /><div class="col-6"><q-checkbox v-model="restoreForm.unique" dense :label="gettext('Unique')" /></div><div class="col-6"><q-checkbox v-model="restoreForm.haManaged" dense :label="gettext('Add to HA')" /></div><div class="col-6"><q-checkbox v-model="restoreForm.start" dense :disable="restoreForm.liveRestore" :label="gettext('Start after restore')" /></div><div v-if="isPbs && guestType === 'qemu'" class="col-6"><q-checkbox v-model="restoreForm.liveRestore" dense :label="gettext('Live restore')" /></div></div></div><template #foot><q-btn v-close-popup no-caps flat :label="gettext('Cancel')" /><q-btn no-caps flat color="primary" :disable="!restoreForm.vmid || (guestType === 'lxc' && !restoreForm.storage)" :label="gettext('Restore')" @click="restore" /></template></UWindow></q-dialog>
  <q-dialog v-model="pruneVisible" persistent><UWindow :title="pruneTitle" width="760px" :loading="loading"><div class="q-pa-md q-gutter-md"><div class="row q-col-gutter-sm"><q-input v-model="pruneForm.last" class="col-4" type="number" dense outlined :label="gettext('keep-last')" @update:model-value="previewPrune" /><q-input v-model="pruneForm.hourly" class="col-4" type="number" dense outlined :label="gettext('keep-hourly')" @update:model-value="previewPrune" /><q-input v-model="pruneForm.daily" class="col-4" type="number" dense outlined :label="gettext('keep-daily')" @update:model-value="previewPrune" /><q-input v-model="pruneForm.weekly" class="col-4" type="number" dense outlined :label="gettext('keep-weekly')" @update:model-value="previewPrune" /><q-input v-model="pruneForm.monthly" class="col-4" type="number" dense outlined :label="gettext('keep-monthly')" @update:model-value="previewPrune" /><q-input v-model="pruneForm.yearly" class="col-4" type="number" dense outlined :label="gettext('keep-yearly')" @update:model-value="previewPrune" /></div><q-table flat dense row-key="volid" :rows="pruneRows" :columns="pruneColumns" :pagination="{ rowsPerPage: 5 }" /></div><template #foot><q-btn v-close-popup no-caps flat :label="gettext('Cancel')" /><q-btn no-caps flat color="primary" :label="gettext('Prune')" @click="prune" /></template></UWindow></q-dialog>
  <TaskOutputDialog v-model="taskVisible" :node="node" :upid="taskUpid" :title="taskTitle" @finished="reload" />
  <StorageFileRestoreDialog v-model="fileRestoreVisible" :storage="storage" :volume="selectedVolid" :vm-archive="guestType === 'qemu'" />
</template>

<style scoped>
.backup-config { max-height: 520px; margin: 0; overflow: auto; font-family: monospace; white-space: pre-wrap; }
</style>
