<script setup lang="ts">
import { useQuasar, type QTableColumn } from 'quasar';
import { computed, reactive, shallowRef, watch } from 'vue';
import type { PveRecord } from '@/api/resources';
import {
  getNodeStorage,
  getStorageContent,
  getStorageBackupFileDownloadUrl,
  listStorageBackupFiles,
  deleteStorageContent,
  updateStorageContent,
} from '@/api/storageContent';
import SelectTable from '@/components/SelectTable.vue';
import UsageProgress from '@/components/UsageProgress.vue';
import UWindow from '@/components/UWindow.vue';
import { gettext } from '@/locale';
import { useSessionStore } from '@/stores/session';
import { formatBytes, textValue, usedPercent } from '@/utils/pveFormat';
import {
  getVmBackupConfiguration,
  getVmBackupDefaults,
  restoreVmBackup,
  runVmBackup,
} from '@/api/vm';

const props = withDefaults(
  defineProps<{ node: string; vmid: string; guestType?: 'qemu' | 'lxc' }>(),
  { guestType: 'qemu' }
);
const emit = defineEmits<{ task: [node: string, upid: string, title: string] }>();
const $q = useQuasar();
const session = useSessionStore();
const loading = shallowRef(false);
const backupVisible = shallowRef(false);
const removeVisible = shallowRef(false);
const restoreVisible = shallowRef(false);
const configurationVisible = shallowRef(false);
const notesVisible = shallowRef(false);
const fileRestoreVisible = shallowRef(false);
const configuration = shallowRef('');
const notes = shallowRef('');
const storages = shallowRef<PveRecord[]>([]);
const restoreStorages = shallowRef<PveRecord[]>([]);
const rows = shallowRef<PveRecord[]>([]);
const selected = shallowRef<PveRecord[]>([]);
const listStorage = shallowRef('');
const filterVmid = shallowRef(true);
const search = shallowRef('');
const fileRestorePath = shallowRef('');
const fileRestoreRows = shallowRef<PveRecord[]>([]);
const restoreTargetRequired = shallowRef(false);
const backupDefaultsInitialized = shallowRef(false);
const form = reactive<{
  storage: string;
  mode: 'snapshot' | 'suspend' | 'stop';
  compress: 'zstd' | 'lzo' | 'gzip' | '0';
  protected: boolean;
  notificationMode: 'notification-system' | 'legacy-sendmail';
  mailto: string;
  remove: boolean;
  notesTemplate: string;
}>({
  storage: '',
  mode: 'snapshot',
  compress: 'zstd',
  protected: false,
  notificationMode: 'notification-system',
  mailto: '',
  remove: false,
  notesTemplate: '{{guestname}}',
});
const pruneKeep = reactive<Record<string, string>>({});
const pruneVisible = shallowRef(false);
const restoreForm = reactive({
  vmid: '',
  storage: '',
  bwlimit: '',
  unique: false,
  haManaged: false,
  name: '',
  cores: '',
  memory: '',
  sockets: '',
  start: false,
  liveRestore: false,
});
const restorePlaceholders = reactive({
  name: '',
  cores: '',
  memory: '',
  sockets: '',
});
const vmCaps = computed(
  () => (session.caps as unknown as { vms?: Record<string, unknown> }).vms || {}
);
const canBackup = computed(() => Boolean(vmCaps.value['VM.Backup']));
const canRestore = computed(() => Boolean(vmCaps.value['VM.Allocate']));

