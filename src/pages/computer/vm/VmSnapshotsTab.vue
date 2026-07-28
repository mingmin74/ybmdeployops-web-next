<script setup lang="ts">
import { computed, reactive, shallowRef, watch } from 'vue';
import { createVmSnapshot, deleteVmSnapshot, getVmSnapshotConfig, getVmSnapshots, rollbackVmSnapshot, updateVmSnapshotConfig } from '@/api/overview';
import type { PveRecord } from '@/api/resources';
import UWindow from '@/components/UWindow.vue';
import { gettext } from '@/locale';
import { useSessionStore } from '@/stores/session';

const props = defineProps<{ node: string; vmid: string }>();
const emit = defineEmits<{ task: [node: string, upid: string, title: string] }>();
const session = useSessionStore();
const loading = shallowRef(false);
const createVisible = shallowRef(false);
const actionVisible = shallowRef(false);
const editVisible = shallowRef(false);
const action = shallowRef<'rollback' | 'delete'>('rollback');
const selected = shallowRef<PveRecord>();
const snapshots = shallowRef<PveRecord[]>([]);
const form = reactive({ snapname: '', description: '', vmstate: false });
const editDescription = shallowRef('');
const vmCaps = computed(() => (session.caps as unknown as { vms?: Record<string, unknown> }).vms || {});
const canSnapshot = computed(() => Boolean(vmCaps.value['VM.Snapshot']));
const canRollback = computed(() => Boolean(vmCaps.value['VM.Snapshot.Rollback']));

const columns = computed(() => [
  { name: 'name', label: gettext('Name'), field: 'name', align: 'left' as const, sortable: true },
  { name: 'description', label: gettext('Description'), field: 'description', align: 'left' as const },
  { name: 'snaptime', label: gettext('Snapshot time'), field: 'snaptime', align: 'left' as const, format: (value: unknown) => formatTime(value) },
  { name: 'vmstate', label: gettext('Include RAM'), field: 'vmstate', align: 'left' as const, format: (value: unknown) => Number(value) === 1 ? gettext('Yes') : gettext('No') },
  { name: 'actions', label: gettext('Actions'), field: 'actions', align: 'right' as const },
]);

function formatTime(value: unknown) {
  const seconds = Number(value);
  if (!Number.isFinite(seconds) || seconds <= 0) return '-';
  return new Date(seconds * 1000).toLocaleString();
}

function snapshotName(row: PveRecord) {
  return String(row.name || row.snapname || '');
}

async function reload() {
  if (!props.node || !props.vmid) return;
  loading.value = true;
  try {
    const response = await getVmSnapshots(props.node, props.vmid);
    snapshots.value = (response.data || []).filter((item) => !item.current);
  } finally {
    loading.value = false;
  }
}

function openCreate() {
  if (!canSnapshot.value) return;
  form.snapname = `snapshot-${new Date().toISOString().slice(0, 16).replace(/[-T:]/g, '')}`;
  form.description = '';
  form.vmstate = false;
  createVisible.value = true;
}

async function create() {
  if (!canSnapshot.value) return;
  const snapname = form.snapname.trim();
  if (!snapname) return;
  loading.value = true;
  try {
    const response = await createVmSnapshot(props.node, props.vmid, {
      snapname,
      description: form.description.trim() || undefined,
      vmstate: form.vmstate ? 1 : 0,
    });
    createVisible.value = false;
    emit('task', props.node, String(response.data || ''), gettext('Create snapshot'));
    await reload();
  } finally {
    loading.value = false;
  }
}

function confirm(nextAction: 'rollback' | 'delete', row: PveRecord) {
  if ((nextAction === 'rollback' && !canRollback.value) || (nextAction === 'delete' && !canSnapshot.value)) return;
  action.value = nextAction;
  selected.value = row;
  actionVisible.value = true;
}

async function openEdit(row: PveRecord) {
  const snapname = snapshotName(row);
  if (!snapname) return;
  loading.value = true;
  try {
    const response = await getVmSnapshotConfig(props.node, props.vmid, snapname);
    selected.value = row;
    editDescription.value = String(response.data?.description || row.description || '');
    editVisible.value = true;
  } finally { loading.value = false; }
}

async function saveEdit() {
  if (!canSnapshot.value) return;
  const snapname = selected.value ? snapshotName(selected.value) : '';
  if (!snapname) return;
  loading.value = true;
  try {
    await updateVmSnapshotConfig(props.node, props.vmid, snapname, { description: editDescription.value });
    editVisible.value = false;
    await reload();
  } finally { loading.value = false; }
}

