<script setup lang="ts">
import type { QTableColumn } from 'quasar';
import { computed, reactive, shallowRef, watch } from 'vue';
import type { PveRecord } from '@/api/resources';
import {
  getNodeStorage,
  getStorageContent,
  deleteStorageContent,
  updateStorageContent,
} from '@/api/storageContent';
import UWindow from '@/components/UWindow.vue';
import { gettext } from '@/locale';
import { useSessionStore } from '@/stores/session';
import { formatBytes, textValue } from '@/utils/pveFormat';
import { getVmBackupConfiguration, restoreVmBackup, runVmBackup } from '@/api/vm';

const props = defineProps<{ node: string; vmid: string }>();
const emit = defineEmits<{ task: [node: string, upid: string, title: string] }>();
const session = useSessionStore();
const loading = shallowRef(false);
const backupVisible = shallowRef(false);
const removeVisible = shallowRef(false);
const restoreVisible = shallowRef(false);
const configurationVisible = shallowRef(false);
const notesVisible = shallowRef(false);
const configuration = shallowRef('');
const notes = shallowRef('');
const storages = shallowRef<PveRecord[]>([]);
const rows = shallowRef<PveRecord[]>([]);
const selected = shallowRef<PveRecord[]>([]);
const form = reactive<{
  storage: string;
  mode: 'snapshot' | 'suspend' | 'stop';
  compress: 'zstd' | 'lzo' | 'gzip' | '0';
  protected: boolean;
}>({ storage: '', mode: 'snapshot', compress: 'zstd', protected: false });
const restoreForm = reactive({
  vmid: '',
  storage: '',
  bwlimit: '',
  unique: false,
  force: false,
  haManaged: false,
  name: '',
  cores: '',
  memory: '',
  sockets: '',
  start: false,
  liveRestore: false,
});
const vmCaps = computed(
  () => (session.caps as unknown as { vms?: Record<string, unknown> }).vms || {},
);
const canBackup = computed(() => Boolean(vmCaps.value['VM.Backup']));
const canRestore = computed(() => Boolean(vmCaps.value['VM.Allocate']));

const storageOptions = computed(() =>
  storages.value.map((item) => ({
    label: textValue(item.storage),
    value: textValue(item.storage),
  })),
);
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
  { name: 'actions', label: gettext('Actions'), field: 'actions', align: 'right' },
]);
const currentStorage = computed(() => form.storage);
const selectedRow = computed(() => selected.value[0]);

function formatTime(value: unknown) {
  const seconds = Number(value);
  return Number.isFinite(seconds) && seconds > 0 ? new Date(seconds * 1000).toLocaleString() : '-';
}

async function refreshRows() {
  if (!props.node || !currentStorage.value) {
    rows.value = [];
    return;
  }
  loading.value = true;
  try {
    const response = await getStorageContent(props.node, currentStorage.value, 'backup');
    rows.value = (response.data || []).filter(
      (row) =>
        textValue(row.vmid) === props.vmid || textValue(row.volid).includes(`qemu-${props.vmid}-`),
    );
    selected.value = [];
  } finally {
    loading.value = false;
  }
}

async function loadStorages() {
  if (!props.node) return;
  loading.value = true;
  try {
    const response = await getNodeStorage(props.node, 'backup');
    storages.value = response.data || [];
    if (!storages.value.some((item) => textValue(item.storage) === form.storage))
      form.storage = textValue(storages.value[0]?.storage);
    await refreshRows();
  } finally {
    loading.value = false;
  }
}

function openBackup() {
  if (!canBackup.value || !form.storage) return;
  backupVisible.value = true;
}

function openRestore() {
  if (!canRestore.value || !selectedRow.value) return;
  restoreForm.vmid = props.vmid;
  restoreForm.storage = '';
  restoreForm.bwlimit = '';
  restoreForm.unique = false;
  restoreForm.force = false;
  restoreForm.haManaged = false;
  restoreForm.name = '';
  restoreForm.cores = '';
  restoreForm.memory = '';
  restoreForm.sockets = '';
  restoreForm.start = false;
  restoreForm.liveRestore = false;
  restoreVisible.value = true;
}

function openNotes() {
  if (!selectedRow.value) return;
  notes.value = textValue(selectedRow.value.notes);
  notesVisible.value = true;
}

async function saveNotes() {
  const volid = textValue(selectedRow.value?.volid);
  if (!canBackup.value || !volid || !form.storage) return;
  loading.value = true;
  try {
    await updateStorageContent(props.node, form.storage, volid, { notes: notes.value });
    notesVisible.value = false;
    await refreshRows();
  } finally {
    loading.value = false;
  }
}