const storageColumns = computed<QTableColumn<PveRecord>[]>(() => [
  {
    name: 'storage',
    label: gettext('Storage'),
    field: (row) => textValue(row.storage),
    align: 'left',
    sortable: true,
  },
  {
    name: 'type',
    label: gettext('Type'),
    field: (row) => textValue(row.type, '-'),
    align: 'left',
    sortable: true,
  },
  {
    name: 'avail',
    label: gettext('Avail Size'),
    field: (row) => formatBytes(row.avail as number),
    align: 'left',
    sortable: true,
  },
  {
    name: 'used',
    label: gettext('Used'),
    field: (row) => usedPercent(row.used as number, row.total as number),
    align: 'left',
    sortable: true,
  },
  {
    name: 'active',
    label: gettext('Active'),
    field: (row) => (Number(row.active) ? gettext('Yes') : gettext('No')),
    align: 'left',
    sortable: true,
  },
]);
const columns = computed<QTableColumn<PveRecord>[]>(() => [
  {
    name: 'volid',
    label: gettext('Name'),
    field: (row) => textValue(row.volid),
    align: 'left',
    sortable: true,
  },
  {
    name: 'notes',
    label: gettext('Notes'),
    field: (row) => textValue(row.notes),
    align: 'left',
    sortable: true,
  },
  {
    name: 'protected',
    label: gettext('Protected'),
    field: (row) => (Number(row.protected) === 1 ? gettext('Yes') : gettext('No')),
    align: 'left',
    sortable: true,
  },
  ...(selectedStorageType.value === 'pbs'
    ? [
        {
          name: 'encrypted',
          label: gettext('Encrypted'),
          field: (row: PveRecord) => formatEncryption(row.encrypted),
          align: 'left' as const,
          sortable: true,
        },
        {
          name: 'verification',
          label: gettext('Verify State'),
          field: (row: PveRecord) => formatVerification(row.verification),
          align: 'left' as const,
          sortable: true,
        },
      ]
    : []),
  { name: 'format', label: gettext('Format'), field: 'format', align: 'left', sortable: true },
  {
    name: 'size',
    label: gettext('Size'),
    field: (row) => formatBytes(row.size as number),
    align: 'left',
    sortable: true,
  },
  {
    name: 'ctime',
    label: gettext('Backup Time'),
    field: (row) => formatTime(row.ctime),
    align: 'left',
    sortable: true,
  },
]);
const currentStorage = computed(() => listStorage.value);
const storageDisplayValue = computed(() => {
  const selectedStorage = storages.value.find(
    (item) => textValue(item.storage) === listStorage.value
  );
  return textValue(selectedStorage?.storage, listStorage.value);
});
const backupStorageDisplayValue = computed(() => {
  const selectedStorage = storages.value.find((item) => textValue(item.storage) === form.storage);
  return textValue(selectedStorage?.storage, form.storage);
});
const selectedRow = computed(() => selected.value[0]);
const selectedStorageType = computed(() => {
  const selectedStorage = storages.value.find(
    (item) => textValue(item.storage) === listStorage.value
  );
  return textValue(selectedStorage?.type);
});
const selectedBackupFormat = computed(() => textValue(selectedRow.value?.format));
const selectedBackupVolid = computed(() => textValue(selectedRow.value?.volid));
const isPbsBackup = computed(
  () => selectedStorageType.value === 'pbs' || selectedBackupFormat.value === 'pbs-vm'
);
const backupStorageType = computed(() => {
  const selectedStorage = storages.value.find((item) => textValue(item.storage) === form.storage);
  return textValue(selectedStorage?.type);
});
const isBackupStoragePbs = computed(() => backupStorageType.value === 'pbs');
const backupCompressDisabled = computed(() => isBackupStoragePbs.value);
const displayedRows = computed(() => {
  const vmid = textValue(props.vmid);
  const needle = search.value.trim().toLowerCase();
  return rows.value
    .filter(isGuestBackup)
    .filter((row) => !filterVmid.value || backupVmid(row) === vmid)
    .filter((row) => !needle || textValue(row.volid).toLowerCase().includes(needle))
    .sort((a, b) => {
      const vmidCompare = backupVmid(a).localeCompare(backupVmid(b), undefined, { numeric: true });
      return vmidCompare || Number(b.ctime || 0) - Number(a.ctime || 0);
    });
});
const restoreValid = computed(() => {
  const name = restoreForm.name.trim();
  const validName = !name || isDnsName(name);
  const validInteger = (value: string, min: number, max: number) =>
    !value || (Number.isInteger(Number(value)) && Number(value) >= min && Number(value) <= max);
  const validBandwidth =
    !restoreForm.bwlimit ||
    (Number.isInteger(Number(restoreForm.bwlimit)) && Number(restoreForm.bwlimit) >= 0);
  return (
    validName &&
    validInteger(restoreForm.cores, 1, 128) &&
    validInteger(restoreForm.sockets, 1, 4) &&
    validInteger(restoreForm.memory, 32, 4178944) &&
    validBandwidth &&
    (!restoreTargetRequired.value || Boolean(restoreForm.storage))
  );
});
const notesTemplateVariables = '{{cluster}}, {{guestname}}, {{node}}, {{vmid}}';
const restoreStorageDisplayValue = computed(() => {
  const selectedStorage = restoreStorages.value.find(
    (item) => textValue(item.storage) === restoreForm.storage
  );
  return textValue(
    selectedStorage?.storage,
    restoreForm.storage || gettext('From backup configuration')
  );
});
const pruneKeepRows = computed(() =>
  [
    ['keep-last', gettext('Keep Last')],
    ['keep-hourly', gettext('Keep Hourly')],
    ['keep-daily', gettext('Keep Daily')],
    ['keep-weekly', gettext('Keep Weekly')],
    ['keep-monthly', gettext('Keep Monthly')],
    ['keep-yearly', gettext('Keep Yearly')],
  ]
    .map(([key, label]) => ({ key, label, value: pruneKeep[String(key)] || '' }))
    .filter((item) => item.value)
);

function formatTime(value: unknown) {
  const seconds = Number(value);
  return Number.isFinite(seconds) && seconds > 0 ? new Date(seconds * 1000).toLocaleString() : '-';
}

function isDnsName(value: string) {
  return /^(?=.{1,253}$)(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)(?:\.(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?))*$/.test(
    value
  );
}

function formatEncryption(value: unknown) {
  const encrypted = textValue(value).toLowerCase();
  if (!encrypted || encrypted === '0' || encrypted === 'none') return gettext('No');
  return encrypted === '1' || encrypted === 'yes' ? gettext('Yes') : encrypted;
}

function formatVerification(value: unknown) {
  const verification = textValue(value);
  if (!verification) return '-';
  return verification.replace(/-/g, ' ');
}

function sortByAvailDesc(items: PveRecord[]) {
  return [...items].sort((a, b) => Number(b.avail || 0) - Number(a.avail || 0));
}

function backupVmid(row: PveRecord) {
  const rowVmid = textValue(row.vmid);
  const volid = textValue(row.volid);
  return rowVmid || volid.match(/vzdump-qemu-(\d+)/)?.[1] || '';
}

function isGuestBackup(row: PveRecord) {
  const volid = textValue(row.volid);
  const format = textValue(row.format);
  const subtype = textValue(row.subtype);
  const isGuestBackup =
    format === 'pbs-vm' ||
    subtype === props.guestType ||
    new RegExp(`:backup/vzdump-${props.guestType}-`).test(volid);
  return isGuestBackup;
}

