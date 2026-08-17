<script setup lang="ts">
import { Dialog, Notify, type QTableColumn } from 'quasar';
import { computed, onMounted, onBeforeUnmount, reactive, ref } from 'vue';
import {
  createReplicationTask,
  getClusterReplicationTasks,
  getReplicationLogs,
  getReplicationTasks,
  getReplicationTask,
  removeReplicationTask,
  runReplicationTask,
  updateReplicationTask,
  type ReplicationTask,
} from '@/api/maintenance';
import { getClusterStatus, getNodes, type PveNode } from '@/api/resources';
import UWindow from '@/components/UWindow.vue';
import { gettext } from '@/locale';
import { useSessionStore } from '@/stores/session';

const props = withDefaults(
  defineProps<{
    node?: string;
    vmid?: string | number;
    guestType?: 'qemu' | 'lxc';
    embedded?: boolean;
  }>(),
  { guestType: 'qemu', embedded: false }
);

type Row = ReplicationTask & {
  enabled: boolean;
  rateText: string;
};
const session = useSessionStore();
const loading = ref(false);
const filter = ref('');
const nodes = ref<PveNode[]>([]);
const tasks = ref<Row[]>([]);
const selected = ref<Row[]>([]);
const formVisible = ref(false);
const formLoading = ref(false);
const formSaving = ref(false);
const logVisible = ref(false);
const logLoading = ref(false);
const logLines = ref<string[]>([]);
const scheduleNowLoading = ref(false);
const action = ref<'add' | 'edit'>('add');
const standalone = ref(false);
let refreshTimer: ReturnType<typeof setInterval> | undefined;
let logRefreshTimer: ReturnType<typeof setInterval> | undefined;
const form = reactive({
  id: '',
  guest: '',
  target: '',
  schedule: '',
  rate: '',
  comment: '',
  enabled: true,
  digest: '',
});
const formErrors = reactive({
  guest: '',
  target: '',
  rate: '',
});
const selectedTask = computed(() => selected.value[0]);
const isGuestScope = computed(() => Boolean(props.node && props.vmid !== undefined));
const isNodeScope = computed(() => Boolean(props.node));
const guestValid = computed(() => {
  const value = String(form.guest);
  return /^\d+$/.test(value) && Number(value) >= 100 && Number(value) <= 999999999;
});
const targetValid = computed(() =>
  nodes.value.some(
    (item) => item.node === form.target && item.status === 'online' && item.node !== props.node
  )
);
const targetOptions = computed(() => nodes.value.filter((item) => item.node !== props.node));
const rateValid = computed(
  () => !form.rate || (Number.isFinite(Number(form.rate)) && Number(form.rate) >= 1)
);
const canManageReplication = computed(() =>
  Boolean((session.caps as unknown as { vms?: Record<string, unknown> }).vms?.['VM.Backup'])
);
const canOperate = computed(
  () => canManageReplication.value && Boolean(selectedTask.value) && !standalone.value
);
const canRunOnNode = computed(() => canOperate.value && Boolean(props.node));
const filteredTasks = computed(() => {
  const key = filter.value.trim().toLowerCase();
  return tasks.value.filter(
    (row) =>
      !key ||
      [row.id, row.guest, row.jobnum, row.target, row.schedule, row.comment]
        .join(' ')
        .toLowerCase()
        .includes(key)
  );
});
const formTitle = computed(
  () => `${gettext(action.value === 'add' ? 'Add' : 'Edit')}: ${gettext('Replication Job')}`
);
function requiredLabel(label: string) {
  return `${label} *`;
}
const scheduleOptions = [
  { value: '*/30', label: gettext('Every {0} minutes').replace('{0}', '30') },
  { value: '*/2:00', label: gettext('Every two hours') },
  { value: '21:00', label: `${gettext('Every day')} 21:00` },
  { value: '2,22:30', label: `${gettext('Every day')} 02:30, 22:30` },
  { value: 'mon..fri 00:00', label: `${gettext('Monday to Friday')} 00:00` },
  { value: 'mon..fri */1:00', label: `${gettext('Monday to Friday')}: ${gettext('hourly')}` },
  {
    value: 'mon..fri 7..18:00/15',
    label: `${gettext('Monday to Friday')}, ${gettext('{0} to {1}')
      .replace('{0}', '07:00')
      .replace('{1}', '18:45')}: ${gettext('Every {0} minutes').replace('{0}', '15')}`,
  },
  { value: 'sun 01:00', label: `${gettext('Sunday')} 01:00` },
  { value: 'monthly', label: `${gettext('Every first day of the Month')} 00:00` },
  { value: 'sat *-1..7 15:00', label: `${gettext('First Saturday each month')} 15:00` },
  { value: 'yearly', label: `${gettext('First day of the year')} 00:00` },
];
const columns: QTableColumn<Row>[] = [
  { name: 'enabled', label: gettext('Enabled'), field: 'enabled', align: 'center', sortable: true },
  { name: 'id', label: 'ID', field: 'id', align: 'left', sortable: true },
  { name: 'guest', label: gettext('Guest'), field: 'guest', align: 'left', sortable: true },
  { name: 'job', label: gettext('Job'), field: 'jobnum', align: 'left' },
  { name: 'target', label: gettext('Target'), field: 'target', align: 'left' },
  { name: 'status', label: gettext('Status'), field: 'id', align: 'left' },
  { name: 'lastSync', label: gettext('Last Sync'), field: 'last_sync', align: 'left' },
  { name: 'duration', label: gettext('Duration'), field: 'duration', align: 'left' },
  { name: 'nextSync', label: gettext('Next Sync'), field: 'next_sync', align: 'left' },
  { name: 'schedule', label: gettext('Schedule'), field: 'schedule', align: 'left' },
  { name: 'rate', label: gettext('Rate limit'), field: 'rateText', align: 'left' },
  { name: 'comment', label: gettext('Comment'), field: 'comment', align: 'left' },
];
const visibleColumns = computed(() => [
  'enabled',
  'guest',
  'job',
  'target',
  ...(isNodeScope.value ? ['status', 'lastSync', 'duration', 'nextSync'] : []),
  'schedule',
  'comment',
]);
function row(task: ReplicationTask): Row {
  return {
    ...task,
    enabled: !(Number(task.disable) === 1 || task.disable === true),
    rateText: task.rate ? `${task.rate} MB/s` : gettext('unlimited'),
  };
}
function rowClick(_: Event, value: Row) {
  selected.value = selectedTask.value === value ? [] : [value];
}
function rowDblClick(_: Event, value: Row) {
  selected.value = [value];
  openForm('edit');
}
function formatTimestamp(value?: number) {
  return value ? new Date(value * 1000).toLocaleString() : '-';
}
function formatDuration(value?: number) {
  if (!value) return '-';
  const seconds = Math.max(0, Math.floor(value));
  const parts = [Math.floor(seconds / 3600), Math.floor((seconds % 3600) / 60), seconds % 60];
  return parts[0] ? `${parts[0]}h ${parts[1]}m ${parts[2]}s` : `${parts[1]}m ${parts[2]}s`;
}
function statusText(task: Row) {
  if (task.pid) return gettext('syncing');
  if (task.remove_job) return gettext('Removal Scheduled');
  return task.error || gettext('OK');
}
function statusIcon(task: Row) {
  if (task.pid) return 'sync';
  if (task.remove_job) return 'block';
  return task.error ? 'close' : 'check';
}
function statusColor(task: Row) {
  if (task.pid) return 'primary';
  if (task.remove_job) return 'warning';
  return task.error ? 'negative' : 'positive';
}
function nextSyncText(task: Row) {
  if (!task.next_sync) return '-';
  return task.next_sync * 1000 < Date.now() ? gettext('pending') : formatTimestamp(task.next_sync);
}
function addScheduleOption(
  value: string,
  done: (value?: string, mode?: 'add' | 'add-unique' | 'toggle') => void
) {
  done(value.trim(), 'add-unique');
}
function validateForm() {
  formErrors.guest = !form.guest
    ? gettext('CT/VM ID is required')
    : !guestValid.value
      ? gettext('CT/VM ID must be between 100 and 999999999')
      : '';
  formErrors.target = !form.target
    ? gettext('Target is required')
    : action.value === 'add' && !targetValid.value
      ? form.target === props.node
        ? gettext('Source and target must not be identical')
        : gettext('Target node seems to be offline')
      : '';
  formErrors.rate = !rateValid.value ? gettext('Rate limit must be at least 1 MB/s') : '';
  return !formErrors.guest && !formErrors.target && !formErrors.rate;
}
async function reload() {
  loading.value = true;
  try {
    const response = isGuestScope.value
      ? await getReplicationTasks(props.node!, props.vmid)
      : await getClusterReplicationTasks();
    tasks.value = [...(response.data || [])]
      .map(row)
      .sort(
        (a, b) =>
          Number(a.guest || 0) - Number(b.guest || 0) ||
          Number(a.jobnum || 0) - Number(b.jobnum || 0)
      );
    const selectedId = selectedTask.value?.id;
    selected.value = selectedId
      ? tasks.value.filter((task) => task.id === selectedId).slice(0, 1)
      : [];
  } catch {
    // Request errors are already surfaced by the API layer; avoid timer rejections.
  } finally {
    loading.value = false;
  }
}
async function loadInitial() {
  try {
    const [nodeResponse, clusterStatusResponse] = await Promise.all([
      getNodes(),
      getClusterStatus(),
    ]);
    nodes.value = nodeResponse.data || [];
    standalone.value = !(clusterStatusResponse.data || []).some((item) => item.type === 'cluster');
    if (!standalone.value) {
      await reload();
      refreshTimer = setInterval(() => void reload(), 3000);
    }
  } catch {
    // Request errors are already surfaced by the API layer.
  }
}
function resetForm() {
  Object.assign(form, {
    id: '',
    guest: isGuestScope.value ? String(props.vmid) : '',
    target: '',
    schedule: '',
    rate: '',
    comment: '',
    enabled: true,
    digest: '',
  });
  Object.assign(formErrors, { guest: '', target: '', rate: '' });
}
function openForm(nextAction: 'add' | 'edit') {
  if (!canManageReplication.value) return;
  action.value = nextAction;
  resetForm();
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
      digest: String(task.digest || ''),
    });
  } finally {
    formLoading.value = false;
  }
}
async function save() {
  if (!canManageReplication.value || !validateForm()) return;
  formSaving.value = true;
  try {
    const jobNums = tasks.value
      .filter((task) => String(task.guest || '') === String(form.guest))
      .map((task) => Number(task.jobnum))
      .filter((value) => Number.isFinite(value));
    const deleteFields =
      action.value === 'edit'
        ? [
            !form.rate ? 'rate' : '',
            !form.comment ? 'comment' : '',
            form.schedule === '*/15' ? 'schedule' : '',
            form.enabled ? 'disable' : '',
          ].filter(Boolean)
        : [];
    const data = {
      id: action.value === 'add' ? `${form.guest}-${Math.max(-1, ...jobNums) + 1}` : form.id,
      target: action.value === 'add' ? form.target : undefined,
      schedule:
        action.value === 'edit' && form.schedule === '*/15'
          ? undefined
          : form.schedule || undefined,
      rate: form.rate || undefined,
      comment: form.comment || undefined,
      type: action.value === 'add' ? 'local' : undefined,
      disable: action.value === 'add' && form.enabled ? undefined : form.enabled ? 0 : 1,
      ...(deleteFields.length ? { delete: deleteFields.join(',') } : {}),
      ...(action.value === 'edit' && form.digest ? { digest: form.digest } : {}),
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
async function loadLog() {
  const task = selectedTask.value;
  if (!props.node || !task) return;
  logLoading.value = true;
  try {
    const response = await getReplicationLogs(props.node, task.id);
    logLines.value = (response.data || []).map((item) => String(item.t || ''));
  } catch {
    // Request errors are already surfaced by the API layer.
  } finally {
    logLoading.value = false;
  }
}
function openLog() {
  if (!canRunOnNode.value) return;
  logVisible.value = true;
  void loadLog();
  if (logRefreshTimer) clearInterval(logRefreshTimer);
  logRefreshTimer = setInterval(() => void loadLog(), 1000);
}
function closeLog() {
  if (logRefreshTimer) clearInterval(logRefreshTimer);
  logRefreshTimer = undefined;
  void reload();
}
async function scheduleNow() {
  const task = selectedTask.value;
  if (!props.node || !task || !canRunOnNode.value) return;
  scheduleNowLoading.value = true;
  try {
    await runReplicationTask(props.node, task.id);
    await reload();
  } finally {
    scheduleNowLoading.value = false;
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
onMounted(() => {
  void loadInitial();
});
onBeforeUnmount(() => {
  if (refreshTimer) clearInterval(refreshTimer);
  if (logRefreshTimer) clearInterval(logRefreshTimer);
});
</script>

<template>
  <div class="replication-tasks-panel row column">
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
      @row-dblclick="rowDblClick"
    >
      <template #top>
        <div class="row items-center q-gutter-sm">
          <q-btn
            no-caps
            outline
            size="12px"
            :color="standalone ? 'grey-6' : 'primary'"
            class="u-button"
            :disable="standalone || !canManageReplication"
            :label="gettext('Add')"
            @click="openForm('add')"
          />
          <q-btn
            no-caps
            outline
            size="12px"
            :color="canOperate ? 'primary' : 'grey-6'"
            class="u-button"
            :disable="!canOperate"
            :label="gettext('Edit')"
            @click="openForm('edit')"
          />
          <q-btn
            no-caps
            outline
            size="12px"
            :color="canOperate ? 'negative' : 'grey-6'"
            class="u-button"
            :disable="!canOperate"
            :label="gettext('Remove')"
            @click="removeSelected"
          />
          <q-btn
            v-if="isNodeScope"
            no-caps
            outline
            size="12px"
            :color="canRunOnNode ? 'primary' : 'grey-6'"
            class="u-button"
            :disable="!canRunOnNode"
            :label="gettext('Log')"
            @click="openLog"
          />
          <q-btn
            v-if="isNodeScope"
            no-caps
            outline
            size="12px"
            :color="canRunOnNode ? 'primary' : 'grey-6'"
            class="u-button"
            :disable="!canRunOnNode"
            :loading="scheduleNowLoading"
            :label="gettext('Schedule now')"
            @click="scheduleNow"
          />
        </div>
        <q-space />
        <q-input
          v-model="filter"
          borderless
          dense
          debounce="300"
          :placeholder="gettext('Search')"
        >
          <template #append><q-icon name="search" /></template>
        </q-input>
      </template>
      <template #body-cell-enabled="props">
        <q-td :props="props">
          <q-icon
            :name="props.value ? 'check' : 'close'"
            :class="props.value ? 'text-green' : 'text-red'"
          />
        </q-td>
      </template>
      <template #body-cell-status="cellProps">
        <q-td :props="cellProps">
          <q-icon
            :name="statusIcon(cellProps.row)"
            :color="statusColor(cellProps.row)"
            class="q-mr-xs"
          />
          <span>{{ statusText(cellProps.row) }}</span>
        </q-td>
      </template>
      <template #body-cell-lastSync="cellProps">
        <q-td :props="cellProps">
          {{ cellProps.row.pid ? gettext('syncing') : formatTimestamp(cellProps.row.last_sync) }}
        </q-td>
      </template>
      <template #body-cell-duration="cellProps">
        <q-td :props="cellProps">{{ formatDuration(cellProps.row.duration) }}</q-td>
      </template>
      <template #body-cell-nextSync="cellProps">
        <q-td :props="cellProps">{{ nextSyncText(cellProps.row) }}</q-td>
      </template>
    </q-table>
    <q-inner-loading
      :showing="standalone"
      class="replication-standalone-mask"
    >
      <div class="replication-standalone-mask__content row items-center no-wrap">
        <q-icon
          name="warning"
          size="22px"
          class="q-mr-sm"
        />
        <span>{{ gettext('Replication needs at least two nodes') }}</span>
      </div>
    </q-inner-loading>
  </div>
  <q-dialog
    v-model="formVisible"
    persistent
    transition-show="scale"
    transition-hide="scale"
  >
    <UWindow
      :title="formTitle"
      width="580px"
      :loading="formLoading"
    >
      <q-form
        class="replication-form u-dense q-pa-md"
        @submit="save"
      >
        <div class="row q-col-gutter-lg">
          <div class="col-12 col-sm-6">
            <q-input
              v-if="action === 'add'"
              v-model="form.guest"
              dense
              type="number"
              :readonly="isGuestScope"
              min="100"
              max="999999999"
              :label="requiredLabel('CT/VM ID')"
              :error="Boolean(formErrors.guest)"
              :error-message="formErrors.guest"
              @update:model-value="formErrors.guest = ''"
              :rules="[
                (value) => Boolean(value) || gettext('CT/VM ID is required'),
                (value) =>
                  (String(value).match(/^\d+$/) &&
                    Number(value) >= 100 &&
                    Number(value) <= 999999999) ||
                  gettext('CT/VM ID must be between 100 and 999999999'),
              ]"
              class="q-field--with-bottom"
            />
            <q-input
              v-else
              v-model="form.guest"
              dense
              readonly
              class="q-field--with-bottom"
              label="CT/VM ID"
            />
            <q-select
              v-if="action === 'add'"
              v-model="form.target"
              dense
              options-dense
              emit-value
              map-options
              option-value="node"
              option-label="node"
              :options="targetOptions"
              :label="requiredLabel(gettext('Target'))"
              :error="Boolean(formErrors.target)"
              :error-message="formErrors.target"
              @update:model-value="formErrors.target = ''"
              :rules="[
                (value) => Boolean(value) || gettext('Target is required'),
                () => targetValid || gettext('Target node seems to be offline'),
              ]"
              class="q-field--with-bottom"
            />
            <q-input
              v-else
              v-model="form.target"
              dense
              readonly
              class="q-field--with-bottom"
              :label="gettext('Target')"
            />
            <q-select
              v-model="form.schedule"
              dense
              options-dense
              use-input
              fill-input
              hide-selected
              emit-value
              map-options
              option-value="value"
              option-label="label"
              :options="scheduleOptions"
              @new-value="addScheduleOption"
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
              min="1"
              step="1"
              :rules="[
                (value) =>
                  !value ||
                  (Number.isFinite(Number(value)) && Number(value) >= 1) ||
                  gettext('Rate limit must be at least 1 MB/s'),
              ]"
              :error="Boolean(formErrors.rate)"
              :error-message="formErrors.rate"
              @update:model-value="formErrors.rate = ''"
              class="q-field--with-bottom"
              :label="gettext('Rate limit (MB/s)')"
            />
            <q-input
              v-model="form.comment"
              dense
              class="q-field--with-bottom"
              :label="gettext('Comment')"
            />
            <q-checkbox
              v-model="form.enabled"
              dense
              color="primary"
              :label="gettext('Enabled')"
            />
          </div>
        </div>
      </q-form>
      <template #foot>
        <q-btn
          v-close-popup
          no-caps
          flat
          size="12px"
          :label="gettext('Cancel')"
        />
        <q-btn
          no-caps
          flat
          size="12px"
          class="bg-primary text-grey-1 u-button"
          :disable="formSaving"
          :loading="formSaving"
          :label="gettext(action === 'add' ? 'Add' : 'Save')"
          @click="save"
        />
      </template>
    </UWindow>
  </q-dialog>
  <q-dialog
    v-model="logVisible"
    persistent
    transition-show="scale"
    transition-hide="scale"
    @hide="closeLog"
  >
    <UWindow
      :title="gettext('Replication Log')"
      width="800px"
      :loading="logLoading"
    >
      <q-scroll-area class="replication-log">
        <p
          v-for="(line, index) in logLines"
          :key="index"
          class="replication-log__line"
        >
          {{ line }}
        </p>
        <p
          v-if="!logLines.length"
          class="replication-log__line"
        >
          {{ gettext('No logs found') }}
        </p>
      </q-scroll-area>
      <template #foot>
        <q-btn
          v-close-popup
          no-caps
          flat
          size="12px"
          :label="gettext('Close')"
        />
      </template>
    </UWindow>
  </q-dialog>
</template>
<style scoped>
.replication-tasks-panel {
  position: relative;
  min-height: 160px;
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
.replication-log {
  height: 350px;
  background: #f7f9fc;
  color: #4b5563;
  font-family: Consolas, 'Courier New', monospace;
  font-size: 13px;
  line-height: 1.6;
}
.replication-log__line {
  border-bottom: 1px solid #edf0f4;
  margin: 0;
  padding: 4px 14px;
  white-space: pre-wrap;
}
</style>
