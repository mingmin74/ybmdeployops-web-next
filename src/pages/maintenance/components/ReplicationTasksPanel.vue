<script setup lang="ts">
import { Dialog, Notify, type QTableColumn } from 'quasar';
import { computed, onMounted, onBeforeUnmount, reactive, ref, watch } from 'vue';
import {
  createReplicationTask,
  getReplicationTask,
  getReplicationLogs,
  getReplicationTasks,
  removeReplicationTask,
  runReplicationTask,
  updateReplicationTask,
  type ReplicationTask,
} from '@/api/maintenance';
import { getNodes, type PveNode } from '@/api/resources';
import { getClusterResources, type PveRecord } from '@/api/resources';
import UWindow from '@/components/UWindow.vue';
import SelectTable from '@/components/SelectTable.vue';
import { gettext } from '@/locale';
import { useSessionStore } from '@/stores/session';

type Row = ReplicationTask & {
  enabled: boolean;
  statusText: string;
  lastSyncText: string;
  nextSyncText: string;
  durationText: string;
  rateText: string;
};
const props = withDefaults(
  defineProps<{ node?: string; vmid?: string; guestType?: 'qemu' | 'lxc'; embedded?: boolean }>(),
  {
    guestType: 'qemu',
    node: '',
    vmid: '',
    embedded: false,
  },
);
const session = useSessionStore();
const loading = ref(false);
const filter = ref('');
const nodes = ref<PveNode[]>([]);
const node = ref('');
const vms = ref<PveRecord[]>([]);
const tasks = ref<Row[]>([]);
const selected = ref<Row[]>([]);
const formVisible = ref(false);
const formLoading = ref(false);
const formSaving = ref(false);
const action = ref<'add' | 'edit'>('add');
const logsVisible = ref(false);
const logsLoading = ref(false);
const logs = ref<string[]>([]);
let refreshTimer: ReturnType<typeof setInterval> | undefined;
let logsTimer: ReturnType<typeof setInterval> | undefined;
const form = reactive({
  id: '',
  guest: '',
  target: '',
  schedule: '*/15',
  rate: '',
  comment: '',
  enabled: true,
});
const onlineNodes = computed(() => nodes.value.filter((item) => item.status === 'online'));
const standalone = computed(() => onlineNodes.value.length < 2);
const showNodeSelector = computed(() => !props.node);
const selectedTask = computed(() => selected.value[0]);
const nodeColumns: QTableColumn<PveRecord>[] = [
  { name: 'node', label: gettext('Node'), field: 'node', align: 'left', sortable: true },
  { name: 'status', label: gettext('Status'), field: 'status', align: 'left', sortable: true },
];
const canManageReplication = computed(() =>
  Boolean((session.caps as unknown as { vms?: Record<string, unknown> }).vms?.['VM.Backup']),
);
const canOperate = computed(
  () => canManageReplication.value && Boolean(selectedTask.value) && !standalone.value,
);
const filteredTasks = computed(() => {
  const key = filter.value.trim().toLowerCase();
  return tasks.value.filter(
    (row) =>
      !key ||
      [row.id, row.guest, row.jobnum, row.target, row.statusText, row.schedule, row.comment]
        .join(' ')
        .toLowerCase()
        .includes(key),
  );
});
const formTitle = computed(
  () => `${gettext(action.value === 'add' ? 'Add' : 'Edit')}: ${gettext('Replication Job')}`,
);
const columns: QTableColumn<Row>[] = [
  { name: 'enabled', label: gettext('Enabled'), field: 'enabled', align: 'center', sortable: true },
  { name: 'id', label: 'ID', field: 'id', align: 'left', sortable: true },
  { name: 'guest', label: gettext('Guest'), field: 'guest', align: 'left', sortable: true },
  { name: 'job', label: gettext('Job'), field: 'jobnum', align: 'left' },
  { name: 'target', label: gettext('Target'), field: 'target', align: 'left' },
  { name: 'status', label: gettext('Status'), field: 'statusText', align: 'left' },
  { name: 'last', label: gettext('Last Sync'), field: 'lastSyncText', align: 'left' },
  { name: 'duration', label: gettext('Duration'), field: 'durationText', align: 'left' },
  { name: 'next', label: gettext('Next Sync'), field: 'nextSyncText', align: 'left' },
  { name: 'schedule', label: gettext('Schedule'), field: 'schedule', align: 'left' },
  { name: 'rate', label: gettext('Rate limit'), field: 'rateText', align: 'left' },
  { name: 'comment', label: gettext('Comment'), field: 'comment', align: 'left' },
];
const visibleColumns = computed(() => [
  'enabled',
  'guest',
  'job',
  'target',
  'status',
  'last',
  'duration',
  'next',
  'schedule',
  'comment',
]);
function timestamp(value?: number) {
  return value
    ? new Intl.DateTimeFormat(undefined, {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
      }).format(new Date(value * 1000))
    : '-';
}
function duration(value?: number) {
  if (!value) return '-';
  const hours = Math.floor(value / 3600);
  const minutes = Math.floor((value % 3600) / 60);
  return `${hours ? `${hours}h ` : ''}${minutes ? `${minutes}m ` : ''}${(value % 60).toFixed(1)}s`;
}
function row(task: ReplicationTask): Row {
  const nextSync = Number(task.next_sync) || 0;
  let statusText = gettext('OK');
  if (task.remove_job) statusText = gettext('Removal Scheduled');
  else if (task.error) statusText = task.error;

  return {
    ...task,
    enabled: !(Number(task.disable) === 1 || task.disable === true),
    statusText,
    lastSyncText: task.pid ? gettext('syncing') : timestamp(task.last_sync),
    nextSyncText: !nextSync
      ? '-'
      : new Date(nextSync * 1000) < new Date()
        ? gettext('pending')
        : timestamp(nextSync),
    durationText: duration(task.duration),
    rateText: task.rate ? `${task.rate} MB/s` : gettext('unlimited'),
  };
}
function rowClick(_: Event, value: Row) {
  selected.value = selectedTask.value === value ? [] : [value];
}
async function reload() {
  if (!node.value) return;
  loading.value = true;
  try {
    const response = await getReplicationTasks(node.value, props.vmid || undefined);
    tasks.value = [...(response.data || [])]
      .map(row)
      .sort(
        (a, b) =>
          Number(a.guest || 0) - Number(b.guest || 0) ||
          Number(a.jobnum || 0) - Number(b.jobnum || 0),
      );
    selected.value = [];
  } finally {
    loading.value = false;
  }
}
async function loadInitial() {
  const [nodeResponse, vmResponse] = await Promise.all([
    getNodes(),
    getClusterResources({ type: 'vm' }),
  ]);
  nodes.value = nodeResponse.data || [];
  vms.value = (vmResponse.data || []).filter(
    (item) => item.type === props.guestType && !item.template,
  );
  node.value = props.node || onlineNodes.value[0]?.node || nodes.value[0]?.node || '';
  await reload();
}
function resetForm() {
  Object.assign(form, {
    id: '',
    guest: '',
    target: '',
    schedule: '*/15',
    rate: '',
    comment: '',
    enabled: true,
  });
}
function openForm(nextAction: 'add' | 'edit') {
  if (!canManageReplication.value) return;
  action.value = nextAction;
  resetForm();
  if (nextAction === 'add' && props.vmid) form.guest = props.vmid;
  if (nextAction === 'edit' && selectedTask.value)
    Object.assign(form, {
      id: selectedTask.value.id,
      guest: String(selectedTask.value.guest || ''),
      target: String(selectedTask.value.target || ''),
      schedule: String(selectedTask.value.schedule || '*/15'),
      rate: String(selectedTask.value.rate || ''),
      comment: String(selectedTask.value.comment || ''),
      enabled: !(Number(selectedTask.value.disable) === 1 || selectedTask.value.disable === true),
    });
  formVisible.value = true;
  if (nextAction === 'edit' && selectedTask.value?.id) {
    void loadForm(selectedTask.value.id);
  }
}
async function loadForm(id: string) {
  formLoading.value = true;
  try {
    const response = await getReplicationTask(id);
    const task: Partial<ReplicationTask> = response.data || {};
    Object.assign(form, {
      id: task.id || id,
      guest: String(task.guest || selectedTask.value?.guest || ''),
      target: String(task.target || selectedTask.value?.target || ''),
      schedule: String(task.schedule || '*/15'),
      rate: String(task.rate || ''),
      comment: String(task.comment || ''),
      enabled: !(Number(task.disable) === 1 || task.disable === true),
    });
  } finally {
    formLoading.value = false;
  }
}
async function save() {
  if (!canManageReplication.value || !form.guest || !form.target || !form.schedule) return;
  formSaving.value = true;
  try {
    const jobNums = tasks.value
      .filter((task) => String(task.guest || '') === String(form.guest))
      .map((task) => Number(task.jobnum))
      .filter((value) => Number.isFinite(value));
    const data = {
      id: action.value === 'add' ? `${form.guest}-${Math.max(-1, ...jobNums) + 1}` : form.id,
      target: action.value === 'add' ? form.target : undefined,
      schedule: form.schedule,
      rate: form.rate || undefined,
      comment: form.comment,
      type: action.value === 'add' ? 'local' : undefined,
      disable: form.enabled ? 0 : 1,
    };
    if (action.value === 'add') await createReplicationTask(data);
    else await updateReplicationTask(form.id, data);
    Notify.create({ type: 'positive', message: gettext('Replication task saved successfully') });
    formVisible.value = false;
    await reload();
  } finally {
    formSaving.value = false;
  }
}
function removeSelected() {
  const task = selectedTask.value;
  if (!canOperate.value || !task) return;
  Dialog.create({
    title: gettext('Delete'),
    message: gettext('Are you sure to delete [%s]?').replace('%s', task.id),
    cancel: true,
    persistent: true,
  }).onOk(() => {
    void (async () => {
      await removeReplicationTask(task.id);
      Notify.create({
        type: 'positive',
        message: gettext('Replication task deleted successfully'),
      });
      await reload();
    })();
  });
}
async function runNow() {
  const task = selectedTask.value;
  if (!canOperate.value || !task) return;
  await runReplicationTask(node.value, task.id);
  Notify.create({ type: 'positive', message: gettext('Replication task started successfully') });
  await reload();
}
async function openLogs() {
  const task = selectedTask.value;
  if (!task) return;
  logsVisible.value = true;
  await loadLogs();
  if (logsTimer) clearInterval(logsTimer);
  logsTimer = setInterval(() => void loadLogs(), 1000);
}
async function loadLogs() {
  const task = selectedTask.value;
  if (!task) return;
  logsLoading.value = true;
  try {
    const response = await getReplicationLogs(node.value, task.id);
    logs.value = (response.data || []).map((item) => String(item.t || ''));
  } finally {
    logsLoading.value = false;
  }
}
function closeLogs() {
  if (logsTimer) clearInterval(logsTimer);
  logsTimer = undefined;
  logsVisible.value = false;
  void reload();
}
watch(node, (value) => {
  if (props.node && value !== props.node) {
    node.value = props.node;
    return;
  }
  void reload();
});
onMounted(() => {
  void loadInitial();
  refreshTimer = setInterval(() => void reload(), 3000);
});
onBeforeUnmount(() => {
  if (refreshTimer) clearInterval(refreshTimer);
  if (logsTimer) clearInterval(logsTimer);
});
</script>