function parsePropertyString(value: unknown) {
  return textValue(value)
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
    .reduce<Record<string, string>>((result, part) => {
      const separator = part.indexOf('=');
      if (separator === -1) {
        result[part] = '1';
        return result;
      }
      result[part.slice(0, separator)] = part.slice(separator + 1);
      return result;
    }, {});
}

function escapeNotesTemplate(value: string) {
  return value.replace(/\\/g, '\\\\').replace(/\n/g, '\\n');
}

function unescapeNotesTemplate(value: unknown) {
  return textValue(value).replace(/\\n/g, '\n').replace(/\\\\/g, '\\');
}

async function refreshRows(preserveSelection = false) {
  const selectedVolid = preserveSelection ? selectedBackupVolid.value : '';
  if (!props.node || !currentStorage.value) {
    rows.value = [];
    return;
  }
  loading.value = true;
  try {
    const response = await getStorageContent(props.node, currentStorage.value, 'backup');
    rows.value = response.data || [];
    selected.value = selectedVolid
      ? rows.value.filter((row) => textValue(row.volid) === selectedVolid)
      : [];
  } finally {
    loading.value = false;
  }
}

async function loadStorages() {
  if (!props.node) return;
  loading.value = true;
  try {
    const response = await getNodeStorage(props.node, 'backup');
    storages.value = sortByAvailDesc(response.data || []);
    if (!storages.value.some((item) => textValue(item.storage) === listStorage.value)) {
      listStorage.value = textValue(storages.value[0]?.storage);
    }
    await refreshRows();
  } finally {
    loading.value = false;
  }
}

async function loadBackupDefaults() {
  if (!props.node || !form.storage) return;
  const response = await getVmBackupDefaults(props.node, form.storage);
  const data = response.data || {};
  if (!backupDefaultsInitialized.value) {
    const notificationMode = textValue(data['notification-mode'], 'auto');
    const mailto = textValue(data.mailto);
    form.notificationMode =
      notificationMode === 'legacy-sendmail' || (notificationMode === 'auto' && mailto)
        ? 'legacy-sendmail'
        : 'notification-system';
    form.mailto = mailto;
    const defaultMode = textValue(data.mode);
    if (defaultMode === 'snapshot' || defaultMode === 'suspend' || defaultMode === 'stop') {
      form.mode = defaultMode;
    }
    if (data['notes-template']) form.notesTemplate = unescapeNotesTemplate(data['notes-template']);
    backupDefaultsInitialized.value = true;
  }

  Object.keys(pruneKeep).forEach((key) => delete pruneKeep[key]);
  const keepParams = parsePropertyString(data['prune-backups']);
  if (Object.keys(keepParams).length && !keepParams['keep-all']) {
    Object.assign(pruneKeep, keepParams);
    pruneVisible.value = true;
  } else {
    pruneVisible.value = false;
    form.remove = false;
  }

  if (isBackupStoragePbs.value) {
    form.compress = 'zstd';
  }
}

async function loadRestoreStorages() {
  if (!props.node) return;
  const response = await getNodeStorage(props.node, 'images');
  restoreStorages.value = response.data || [];
  if (
    restoreForm.storage &&
    !restoreStorages.value.some((item) => textValue(item.storage) === restoreForm.storage)
  ) {
    restoreForm.storage = '';
  }
}

function resetRestorePlaceholders() {
  restorePlaceholders.name = '';
  restorePlaceholders.cores = '';
  restorePlaceholders.memory = '';
  restorePlaceholders.sockets = '';
}

function applyRestoreConfiguration(value: string) {
  let allStoragesAvailable = true;
  value.split('\n').forEach((line) => {
    const match = line.match(/^([^:]+):\s*(\S+)\s*$/);
    if (!match) return;
    const [, key, configValue] = match;
    if (!key || configValue === undefined) return;

    if (key === '#qmdump#map') {
      const mapMatch = configValue.match(/^(\S+):(\S+):(\S*):(\S*):$/);
      const storageHint = mapMatch?.[3] || '';
      allStoragesAvailable =
        allStoragesAvailable &&
        Boolean(
          storageHint &&
          restoreStorages.value.some((item) => textValue(item.storage) === storageHint)
        );
      return;
    }

    if (key === 'name') restorePlaceholders.name = configValue;
    if (key === 'memory') restorePlaceholders.memory = configValue;
    if (key === 'cores') restorePlaceholders.cores = configValue;
    if (key === 'sockets') restorePlaceholders.sockets = configValue;
  });

  restoreTargetRequired.value = !allStoragesAvailable;
}

async function loadRestoreDefaults() {
  const volume = selectedBackupVolid.value;
  resetRestorePlaceholders();
  if (!props.node || !volume) return;
  const response = await getVmBackupConfiguration(props.node, volume);
  applyRestoreConfiguration(String(response.data || ''));
}

async function openBackup() {
  if (!canBackup.value || !listStorage.value) return;
  loading.value = true;
  try {
    form.storage = listStorage.value;
    backupDefaultsInitialized.value = false;
    await loadBackupDefaults();
    backupVisible.value = true;
  } finally {
    loading.value = false;
  }
}