async function runAction() {
  const snapname = selected.value ? snapshotName(selected.value) : '';
  if (!snapname) return;
  loading.value = true;
  try {
    const response = action.value === 'rollback'
      ? await rollbackVmSnapshot(props.node, props.vmid, snapname)
      : await deleteVmSnapshot(props.node, props.vmid, snapname);
    actionVisible.value = false;
    emit('task', props.node, String(response.data || ''), action.value === 'rollback' ? gettext('Rollback') : gettext('Delete'));
    await reload();
  } finally {
    loading.value = false;
  }
}

watch(() => [props.node, props.vmid], () => { void reload(); }, { immediate: true });
</script>

<template>
  <div class="vm-snapshots-tab q-pa-md">
    <div class="row items-center q-mb-sm">
      <q-btn no-caps outline size="12px" color="primary" class="u-button" icon="add" :disable="!canSnapshot" :label="gettext('Create snapshot')" @click="openCreate" />
      <q-space />
      <q-btn no-caps outline size="12px" color="primary" class="u-button" icon="refresh" :label="gettext('Refresh')" :loading="loading" @click="reload" />
    </div>
    <q-table flat bordered square dense row-key="name" :rows="snapshots" :columns="columns" :loading="loading" :pagination="{ rowsPerPage: 0 }" hide-bottom class="u-compact-table">
      <template #body-cell-actions="scope">
        <q-td :props="scope">
          <q-btn no-caps flat dense size="12px" color="primary" :disable="!canRollback" :label="gettext('Rollback')" @click="confirm('rollback', scope.row)" />
          <q-btn no-caps flat dense size="12px" color="primary" :disable="!canSnapshot" :label="gettext('Edit')" @click="openEdit(scope.row)" />
          <q-btn no-caps flat dense size="12px" color="negative" :disable="!canSnapshot" :label="gettext('Delete')" @click="confirm('delete', scope.row)" />
        </q-td>
      </template>
    </q-table>

    <q-dialog v-model="createVisible" persistent>
      <UWindow :title="gettext('Create snapshot')" width="520px" :loading="loading">
        <q-form class="q-pa-md q-gutter-md u-hidden-error" @submit.prevent="create">
          <q-input v-model="form.snapname" dense outlined square autofocus :label="gettext('Name')" :rules="[(value) => !!String(value || '').trim() || gettext('Required field')]" />
          <q-input v-model="form.description" dense outlined square type="textarea" autogrow :label="gettext('Description')" />
          <q-checkbox v-model="form.vmstate" dense color="primary" :label="gettext('Include RAM')" />
        </q-form>
        <template #foot>
          <q-btn v-close-popup no-caps outline size="12px" class="u-button" :label="gettext('Cancel')" :disable="loading" />
          <q-btn no-caps flat size="12px" class="bg-primary text-grey-1 u-button" :label="gettext('Create')" :loading="loading" @click="create" />
        </template>
      </UWindow>
    </q-dialog>
    <q-dialog v-model="editVisible" persistent><UWindow :title="gettext('Edit snapshot')" width="520px" :loading="loading"><div class="q-pa-md"><q-input v-model="editDescription" dense outlined square type="textarea" autogrow :label="gettext('Description')" /></div><template #foot><q-btn v-close-popup no-caps outline size="12px" class="u-button" :label="gettext('Cancel')" /><q-btn no-caps flat size="12px" class="bg-primary text-grey-1 u-button" :label="gettext('Save')" @click="saveEdit" /></template></UWindow></q-dialog>

    <q-dialog v-model="actionVisible" persistent>
      <UWindow :title="action === 'rollback' ? gettext('Rollback') : gettext('Delete')" width="480px" :loading="loading">
        <div class="q-pa-md">{{ action === 'rollback' ? gettext('Rollback this virtual machine to the selected snapshot?') : gettext('Delete the selected snapshot?') }}</div>
        <template #foot>
          <q-btn v-close-popup no-caps outline size="12px" class="u-button" :label="gettext('Cancel')" :disable="loading" />
          <q-btn no-caps flat size="12px" :class="action === 'delete' ? 'bg-negative text-grey-1' : 'bg-primary text-grey-1'" class="u-button" :label="gettext('Confirm')" :loading="loading" @click="runAction" />
        </template>
      </UWindow>
    </q-dialog>
  </div>
</template>

<style scoped>
.u-compact-table :deep(tbody td) { height: 40px; font-size: 12px; }
</style>