async function toggleProtection() {
  const volid = textValue(selectedRow.value?.volid);
  if (!canBackup.value || !volid || !form.storage) return;
  loading.value = true;
  try {
    await updateStorageContent(props.node, form.storage, volid, {
      protected: Number(selectedRow.value?.protected) ? 0 : 1,
    });
    await refreshRows();
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

async function restore() {
  const archive = textValue(selectedRow.value?.volid);
  if (!canRestore.value || !archive || !restoreForm.vmid) return;
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
      vmid: restoreForm.vmid,
      archive,
      unique: restoreForm.unique ? 1 : 0,
      force: restoreForm.force ? 1 : 0,
      ...(restoreForm.start && !restoreForm.liveRestore ? { start: 1 } : {}),
      ...(restoreForm.liveRestore ? { 'live-restore': 1 } : {}),
      ...(restoreForm.haManaged ? { 'ha-managed': 1 } : {}),
    };
    if (restoreForm.storage) data.storage = restoreForm.storage;
    if (restoreForm.bwlimit) data.bwlimit = Number(restoreForm.bwlimit);
    if (restoreForm.name.trim()) data.name = restoreForm.name.trim();
    if (restoreForm.cores) data.cores = Number(restoreForm.cores);
    if (restoreForm.memory) data.memory = Number(restoreForm.memory);
    if (restoreForm.sockets) data.sockets = Number(restoreForm.sockets);
    const response = await restoreVmBackup(props.node, data);
    restoreVisible.value = false;
    emit('task', props.node, String(response.data || ''), gettext('Restore'));
  } finally {
    loading.value = false;
  }
}

async function backupNow() {
  if (!canBackup.value || !form.storage) return;
  loading.value = true;
  try {
    const response = await runVmBackup(props.node, props.vmid, {
      storage: form.storage,
      mode: form.mode,
      compress: form.compress,
      protected: form.protected ? 1 : 0,
    });
    backupVisible.value = false;
    emit('task', props.node, String(response.data || ''), gettext('Backup'));
  } finally {
    loading.value = false;
  }
}

async function removeBackup() {
  const volid = textValue(selectedRow.value?.volid);
  if (!canBackup.value || !volid || !form.storage) return;
  loading.value = true;
  try {
    await deleteStorageContent(props.node, form.storage, volid);
    removeVisible.value = false;
    await refreshRows();
  } finally {
    loading.value = false;
  }
}