async function openRestore() {
  if (!canRestore.value || !selectedRow.value) return;
  restoreForm.vmid = props.vmid;
  restoreForm.storage = '';
  restoreForm.bwlimit = '';
  restoreForm.unique = false;
  restoreForm.haManaged = false;
  restoreForm.name = '';
  restoreForm.cores = '';
  restoreForm.memory = '';
  restoreForm.sockets = '';
  restoreForm.start = false;
  restoreForm.liveRestore = false;
  restoreTargetRequired.value = false;
  loading.value = true;
  try {
    await loadRestoreStorages();
    await loadRestoreDefaults();
    restoreVisible.value = true;
  } finally {
    loading.value = false;
  }
}

function openNotes() {
  if (!selectedRow.value) return;
  notes.value = textValue(selectedRow.value.notes);
  notesVisible.value = true;
}

async function saveNotes() {
  const volid = textValue(selectedRow.value?.volid);
  if (!canBackup.value || !volid || !listStorage.value) return;
  loading.value = true;
  try {
    await updateStorageContent(props.node, listStorage.value, volid, { notes: notes.value });
    notesVisible.value = false;
    await refreshRows();
  } finally {
    loading.value = false;
  }
}

async function toggleProtection() {
  const volid = textValue(selectedRow.value?.volid);
  if (!canBackup.value || !volid || !listStorage.value) return;
  loading.value = true;
  try {
    await updateStorageContent(props.node, listStorage.value, volid, {
      protected: Number(selectedRow.value?.protected) ? 0 : 1,
    });
    await refreshRows(true);
  } finally {
    loading.value = false;
  }
}

async function showConfiguration() {
  const volume = textValue(selectedRow.value?.volid);
  if (!volume) return;
  loading.value = true;
  configuration.value = '';
  try {
    const response = await getVmBackupConfiguration(props.node, volume);
    configuration.value = String(response.data || '');
    configurationVisible.value = true;
  } finally {
    loading.value = false;
  }
}

async function executeRestore() {
  const archive = textValue(selectedRow.value?.volid);
  if (!canRestore.value || !archive || !props.vmid || !restoreValid.value) return;
  loading.value = true;
  try {
    const data: {
      vmid: string;
      archive: string;
      storage?: string;
      bwlimit?: number;
      unique: 0 | 1;
      force: 0 | 1;
      name?: string;
      cores?: number;
      memory?: number;
      sockets?: number;
      start?: 0 | 1;
      'live-restore'?: 0 | 1;
      'ha-managed'?: 0 | 1;
    } = {
      vmid: props.vmid,
      archive,
      unique: restoreForm.unique ? 1 : 0,
      force: 1,
      ...(restoreForm.start && !restoreForm.liveRestore ? { start: 1 } : {}),
      ...(restoreForm.liveRestore && isPbsBackup.value ? { 'live-restore': 1 } : {}),
      ...(restoreForm.haManaged ? { 'ha-managed': 1 } : {}),
    };
    if (restoreForm.storage) data.storage = restoreForm.storage;
    if (restoreForm.bwlimit) data.bwlimit = Number(restoreForm.bwlimit) * 1024;
    if (restoreForm.name.trim()) data.name = restoreForm.name.trim();
    if (restoreForm.cores) data.cores = Number(restoreForm.cores);
    if (restoreForm.memory) data.memory = Number(restoreForm.memory);
    if (restoreForm.sockets) data.sockets = Number(restoreForm.sockets);
    const response = await restoreVmBackup(props.node, data, props.guestType);
    restoreVisible.value = false;
    emit('task', props.node, String(response.data || ''), gettext('Restore'));
  } finally {
    loading.value = false;
  }
}

function restore() {
  if (!canRestore.value || !selectedBackupVolid.value || !props.vmid || !restoreValid.value) return;
  $q.dialog({
    title: gettext('Confirm'),
    message: `${gettext('Restore')} VM ${props.vmid}. ${gettext('This will permanently erase current VM data.')}`,
    persistent: true,
    ok: { flat: true, label: gettext('Confirm'), color: 'primary' },
    cancel: { flat: true, label: gettext('Cancel') },
  }).onOk(() => {
    void executeRestore();
  });
}

async function backupNow() {
  if (!canBackup.value || !form.storage) return;
  loading.value = true;
  try {
    const data: {
      storage: string;
      mode: 'snapshot' | 'suspend' | 'stop';
      compress?: 'zstd' | 'lzo' | 'gzip' | '0';
      protected?: 0 | 1;
      remove?: 0 | 1;
      mailto?: string;
      'notification-mode'?: string;
      'notes-template'?: string;
    } = {
      storage: form.storage,
      mode: form.mode,
      compress: form.compress,
      remove: form.remove ? 1 : 0,
      'notification-mode': form.notificationMode,
      protected: form.protected ? 1 : 0,
    };
    if (form.notificationMode === 'legacy-sendmail' && form.mailto.trim()) {
      data.mailto = form.mailto.trim();
    }
    if (form.notesTemplate.trim()) {
      data['notes-template'] = escapeNotesTemplate(form.notesTemplate.trim());
    }
    const response = await runVmBackup(props.node, props.vmid, {
      ...data,
    });
    backupVisible.value = false;
    emit('task', props.node, String(response.data || ''), gettext('Backup'));
  } finally {
    loading.value = false;
  }
}

async function removeBackup() {
  const volid = textValue(selectedRow.value?.volid);
  if (!canBackup.value || !volid || !listStorage.value) return;
  loading.value = true;
  try {
    await deleteStorageContent(props.node, listStorage.value, volid, 5);
    removeVisible.value = false;
    await refreshRows();
  } finally {
    loading.value = false;
  }
}