<template>
  <div class="replication-tasks-panel row column q-px-md q-py-sm">
    <q-table
      flat
      :rows="filteredTasks"
      :columns="columns"
      :visible-columns="visibleColumns"
      row-key="id"
      selection="single"
      v-model:selected="selected"
      :loading="loading"
      :no-data-label="gettext('no record can be found')"
      :pagination="{ rowsPerPage: 20 }"
      table-header-class="u-table-header"
      @row-click="rowClick"
      ><template #top
        ><div class="row items-center q-gutter-sm">
       <q-btn
            no-caps
            outline
            size="12px"
            :color="standalone ? 'grey-6' : 'primary'"
            class="u-button"
            :disable="standalone"
            :label="gettext('Add')"
            @click="openForm('add')"
          /><q-btn
            no-caps
            outline
            size="12px"
            :color="canOperate ? 'primary' : 'grey-6'"
            class="u-button"
            :disable="!canOperate"
            :label="gettext('Edit')"
            @click="openForm('edit')"
          /><q-btn
            no-caps
            outline
            size="12px"
            :color="canOperate ? 'negative' : 'grey-6'"
            class="u-button"
            :disable="!canOperate"
            :label="gettext('Remove')"
            @click="removeSelected"
          /><q-btn
            no-caps
            outline
            size="12px"
            :color="canOperate ? 'primary' : 'grey-6'"
            class="u-button"
            :disable="!canOperate"
            :label="gettext('Log')"
            @click="openLogs"
          /><q-btn
            no-caps
            outline
            size="12px"
            :color="canOperate ? 'primary' : 'grey-6'"
            class="u-button"
            :disable="!canOperate"
            :label="gettext('Schedule now')"
            @click="runNow"
          />
        </div>
        <q-space /><q-input
          v-model="filter"
          borderless
          dense
          debounce="300"
          :placeholder="gettext('Search')"
          ><template #append><q-icon name="search" /></template></q-input></template
      ><template #body-cell-enabled="props"
        ><q-td :props="props"
          ><q-icon
            :name="props.value ? 'check' : 'close'"
            :class="props.value ? 'text-green' : 'text-red'" /></q-td></template
      ><template #body-cell-status="props"
        ><q-td :props="props" :class="{ 'replication-row-loading': props.row.pid }"
          ><template v-if="!props.row.pid"
            ><q-icon
              v-if="props.row.remove_job"
              name="block"
              class="text-warning q-mr-xs"
              :title="gettext('Removal Scheduled')"
            /><q-icon
              v-else-if="props.row.error"
              name="close"
              class="text-red q-mr-xs"
              :title="gettext('Error')"
            /><q-icon v-else name="check" class="text-green q-mr-xs" />{{ props.value }}</template
          ></q-td
        ></template
      ></q-table
    >
    <q-inner-loading :showing="standalone" class="replication-standalone-mask">
      <div class="replication-standalone-mask__content row items-center no-wrap">
        <q-icon name="warning" size="22px" class="q-mr-sm" />
        <span>{{ gettext('Replication needs at least two nodes') }}</span>
      </div>
    </q-inner-loading>
  </div>
  <q-dialog v-model="formVisible" persistent transition-show="scale" transition-hide="scale"
    ><UWindow :title="formTitle" width="580px" :loading="formLoading"
      ><q-form class="replication-form u-dense q-pa-md" @submit="save"
        ><div class="row q-col-gutter-lg">
          <div class="col-12 col-sm-6">
            <q-select
              v-if="action === 'add' && !props.vmid"
              v-model="form.guest"
              dense
              options-dense
              emit-value
              map-options
              option-value="vmid"
              :option-label="(item) => `${item.name || ''}--${item.vmid}`"
              :options="vms.filter((item) => item.node === node)"
              class="q-field--with-bottom"
              label="CT/VM ID"
            /><q-input
              v-else
              v-model="form.guest"
              dense
              readonly
              class="q-field--with-bottom"
              label="CT/VM ID"
            /><q-select
              v-if="action === 'add'"
              v-model="form.target"
              dense
              options-dense
              emit-value
              map-options
              option-value="node"
              option-label="node"
              :options="onlineNodes.filter((item) => item.node !== node)"
              class="q-field--with-bottom"
              :label="gettext('Target')"
            /><q-input
              v-else
              v-model="form.target"
              dense
              readonly
              class="q-field--with-bottom"
              :label="gettext('Target')"
            /><q-input
              v-model="form.schedule"
              dense
              class="q-field--with-bottom"
              :label="gettext('Schedule')"
              :placeholder="`*/15 - ${gettext('Every {0} minutes').replace('{0}', '15')}`"
            />
          </div>
          <div class="col-12 col-sm-6">
            <q-input
              v-model="form.rate"
              dense
              type="number"
              :label="gettext('Rate limit (MB/s)')"
            /><q-input
              v-model="form.comment"
              dense
              class="q-field--with-bottom"
              :label="gettext('Comment')"
            /><q-checkbox
              v-model="form.enabled"
              dense
              color="primary"
              :label="gettext('Enabled')"
            />
          </div></div></q-form
      ><template #foot
        ><q-btn v-close-popup no-caps flat size="12px" :label="gettext('Cancel')" /><q-btn
          no-caps
          flat
          size="12px"
          class="bg-primary text-grey-1 u-button"
          :disable="formSaving || !form.guest || !form.target || !form.schedule"
          :loading="formSaving"
          :label="gettext(action === 'add' ? 'Add' : 'Save')"
          @click="save" /></template></UWindow
  ></q-dialog>
  <q-dialog v-model="logsVisible" persistent transition-show="scale" transition-hide="scale"
    ><UWindow :title="gettext('Replication Log')" width="800px" :loading="logsLoading"
      ><q-scroll-area style="height: 400px; max-width: 750px"
        ><div class="column q-ma-md text-caption">
          <div v-for="(log, index) in logs" :key="index">{{ log }}</div>
        </div></q-scroll-area
      ><template #foot
        ><q-btn
          v-close-popup
          no-caps
          flat
          size="12px"
          class="bg-primary text-grey-1 u-button"
          :label="gettext('Close')"
          @click="closeLogs" /></template></UWindow
  ></q-dialog>
</template>
<style scoped>
.replication-tasks-panel {
  position: relative;
  min-height: 160px;
}
.replication-form :deep(.q-field--with-bottom) {
  padding-bottom: 15px;
}
.replication-form :deep(.q-field__bottom) {
  display: none;
}
.replication-standalone-mask {
  background: rgba(241, 245, 249, 0.8);
  backdrop-filter: blur(1px);
}
.replication-standalone-mask__content {
  padding: 12px 18px;
  color: #52606d;
  font-size: 13px;
  font-weight: 500;
  background: #fff;
  border: 1px solid #cbd5e1;
  border-radius: 3px;
  box-shadow: 0 4px 12px rgba(51, 65, 85, 0.14);
}
.replication-row-loading {
  background: linear-gradient(
      90deg,
      rgba(25, 118, 210, 0.08) 25%,
      rgba(25, 118, 210, 0.18) 37%,
      rgba(25, 118, 210, 0.08) 63%
    )
    0 0 / 400% 100%;
  animation: replication-row-loading 1.4s ease infinite;
}
@keyframes replication-row-loading {
  0% {
    background-position: 100% 0;
  }
  100% {
    background-position: 0 0;
  }
}
</style>