watch(
  () => [props.node, props.vmid],
  () => {
    void loadStorages();
  },
  { immediate: true },
);
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
          :disable="!canBackup || !form.storage"
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
      <div class="col-12 col-sm-4">
        <q-select
          v-model="form.storage"
          dense
          outlined
          square
          emit-value
          map-options
          :options="storageOptions"
          :label="gettext('Storage')"
          @update:model-value="refreshRows"
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
          @click="refreshRows"
        />
      </div>
    </div>
    <q-table
      v-model:selected="selected"
      flat
      bordered
      square
      dense
      row-key="volid"
      selection="single"
      :rows="rows"
      :columns="columns"
      :loading="loading"
      :pagination="{ rowsPerPage: 0 }"
      hide-bottom
      class="u-compact-table"
    >
      <template #body-cell-actions="scope"
        ><q-td :props="scope"
          ><q-btn
            no-caps
            flat
            dense
            size="12px"
            color="negative"
            :disable="!canBackup || Number(scope.row.protected) === 1"
            :label="gettext('Remove')"
            @click="
              selected = [scope.row];
              removeVisible = true;
            " /></q-td
      ></template>
    </q-table>

    <q-dialog v-model="backupVisible" persistent>
      <UWindow :title="gettext('Backup')" width="560px" :loading="loading">
        <q-form class="q-pa-md q-gutter-md u-hidden-error" @submit.prevent="backupNow">
          <q-select
            v-model="form.storage"
            dense
            outlined
            square
            emit-value
            map-options
            :options="storageOptions"
            :label="gettext('Storage')"
            :rules="[(value) => !!value || gettext('Required field')]"
          />
          <q-select
            v-model="form.mode"
            dense
            outlined
            square
            emit-value
            map-options
            :options="[
              { label: gettext('Snapshot'), value: 'snapshot' },
              { label: gettext('Suspend'), value: 'suspend' },
              { label: gettext('Stop'), value: 'stop' },
            ]"
            :label="gettext('Mode')"
          />
          <q-select
            v-model="form.compress"
            dense
            outlined
            square
            emit-value
            map-options
            :options="[
              { label: 'ZSTD', value: 'zstd' },
              { label: 'LZO', value: 'lzo' },
              { label: 'GZIP', value: 'gzip' },
              { label: gettext('None'), value: '0' },
            ]"
            :label="gettext('Compression')"
          />
          <q-checkbox
            v-model="form.protected"
            dense
            color="primary"
            :label="gettext('Protected')"
          />
        </q-form>
        <template #foot
          ><q-btn
            v-close-popup
            no-caps
            outline
            size="12px"
            class="u-button"
            :label="gettext('Cancel')"
            :disable="loading" /><q-btn
            no-caps
            flat
            size="12px"
            class="bg-primary text-grey-1 u-button"
            :label="gettext('Backup')"
            :loading="loading"
            @click="backupNow"
        /></template>
      </UWindow>
    </q-dialog>

    <q-dialog v-model="removeVisible" persistent>
      <UWindow :title="gettext('Remove')" width="460px" :loading="loading">
        <div class="q-pa-md">
          {{ gettext('Are you sure you want to remove entry') }} “{{
            textValue(selectedRow?.volid)
          }}”?
        </div>
        <template #foot
          ><q-btn
            v-close-popup
            no-caps
            outline
            size="12px"
            class="u-button"
            :label="gettext('Cancel')"
            :disable="loading" /><q-btn
            no-caps
            flat
            size="12px"
            class="bg-negative text-grey-1 u-button"
            :label="gettext('Remove')"
            :loading="loading"
            @click="removeBackup"
        /></template>
      </UWindow>
    </q-dialog>
    <q-dialog v-model="restoreVisible" persistent
      ><UWindow :title="gettext('Restore')" width="560px" :loading="loading"
        ><q-form class="q-pa-md q-gutter-md u-hidden-error" @submit.prevent="restore"
          ><q-input
            v-model="restoreForm.vmid"
            dense
            outlined
            square
            :label="gettext('VMID')"
            :rules="[(value) => !!value || gettext('Required field')]" /><q-input
            v-model="restoreForm.name"
            dense
            outlined
            square
            :label="gettext('Name')" /><q-select
            v-model="restoreForm.storage"
            dense
            outlined
            square
            emit-value
            map-options
            clearable
            :options="storageOptions"
            :label="gettext('Target Storage')" />
          <div class="row q-col-gutter-sm">
            <q-input
              v-model="restoreForm.cores"
              class="col"
              dense
              outlined
              square
              type="number"
              :label="gettext('Cores')"
            /><q-input
              v-model="restoreForm.sockets"
              class="col"
              dense
              outlined
              square
              type="number"
              :label="gettext('Sockets')"
            /><q-input
              v-model="restoreForm.memory"
              class="col"
              dense
              outlined
              square
              type="number"
              :label="gettext('Memory (MiB)')"
            />
          </div>
          <q-input
            v-model="restoreForm.bwlimit"
            dense
            outlined
            square
            type="number"
            :label="gettext('Bandwidth Limit (KiB/s)')" /><q-checkbox
            v-model="restoreForm.unique"
            dense
            color="primary"
            :label="gettext('Unique')" /><q-checkbox
            v-model="restoreForm.haManaged"
            dense
            color="primary"
            :label="gettext('Add to HA')" /><q-checkbox
            v-model="restoreForm.start"
            dense
            color="primary"
            :disable="restoreForm.liveRestore"
            :label="gettext('Start after restore')" /><q-checkbox
            v-model="restoreForm.liveRestore"
            dense
            color="primary"
            :label="gettext('Live restore')" />
          <div v-if="restoreForm.liveRestore" class="text-caption text-warning">
            {{
              gettext(
                'Note: If anything goes wrong during the live-restore, new data written by the VM may be lost.',
              )
            }}
          </div>
          <q-checkbox
            v-model="restoreForm.force"
            dense
            color="negative"
            :label="gettext('Force overwrite')" /></q-form
        ><template #foot
          ><q-btn
            v-close-popup
            no-caps
            outline
            size="12px"
            class="u-button"
            :label="gettext('Cancel')" /><q-btn
            no-caps
            flat
            size="12px"
            class="bg-primary text-grey-1 u-button"
            :label="gettext('Restore')"
            :loading="loading"
            @click="restore" /></template></UWindow
    ></q-dialog>
    <q-dialog v-model="configurationVisible"
      ><UWindow :title="gettext('Show Configuration')" width="720px">
        <pre class="backup-configuration q-ma-md">{{ configuration }}</pre>
        <template #foot
          ><q-btn
            v-close-popup
            no-caps
            outline
            size="12px"
            class="u-button"
            :label="gettext('Close')" /></template></UWindow
    ></q-dialog>
    <q-dialog v-model="notesVisible" persistent
      ><UWindow :title="gettext('Notes')" width="600px" :loading="loading"
        ><div class="q-pa-md">
          <q-input
            v-model="notes"
            dense
            outlined
            square
            type="textarea"
            autogrow
            :label="gettext('Notes')"
          />
        </div>
        <template #foot
          ><q-btn
            v-close-popup
            no-caps
            outline
            size="12px"
            class="u-button"
            :label="gettext('Cancel')" /><q-btn
            no-caps
            flat
            size="12px"
            class="bg-primary text-grey-1 u-button"
            :label="gettext('Save')"
            :loading="loading"
            @click="saveNotes" /></template></UWindow
    ></q-dialog>
  </div>
</template>

<style scoped>
.u-compact-table :deep(tbody td) {
  height: 40px;
  font-size: 12px;
}
.backup-configuration {
  max-height: 60vh;
  overflow: auto;
  white-space: pre-wrap;
  word-break: break-word;
}
</style>