async function openFileRestore() {
  if (!isPbsBackup.value || !selectedBackupVolid.value || !listStorage.value) return;
  fileRestorePath.value = '';
  fileRestoreRows.value = [];
  fileRestoreVisible.value = true;
  await loadFileRestorePath();
}

async function loadFileRestorePath(filepath = fileRestorePath.value) {
  if (!listStorage.value || !selectedBackupVolid.value) return;
  loading.value = true;
  try {
    const response = await listStorageBackupFiles(
      listStorage.value,
      selectedBackupVolid.value,
      filepath
    );
    fileRestorePath.value = filepath;
    fileRestoreRows.value = response.data || [];
  } finally {
    loading.value = false;
  }
}

function fileRestoreEntryPath(entry: PveRecord) {
  return textValue(entry.filepath || entry.path || entry.text || entry.name);
}

function isFileRestoreDirectory(entry: PveRecord) {
  return ['d', 'directory', 'dir'].includes(textValue(entry.type).toLowerCase());
}

function openFileRestoreEntry(entry: PveRecord) {
  const filepath = fileRestoreEntryPath(entry);
  if (isFileRestoreDirectory(entry) && filepath) void loadFileRestorePath(filepath);
}

function downloadFileRestoreEntry(entry: PveRecord) {
  const filepath = fileRestoreEntryPath(entry);
  if (!filepath || isFileRestoreDirectory(entry)) return;
  window.open(
    getStorageBackupFileDownloadUrl(listStorage.value, selectedBackupVolid.value, filepath, 'all'),
    '_blank',
    'noopener'
  );
}

watch(
  () => [props.node, props.vmid],
  () => {
    void loadStorages();
  },
  { immediate: true }
);

watch(listStorage, () => {
  void refreshRows();
});
</script>

<template>
  <div class="vm-backup-tab q-pa-md">
    <div class="row items-center q-col-gutter-sm q-mb-sm">
      <div class="col-auto">
        <q-btn
          no-caps
          outline
          size="12px"
          color="primary"
          class="u-button"
          :label="gettext('Backup Now')"
          :disable="!canBackup || !listStorage"
          @click="openBackup"
        />
      </div>
      <div class="col-auto">
        <q-btn
          no-caps
          outline
          size="12px"
          color="negative"
          class="u-button"
          :label="gettext('Remove')"
          :disable="!canBackup || !selectedRow || Number(selectedRow.protected) === 1"
          @click="removeVisible = true"
        />
      </div>
      <div class="col-auto">
        <q-btn
          no-caps
          outline
          size="12px"
          color="primary"
          class="u-button"
          :label="gettext('Restore')"
          :disable="!canRestore || !selectedRow"
          @click="openRestore"
        />
      </div>
      <div
        v-if="selectedStorageType === 'pbs'"
        class="col-auto"
      >
        <q-btn
          no-caps
          outline
          size="12px"
          color="primary"
          class="u-button"
          :label="gettext('File Restore')"
          :disable="!selectedRow || !isPbsBackup"
          @click="openFileRestore"
        />
      </div>
      <div class="col-auto">
        <q-btn
          no-caps
          outline
          size="12px"
          color="primary"
          class="u-button"
          :label="gettext('Show Configuration')"
          :disable="!selectedRow"
          @click="showConfiguration"
        />
      </div>
      <div class="col-auto">
        <q-btn
          no-caps
          outline
          size="12px"
          color="primary"
          class="u-button"
          :label="gettext('Edit Notes')"
          :disable="!canBackup || !selectedRow"
          @click="openNotes"
        />
      </div>
      <div class="col-auto">
        <q-btn
          no-caps
          outline
          size="12px"
          color="primary"
          class="u-button"
          :label="gettext('Change Protection')"
          :disable="!canBackup || !selectedRow"
          @click="toggleProtection"
        />
      </div>
      <q-space />
      <div class="col-12 col-sm-auto">
        <div class="row items-center no-wrap vm-storage-selector">
          <span class="vm-storage-selector__label">{{ gettext('Storage') }}</span>
          <SelectTable
            v-model="listStorage"
            row-key="storage"
            width="560px"
            class="vm-storage-selector__field"
            :rows="storages"
            :columns="storageColumns"
            :display-value="storageDisplayValue"
            :loading="loading"
            :get-row-value="(row) => textValue(row.storage)"
          >
            <template #body-cell="scope">
              <UsageProgress
                v-if="scope.col.name === 'used'"
                :percent="Number(scope.value)"
              />
              <q-badge
                v-else-if="scope.col.name === 'active'"
                :color="Number(scope.row.active) ? 'green' : 'red'"
                :label="scope.value"
              />
              <template v-else>{{ scope.value }}</template>
            </template>
          </SelectTable>
        </div>
      </div>
      <div class="col-12 col-sm-auto">
        <q-checkbox
          v-model="filterVmid"
          dense
          :label="gettext('Filter VMID')"
        />
      </div>
      <div class="col-12 col-sm-auto">
        <q-input
          v-model="search"
          dense
          clearable
          class="vm-backup-search"
          :label="gettext('Search')"
        />
      </div>
      <div class="col-auto">
        <q-btn
          no-caps
          outline
          size="12px"
          color="primary"
          class="u-button"
          icon="refresh"
          :label="gettext('Refresh')"
          :loading="loading"
          @click="() => refreshRows()"
        />
      </div>
    </div>
    <q-table
      v-model:selected="selected"
      flat
      square
      dense
      row-key="volid"
      selection="single"
      table-header-class="u-table-header"
      :rows="displayedRows"
      :columns="columns"
      :loading="loading"
      :pagination="{ rowsPerPage: 0 }"
      :rows-per-page-options="[0]"
      :no-data-label="gettext('no record can be found')"
      hide-bottom
      class="u-compact-table"
    >
      <template #no-data="{ message }">
        <div class="full-width row flex-center text-accent q-gutter-sm">
          <span class="text-grey-6">{{ message }}</span>
        </div>
      </template>
    </q-table>

    <q-dialog
      v-model="backupVisible"
      persistent
    >
      <UWindow
        :title="gettext('Backup')"
        width="640px"
        :loading="loading"
      >
        <q-form
          class="u-border q-ma-sm q-pa-md u-dense"
          @submit.prevent="backupNow"
        >
          <div class="row q-col-gutter-lg">
            <div class="col-12 col-sm-6">
              <SelectTable
                v-model="form.storage"
                row-key="storage"
                field-style="standard"
                width="560px"
                class="q-field--with-bottom"
                :rows="storages"
                :columns="storageColumns"
                :display-value="backupStorageDisplayValue"
                :loading="loading"
                :get-row-value="(row) => textValue(row.storage)"
                :label="gettext('Storage')"
                @update:model-value="loadBackupDefaults"
              >
                <template #body-cell="scope">
                  <UsageProgress
                    v-if="scope.col.name === 'used'"
                    :percent="Number(scope.value)"
                  />
                  <q-badge
                    v-else-if="scope.col.name === 'active'"
                    :color="Number(scope.row.active) ? 'green' : 'red'"
                    :label="scope.value"
                  />
                  <template v-else>{{ scope.value }}</template>
                </template>
              </SelectTable>
            </div>
            <div class="col-12 col-sm-6">
              <q-select
                v-model="form.mode"
                dense
                emit-value
                map-options
                options-dense
                class="q-field--with-bottom"
                :options="[
                  { label: gettext('Snapshot'), value: 'snapshot' },
                  { label: gettext('Suspend'), value: 'suspend' },
                  { label: gettext('Stop'), value: 'stop' },
                ]"
                :label="gettext('Mode')"
              />
            </div>
            <div class="col-12 col-sm-6">
              <q-select
                v-model="form.compress"
                dense
                emit-value
                map-options
                options-dense
                class="q-field--with-bottom"
                :disable="backupCompressDisabled"
                :options="[
                  { label: 'ZSTD', value: 'zstd' },
                  { label: 'LZO (fast)', value: 'lzo' },
                  { label: 'GZIP (good)', value: 'gzip' },
                  { label: gettext('None'), value: '0' },
                ]"
                :label="gettext('Compression')"
              />
            </div>
            <div class="col-12 col-sm-6">
              <q-select
                v-model="form.notificationMode"
                dense
                emit-value
                map-options
                options-dense
                class="q-field--with-bottom"
                :options="[
                  { label: gettext('Use global settings'), value: 'notification-system' },
                  { label: gettext('Use sendmail (legacy)'), value: 'legacy-sendmail' },
                ]"
                :label="gettext('Notification')"
              />
            </div>
            <div
              v-if="form.notificationMode === 'legacy-sendmail'"
              class="col-12 col-sm-6"
            >
              <q-input
                v-model="form.mailto"
                dense
                class="q-field--with-bottom"
                :label="gettext('Send email to')"
                :placeholder="gettext('None')"
              />
            </div>
            <div class="col-12 col-sm-6">
              <q-checkbox
                v-model="form.protected"
                dense
                color="primary"
                :label="gettext('Protected')"
              />
            </div>
            <div
              v-if="pruneVisible"
              class="col-12"
            >
              <q-checkbox
                v-model="form.remove"
                dense
                color="primary"
                :label="gettext('Prune')"
              />
              <div
                v-if="form.remove"
                class="backup-retention q-mt-sm"
              >
                <div class="text-grey-8 q-mb-xs">
                  {{ gettext('Storage Retention Configuration') }}:
                </div>
                <div class="row q-col-gutter-sm">
                  <div
                    v-for="item in pruneKeepRows"
                    :key="item.key"
                    class="col-6 col-sm-4 backup-retention__item"
                  >
                    <span class="text-grey-7">{{ item.label }}</span>
                    <strong>{{ item.value }}</strong>
                  </div>
                </div>
              </div>
            </div>
            <div class="col-12">
              <q-input
                v-model="form.notesTemplate"
                dense
                type="textarea"
                autogrow
                class="q-field--with-bottom"
                :label="gettext('Notes')"
              />
              <div class="text-caption text-grey-7">
                {{
                  gettext('Possible template variables are: {0}').replace(
                    '{0}',
                    notesTemplateVariables
                  )
                }}
              </div>
            </div>
          </div>
        </q-form>
        <template #foot>
          <q-btn
            v-close-popup
            no-caps
            outline
            size="12px"
            class="u-button"
            :label="gettext('Cancel')"
            :disable="loading"
          />
          <q-btn
            no-caps
            flat
            size="12px"
            class="bg-primary text-grey-1 u-button"
            :label="gettext('Backup')"
            :loading="loading"
            @click="backupNow"
          />
        </template>
      </UWindow>
    </q-dialog>

    <q-dialog
      v-model="removeVisible"
      persistent
    >
      <UWindow
        :title="gettext('Remove')"
        width="460px"
        :loading="loading"
      >
        <div class="q-pa-md">
          {{ gettext('Are you sure you want to remove entry') }} “{{
            textValue(selectedRow?.volid)
          }}”? {{ gettext('This will permanently erase all data.') }}
        </div>
        <template #foot>
          <q-btn
            v-close-popup
            no-caps
            outline
            size="12px"
            class="u-button"
            :label="gettext('Cancel')"
            :disable="loading"
          />
          <q-btn
            no-caps
            flat
            size="12px"
            class="bg-negative text-grey-1 u-button"
            :label="gettext('Remove')"
            :loading="loading"
            @click="removeBackup"
          />
        </template>
      </UWindow>
    </q-dialog>
    <q-dialog
      v-model="restoreVisible"
      persistent
    >
      <UWindow
        :title="gettext('Restore')"
        width="640px"
        :loading="loading"
      >
        <q-form
          class="u-border q-ma-sm q-pa-md u-dense"
          @submit.prevent="restore"
        >
          <div class="row q-col-gutter-lg">
            <div class="col-12 col-sm-6">
              <q-input
                :model-value="props.vmid"
                dense
                readonly
                class="q-field--with-bottom"
                :label="gettext('VMID')"
              />
            </div>
            <div class="col-12 col-sm-6">
              <q-input
                v-model="restoreForm.name"
                dense
                class="q-field--with-bottom"
                :placeholder="restorePlaceholders.name"
                :label="gettext('Name')"
                :rules="[
                  (value: unknown) =>
                    !value || isDnsName(String(value)) || gettext('Invalid DNS name'),
                ]"
              />
            </div>
            <div class="col-12">
              <SelectTable
                v-model="restoreForm.storage"
                row-key="storage"
                field-style="standard"
                width="560px"
                class="q-field--with-bottom"
                :rows="restoreStorages"
                :columns="storageColumns"
                :display-value="restoreStorageDisplayValue"
                :loading="loading"
                :get-row-value="(row) => textValue(row.storage)"
                :label="gettext('Target Storage')"
                :rules="[
                  (value: unknown) =>
                    !restoreTargetRequired || !!value || gettext('Required field'),
                ]"
              >
                <template #body-cell="scope">
                  <UsageProgress
                    v-if="scope.col.name === 'used'"
                    :percent="Number(scope.value)"
                  />
                  <q-badge
                    v-else-if="scope.col.name === 'active'"
                    :color="Number(scope.row.active) ? 'green' : 'red'"
                    :label="scope.value"
                  />
                  <template v-else>{{ scope.value }}</template>
                </template>
              </SelectTable>
            </div>
            <div class="col-12 col-sm-4">
              <q-input
                v-model="restoreForm.cores"
                dense
                type="number"
                class="q-field--with-bottom"
                :placeholder="restorePlaceholders.cores"
                :label="gettext('Cores')"
                :rules="[
                  (value) =>
                    !value ||
                    (Number.isInteger(Number(value)) &&
                      Number(value) >= 1 &&
                      Number(value) <= 128) ||
                    gettext('Value must be between 1 and 128'),
                ]"
              />
            </div>
            <div class="col-12 col-sm-4">
              <q-input
                v-model="restoreForm.sockets"
                dense
                type="number"
                class="q-field--with-bottom"
                :placeholder="restorePlaceholders.sockets"
                :label="gettext('Sockets')"
                :rules="[
                  (value) =>
                    !value ||
                    (Number.isInteger(Number(value)) && Number(value) >= 1 && Number(value) <= 4) ||
                    gettext('Value must be between 1 and 4'),
                ]"
              />
            </div>
            <div class="col-12 col-sm-4">
              <q-input
                v-model="restoreForm.memory"
                dense
                type="number"
                class="q-field--with-bottom"
                :placeholder="restorePlaceholders.memory"
                :label="gettext('Memory (MiB)')"
                :rules="[
                  (value) =>
                    !value ||
                    (Number.isInteger(Number(value)) &&
                      Number(value) >= 32 &&
                      Number(value) <= 4178944) ||
                    gettext('Invalid memory value'),
                ]"
              />
            </div>
            <div class="col-12 col-sm-6">
              <q-input
                v-model="restoreForm.bwlimit"
                dense
                type="number"
                class="q-field--with-bottom"
                :label="gettext('Bandwidth Limit (MiB/s)')"
                :rules="[
                  (value) =>
                    !value ||
                    (Number.isInteger(Number(value)) && Number(value) >= 0) ||
                    gettext('Invalid bandwidth limit'),
                ]"
              />
            </div>
            <div class="col-12 col-sm-6">
              <q-checkbox
                v-model="restoreForm.unique"
                dense
                color="primary"
                :label="gettext('Unique')"
              />
            </div>
            <div class="col-12 col-sm-6">
              <q-checkbox
                v-model="restoreForm.haManaged"
                dense
                color="primary"
                :label="gettext('Add to HA')"
              />
            </div>
            <div class="col-12 col-sm-6">
              <q-checkbox
                v-model="restoreForm.start"
                dense
                color="primary"
                :disable="restoreForm.liveRestore"
                :label="gettext('Start after restore')"
              />
            </div>
            <div
              v-if="isPbsBackup"
              class="col-12 col-sm-6"
            >
              <q-checkbox
                v-model="restoreForm.liveRestore"
                dense
                color="primary"
                :label="gettext('Live restore')"
              />
            </div>
            <div
              v-if="isPbsBackup && restoreForm.liveRestore"
              class="col-12 text-caption text-warning"
            >
              {{
                gettext(
                  'Note: If anything goes wrong during the live-restore, new data written by the VM may be lost.'
                )
              }}
            </div>
          </div>
        </q-form>
        <template #foot>
          <q-btn
            v-close-popup
            no-caps
            outline
            size="12px"
            class="u-button"
            :label="gettext('Cancel')"
          />
          <q-btn
            no-caps
            flat
            size="12px"
            class="bg-primary text-grey-1 u-button"
            :label="gettext('Restore')"
            :loading="loading"
            :disable="!restoreValid"
            @click="restore"
          />
        </template>
      </UWindow>
    </q-dialog>
    <q-dialog
      v-model="fileRestoreVisible"
      persistent
    >
      <UWindow
        :title="gettext('File Restore')"
        width="760px"
        :loading="loading"
      >
        <div class="q-pa-md">
          <div class="row items-center q-gutter-sm q-mb-sm">
            <q-btn
              no-caps
              outline
              size="12px"
              class="u-button"
              :label="gettext('Up')"
              :disable="!fileRestorePath"
              @click="loadFileRestorePath(fileRestorePath.split('/').slice(0, -1).join('/'))"
            />
            <span class="text-caption text-grey-7">{{ fileRestorePath || '/' }}</span>
          </div>
          <q-table
            flat
            dense
            row-key="filepath"
            :rows="fileRestoreRows"
            :columns="[
              {
                name: 'name',
                label: gettext('Name'),
                field: (row) => fileRestoreEntryPath(row),
                align: 'left',
              },
              { name: 'type', label: gettext('Type'), field: 'type', align: 'left' },
              {
                name: 'size',
                label: gettext('Size'),
                field: (row) => formatBytes(row.size as number),
                align: 'right',
              },
              { name: 'actions', label: gettext('Actions'), field: 'actions', align: 'right' },
            ]"
            :loading="loading"
            :pagination="{ rowsPerPage: 0 }"
            hide-bottom
            class="u-compact-table"
          >
            <template #body-cell-name="scope">
              <q-td :props="scope">
                <q-btn
                  flat
                  dense
                  no-caps
                  :label="scope.value"
                  @click="openFileRestoreEntry(scope.row)"
                />
              </q-td>
            </template>
            <template #body-cell-actions="scope">
              <q-td :props="scope">
                <q-btn
                  v-if="!isFileRestoreDirectory(scope.row)"
                  flat
                  dense
                  no-caps
                  color="primary"
                  :label="gettext('Download')"
                  @click="downloadFileRestoreEntry(scope.row)"
                />
              </q-td>
            </template>
          </q-table>
        </div>
        <template #foot>
          <q-btn
            v-close-popup
            no-caps
            outline
            size="12px"
            class="u-button"
            :label="gettext('Close')"
          />
        </template>
      </UWindow>
    </q-dialog>
    <q-dialog v-model="configurationVisible">
      <UWindow
        :title="gettext('Show Configuration')"
        width="640px"
      >
        <div class="q-pa-sm">
          <div class="backup-configuration u-border q-pa-sm">
            <pre
              v-if="configuration"
              class="backup-configuration__content"
              >{{ configuration }}</pre>
            <div
              v-else
              class="backup-configuration__empty"
            >
              {{ gettext('no record can be found') }}
            </div>
          </div>
        </div>
        <template #foot>
          <q-btn
            v-close-popup
            no-caps
            outline
            size="12px"
            class="u-button"
            :label="gettext('Close')"
          />
        </template>
      </UWindow>
    </q-dialog>
    <q-dialog
      v-model="notesVisible"
      persistent
    >
      <UWindow
        :title="gettext('Notes')"
        width="600px"
        :loading="loading"
      >
        <q-form
          class="u-border q-ma-sm q-pa-md u-dense"
          @submit.prevent="saveNotes"
        >
          <q-input
            v-model="notes"
            dense
            type="textarea"
            autogrow
            class="q-field--with-bottom"
            :label="gettext('Notes')"
          />
        </q-form>
        <template #foot>
          <q-btn
            v-close-popup
            no-caps
            outline
            size="12px"
            class="u-button"
            :label="gettext('Cancel')"
          />
          <q-btn
            no-caps
            flat
            size="12px"
            class="bg-primary text-grey-1 u-button"
            :label="gettext('Save')"
            :loading="loading"
            @click="saveNotes"
          />
        </template>
      </UWindow>
    </q-dialog>
  </div>
</template>

<style scoped>
.u-compact-table :deep(thead tr),
.u-compact-table :deep(thead th),
.u-compact-table :deep(tbody td) {
  height: 40px;
  min-height: 40px;
  font-size: 12px;
}
.backup-configuration {
  height: 260px;
  overflow: auto;
  background: #fbfbfb;
}
.backup-configuration__content {
  min-height: 100%;
  margin: 0;
  color: #333333;
  font-family: Consolas, 'Courier New', monospace;
  font-size: 12px;
  line-height: 20px;
  white-space: pre-wrap;
  word-break: break-word;
}
.backup-configuration__empty {
  height: 100%;
  color: #666666;
  font-size: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
}
.backup-retention {
  border: 1px solid #cccccc;
  padding: 8px 10px;
}
.backup-retention__item {
  display: flex;
  gap: 6px;
}
.vm-storage-selector {
  gap: 8px;
}
.vm-storage-selector__label {
  color: #333333;
  font-size: 12px;
  white-space: nowrap;
}
.vm-storage-selector__field {
  min-width: 220px;
}
</style>
