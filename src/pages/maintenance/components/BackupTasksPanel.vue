<script setup lang="ts">
import { Dialog, Notify, type QTableColumn } from 'quasar';
import { computed, onMounted, reactive, ref } from 'vue';
import {
  createBackupTask,
  getBackupIncludedVolumes,
  getBackupTask,
  getBackupTasks,
  getGuestsWithoutBackupTask,
  removeBackupTask,
  runBackupTask,
  simulateBackupSchedule,
  type BackupTask,
  updateBackupTask,
} from '@/api/maintenance';
import UWindow from '@/components/UWindow.vue';
import { getNodeStorages, getStorages } from '@/api/storage';
import { getNodes } from '@/api/host';
import { getClusterResources, getPools, type PveRecord } from '@/api/resources';
import { gettext } from '@/locale';
import { textValue } from '@/utils/pveFormat';

type BackupTaskRow = BackupTask & {
  enabledText: string;
  nodeText: string;
  nextRunText: string;
  guestText: string;
};

const loading = ref(false);
const filter = ref('');
const tasks = ref<BackupTaskRow[]>([]);
const selectedTasks = ref<BackupTaskRow[]>([]);
const detailVisible = ref(false);
const detailLoading = ref(false);
const includedVolumes = ref<PveRecord[]>([]);
const detailFilter = ref('');
const runNowLoading = ref(false);
const formVisible = ref(false);
const formLoading = ref(false);
const formSaving = ref(false);
const formAction = ref<'add' | 'edit'>('add');
const formTab = ref('convention');
const formOptionsLoading = ref(false);
const nodeOptions = ref<PveRecord[]>([]);
const storageOptions = ref<PveRecord[]>([]);
const allStorageOptions = ref<PveRecord[]>([]);
const poolOptions = ref<PveRecord[]>([]);
const vmOptions = ref<PveRecord[]>([]);
const vmFilter = ref('');
const guestsVisible = ref(false);
const guestsLoading = ref(false);
const guests = ref<Record<string, unknown>[]>([]);
const simulatorVisible = ref(false);
const simulatorLoading = ref(false);
const simulationRows = ref<Record<string, unknown>[]>([]);
const simulatorSplitter = ref(50);
const taskForm = reactive({
  id: '',
  node: '',
  storage: '',
  schedule: '',
  selectionMode: 'include',
  selectedVmids: [] as string[],
  pool: '',
  enabled: true,
  mode: 'snapshot',
  compress: 'zstd',
  comment: '',
  notificationMode: '__default__',
  mailto: '',
  mailnotification: 'always',
  notesTemplate: '{{guestname}}',
  keepAll: false,
  keepLast: '',
  keepHourly: '',
  keepDaily: '',
  keepWeekly: '',
  keepMonthly: '',
  keepYearly: '',
  bwlimit: '',
  zstd: '',
  maxWorkers: '',
  fleecingEnabled: false,
  fleecingStorage: '',
  repeatMissed: false,
  pbsChangeDetectionMode: '__default__',
});
const simulatorForm = reactive({ schedule: '', iterations: 10 });

const selectedTask = computed(() => selectedTasks.value[0]);
const canOperate = computed(() => selectedTasks.value.length === 1);
const formTitle = computed(
  () => `${gettext(formAction.value === 'add' ? 'Add' : 'Edit')}: ${gettext('Backup Task')}`,
);
const filteredTasks = computed(() => {
  const keyword = filter.value.trim().toLowerCase();
  if (!keyword) return tasks.value;
  return tasks.value.filter((task) =>
    [task.id, task.nodeText, task.schedule, task.type, task.storage, task.guestText]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()
      .includes(keyword),
  );
});
const filteredVmOptions = computed(() => {
  const keyword = vmFilter.value.trim().toLowerCase();
  if (!keyword) return vmOptions.value;
  return vmOptions.value.filter((item) =>
    [item.vmid, item.name, item.node, item.type].join(' ').toLowerCase().includes(keyword),
  );
});
const selectedVmRows = computed(() =>
  vmOptions.value.filter((item) => taskForm.selectedVmids.includes(textValue(item.vmid))),
);
const planOptions = [
  ['*/30', 'Every 30 minutes'],
  ['*/2:00', 'Every two hours'],
  ['21:00', 'Every day at 21:00'],
  ['2,22:30', 'Every day 02:30 22:30'],
  ['mon..fri 00:00', 'Monday to Friday 00:00'],
  ['mon..fri */1:00', 'Monday to Friday: hourly'],
  ['sun 01:00', 'Sunday 01:00'],
  ['monthly', 'On the first day of each month at 00:00'],
  ['yearly', 'On the first day of each year at 00:00'],
].map(([value, label]) => ({ value, label: gettext(label || '') }));
const detailTree = computed(() => filterDetailTree(includedVolumes.value, detailFilter.value));

const columns: QTableColumn<BackupTaskRow>[] = [
  {
    name: 'enabled',
    label: gettext('Enabled'),
    field: 'enabledText',
    align: 'left',
    sortable: true,
  },
  { name: 'node', label: gettext('Node'), field: 'nodeText', align: 'left', sortable: true },
  { name: 'schedule', label: gettext('Plan'), field: 'schedule', align: 'left', sortable: true },
  {
    name: 'next-run',
    label: gettext('Next Run Time'),
    field: 'nextRunText',
    align: 'left',
    sortable: true,
  },
  { name: 'type', label: gettext('Type'), field: 'type', align: 'left', sortable: true },
  { name: 'storage', label: gettext('Storage'), field: 'storage', align: 'left', sortable: true },
  { name: 'vmid', label: gettext('VMID'), field: 'guestText', align: 'left', sortable: true },
];

function formatTimestamp(value?: number) {
  if (!value) return '';
  return new Intl.DateTimeFormat(undefined, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(new Date(value * 1000));
}

function guestText(task: BackupTask) {
  if (task.vmid) return String(task.vmid);
  if (task.pool) return `${gettext('Pool')}: ${task.pool}`;
  if (task.exclude) return `${gettext('All except')} ${task.exclude}`;
  return task.all ? gettext('All') : '';
}

function toRow(task: BackupTask): BackupTaskRow {
  return {
    ...task,
    enabledText:
      Number(task.enabled) === 0 || task.enabled === false
        ? gettext('Disabled')
        : gettext('Enabled'),
    nodeText: task.node || gettext('All'),
    nextRunText: formatTimestamp(task['next-run']),
    guestText: guestText(task),
  };
}

function rowClick(_: Event, row: BackupTaskRow) {
  selectedTasks.value = selectedTask.value === row ? [] : [row];
}

async function reload() {
  loading.value = true;
  try {
    const response = await getBackupTasks();
    tasks.value = [...(response.data || [])]
      .map(toRow)
      .sort((left, right) => left.id.localeCompare(right.id));
    selectedTasks.value = [];
  } finally {
    loading.value = false;
  }
}

async function showDetails() {
  const task = selectedTask.value;
  if (!task) return;
  detailVisible.value = true;
  detailLoading.value = true;
  try {
    const response = await getBackupIncludedVolumes(task.id);
    includedVolumes.value = response.data || [];
    detailFilter.value = '';
  } finally {
    detailLoading.value = false;
  }
}

function formatDetailTimestamp(value: unknown) {
  const seconds = Number(value);
  if (!seconds) return '-';
  return new Intl.DateTimeFormat(undefined, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(new Date(seconds * 1000));
}
function nextRunText(value: unknown) {
  return Number(value) && Number(value) < Date.now() / 1000
    ? gettext('pending')
    : formatDetailTimestamp(value);
}
function detailSelectionMode(task: BackupTaskRow) {
  return task.vmid
    ? gettext('Include selected VMs')
    : task.all
      ? gettext('All')
      : task.exclude
        ? gettext('Exclude selected VMs')
        : task.pool
          ? gettext('Pool based')
          : '-';
}
function detailNotification(task: BackupTaskRow) {
  const mode = task['notification-mode'];
  return mode === 'notification-system' || (mode === 'auto' && !task.mailto)
    ? gettext('Use global notification settings')
    : task.mailnotification === 'failure'
      ? gettext('Send email on failure')
      : gettext('Always send email');
}
function treeLabel(item: PveRecord) {
  const id = textValue(item.id);
  return item.type
    ? `${id}${item.name ? ` (${textValue(item.name)})` : ''}`
    : `${id.split(':')[1] || id} - ${textValue(item.name)}`;
}
function includedText(item: PveRecord) {
  const value = item.included;
  if (value === undefined) return '-';
  return ['1', 'on', 'yes', 'true'].includes(textValue(value).toLowerCase())
    ? gettext('Enabled')
    : gettext('Disabled');
}
function filterDetailTree(nodes: PveRecord[], filter: string): PveRecord[] {
  const keyword = filter.trim().toLowerCase();
  return nodes.reduce<PveRecord[]>((result, item) => {
    const children = Array.isArray(item.children)
      ? filterDetailTree(item.children as PveRecord[], filter)
      : [];
    const matches =
      !keyword ||
      treeLabel(item).toLowerCase().includes(keyword) ||
      textValue(item.type).toLowerCase().includes(keyword);
    if (matches || children.length)
      result.push({ ...item, label: treeLabel(item), includedText: includedText(item), children });
    return result;
  }, []);
}
function scheduleDate(value: unknown) {
  const raw = Number(value);
  return Number.isFinite(raw)
    ? new Intl.DateTimeFormat(undefined, {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(new Date(raw > 1e12 ? raw : raw * 1000))
    : textValue(value);
}
function scheduleTime(value: unknown) {
  const raw = Number(value);
  return Number.isFinite(raw)
    ? new Intl.DateTimeFormat(undefined, {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
      }).format(new Date(raw > 1e12 ? raw : raw * 1000))
    : '';
}

function resetTaskForm() {
  Object.assign(taskForm, {
    id: '',
    node: '',
    storage: '',
    schedule: '',
    selectionMode: 'include',
    selectedVmids: [],
    pool: '',
    enabled: true,
    mode: 'snapshot',
    compress: 'zstd',
    comment: '',
    notificationMode: '__default__',
    mailto: '',
    mailnotification: 'always',
    notesTemplate: '{{guestname}}',
    keepAll: false,
    keepLast: '',
    keepHourly: '',
    keepDaily: '',
    keepWeekly: '',
    keepMonthly: '',
    keepYearly: '',
    bwlimit: '',
    zstd: '',
    maxWorkers: '',
    fleecingEnabled: false,
    fleecingStorage: '',
    repeatMissed: false,
    pbsChangeDetectionMode: '__default__',
  });
}

async function loadFormOptions() {
  formOptionsLoading.value = true;
  try {
    const [nodes, storages, pools, vms, allStorages] = await Promise.all([
      getNodes(),
      getNodeStorages('localhost', { format: 1, content: 'backup' }),
      getPools(),
      getClusterResources({ type: 'vm' }),
      getStorages(),
    ]);
    nodeOptions.value = nodes.data || [];
    storageOptions.value = storages.data || [];
    poolOptions.value = pools.data || [];
    vmOptions.value = vms.data || [];
    allStorageOptions.value = allStorages.data || [];
  } finally {
    formOptionsLoading.value = false;
  }
}

async function openTaskForm(action: 'add' | 'edit') {
  formAction.value = action;
  resetTaskForm();
  formTab.value = 'convention';
  void loadFormOptions();
  if (action === 'edit' && selectedTask.value) {
    formLoading.value = true;
    try {
      const response = await getBackupTask(selectedTask.value.id);
      const data = response.data || selectedTask.value;
      Object.assign(taskForm, {
        id: textValue(data.id),
        node: textValue(data.node),
        storage: textValue(data.storage),
        schedule: textValue(data.schedule),
        enabled: !(Number(data.enabled) === 0 || data.enabled === false),
        mode: textValue(data.mode, 'snapshot'),
        compress: textValue(data.compress, 'zstd'),
        comment: textValue(data.comment),
        notificationMode: textValue(data['notification-mode'], '__default__'),
        mailto: textValue(data.mailto),
        mailnotification: textValue(
          data.mailnotification,
          textValue(data['notification-policy'], 'always'),
        ),
        notesTemplate: textValue(data['notes-template'], '{{guestname}}'),
        bwlimit: textValue(data.bwlimit),
        zstd: textValue(data.zstd),
        maxWorkers: textValue(data['max-workers']),
        fleecingEnabled: Boolean(data['fleecing-enabled']),
        fleecingStorage: textValue(data['fleecing-storage']),
        repeatMissed: Boolean(data['repeat-missed']),
        pbsChangeDetectionMode: textValue(data['pbs-change-detection-mode'], '__default__'),
      });
      taskForm.selectionMode = data.exclude
        ? 'exclude'
        : data.all
          ? 'all'
          : data.pool
            ? 'pool'
            : 'include';
      taskForm.pool = textValue(data.pool);
      taskForm.selectedVmids = textValue(data.exclude, textValue(data.vmid))
        .split(',')
        .filter(Boolean);
      const prune =
        typeof data['prune-backups'] === 'object' && data['prune-backups']
          ? (data['prune-backups'] as PveRecord)
          : {};
      taskForm.keepAll = Boolean(prune['keep-all']);
      taskForm.keepLast = textValue(prune['keep-last']);
      taskForm.keepHourly = textValue(prune['keep-hourly']);
      taskForm.keepDaily = textValue(prune['keep-daily']);
      taskForm.keepWeekly = textValue(prune['keep-weekly']);
      taskForm.keepMonthly = textValue(prune['keep-monthly']);
      taskForm.keepYearly = textValue(prune['keep-yearly']);
    } finally {
      formLoading.value = false;
    }
  }
  formVisible.value = true;
}

async function saveTask() {
  if (!taskForm.storage || !taskForm.schedule) return;
  formSaving.value = true;
  try {
    const selectedVmids = taskForm.selectedVmids.join(',');
    const pruneBackups = taskForm.keepAll
      ? 'keep-all=1'
      : [
          ['keep-last', taskForm.keepLast],
          ['keep-hourly', taskForm.keepHourly],
          ['keep-daily', taskForm.keepDaily],
          ['keep-weekly', taskForm.keepWeekly],
          ['keep-monthly', taskForm.keepMonthly],
          ['keep-yearly', taskForm.keepYearly],
        ]
          .filter(([, value]) => value !== '')
          .map(([key, value]) => `${key}=${value}`)
          .join(',');
    const data: Record<string, unknown> = {
      node: taskForm.node || undefined,
      storage: taskForm.storage,
      schedule: taskForm.schedule,
      vmid: taskForm.selectionMode === 'include' ? selectedVmids : undefined,
      all: ['all', 'exclude'].includes(taskForm.selectionMode) ? 1 : undefined,
      exclude: taskForm.selectionMode === 'exclude' ? selectedVmids : undefined,
      pool: taskForm.selectionMode === 'pool' ? taskForm.pool : undefined,
      enabled: taskForm.enabled ? 1 : 0,
      mode: taskForm.mode,
      compress: taskForm.compress,
      comment: taskForm.comment,
      'notification-mode': taskForm.notificationMode,
      mailto: taskForm.mailto,
      mailnotification: taskForm.mailnotification,
      'notes-template': taskForm.notesTemplate,
      'prune-backups': pruneBackups,
      bwlimit: taskForm.bwlimit,
      zstd: taskForm.zstd,
      'max-workers': taskForm.maxWorkers,
      'fleecing-enabled': taskForm.fleecingEnabled ? 1 : 0,
      'fleecing-storage': taskForm.fleecingStorage,
      'repeat-missed': taskForm.repeatMissed ? 1 : 0,
      'pbs-change-detection-mode': taskForm.pbsChangeDetectionMode,
    };
    if (formAction.value === 'add') {
      const id = taskForm.id || `backup-${crypto.randomUUID().slice(0, 13)}`;
      await createBackupTask({ ...data, id });
    } else {
      await updateBackupTask(taskForm.id, data);
    }
    Notify.create({ type: 'positive', message: gettext('Backup task saved successfully') });
    formVisible.value = false;
    await reload();
  } finally {
    formSaving.value = false;
  }
}

function removeSelected() {
  const task = selectedTask.value;
  if (!task) return;
  Dialog.create({
    title: gettext('Delete'),
    message: `${gettext('Delete backup task')} ${task.id}?`,
    cancel: true,
    persistent: true,
  }).onOk(() => {
    void (async () => {
      await removeBackupTask(task.id);
      Notify.create({ type: 'positive', message: gettext('Backup task deleted successfully') });
      await reload();
    })();
  });
}

function createRunPayload(task: BackupTaskRow) {
  const payload: Record<string, unknown> = { ...task };
  [
    'id',
    'enabled',
    'starttime',
    'dow',
    'schedule',
    'type',
    'node',
    'comment',
    'next-run',
    'repeat-missed',
    'enabledText',
    'nodeText',
    'nextRunText',
    'guestText',
  ].forEach((key) => delete payload[key]);
  ['performance', 'prune-backups', 'fleecing'].forEach((key) => {
    const value = payload[key];
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      payload[key] = Object.entries(value as Record<string, unknown>)
        .filter(([, item]) => item !== '')
        .map(
          ([name, item]) =>
            `${name}=${Array.isArray(item) ? item.map((entry) => textValue(entry)).join(';') : textValue(item)}`,
        )
        .sort()
        .join(',');
    }
  });
  payload.all = task.all ? 1 : 0;
  return payload;
}

function runSelected() {
  const task = selectedTask.value;
  if (!task) return;
  Dialog.create({
    title: gettext('Run now'),
    message: gettext('Start the selected backup job now?'),
    cancel: true,
    persistent: true,
  }).onOk(() => {
    void (async () => {
      runNowLoading.value = true;
      try {
        const response = await getNodes();
        const onlineNodes = (response.data || [])
          .filter((item) => item.status === 'online')
          .map((item) => item.node);
        const targetNodes = task.node ? [task.node] : onlineNodes;
        if (task.node && !onlineNodes.includes(task.node)) {
          Notify.create({
            type: 'negative',
            message: gettext('Node [%s] from backup job is not online!').replace('%s', task.node),
          });
          return;
        }
        const results = await Promise.allSettled(
          targetNodes.map((node) => runBackupTask(node, createRunPayload(task))),
        );
        const failedNodes = results.flatMap((result, index) =>
          result.status === 'rejected' ? [targetNodes[index]] : [],
        );
        if (failedNodes.length) {
          Notify.create({
            type: 'negative',
            message: `${gettext('Backup job failed on nodes')}: ${failedNodes.join(', ')}`,
          });
        } else {
          Notify.create({ type: 'positive', message: gettext('Backup task started successfully') });
        }
      } finally {
        runNowLoading.value = false;
      }
    })();
  });
}

async function openGuestsWithoutBackup() {
  guestsVisible.value = true;
  guestsLoading.value = true;
  try {
    const response = await getGuestsWithoutBackupTask();
    guests.value = response.data || [];
  } finally {
    guestsLoading.value = false;
  }
}

function openScheduleSimulator() {
  simulatorForm.schedule = selectedTask.value?.schedule || '';
  simulatorForm.iterations = 10;
  simulationRows.value = [];
  simulatorVisible.value = true;
}

async function runScheduleSimulator() {
  if (!simulatorForm.schedule || !simulatorForm.iterations) return;
  simulatorLoading.value = true;
  try {
    const response = await simulateBackupSchedule(simulatorForm.schedule, simulatorForm.iterations);
    simulationRows.value = response.data || [];
  } finally {
    simulatorLoading.value = false;
  }
}

onMounted(() => void reload());
</script>

<template>
  <div class="row column q-px-md q-py-sm">
    <q-table
      flat
      :rows="filteredTasks"
      :columns="columns"
      row-key="id"
      selection="single"
      v-model:selected="selectedTasks"
      :loading="loading"
      :no-data-label="gettext('no record can be found')"
      :pagination="{ rowsPerPage: 20 }"
      table-header-class="u-table-header"
      @row-click="rowClick"
    >
      <template #top>
        <div class="q-gutter-sm">
          <q-btn
            no-caps
            outline
            size="12px"
            color="primary"
            class="u-button"
            :label="gettext('Add')"
            @click="openTaskForm('add')"
          />
          <q-btn
            no-caps
            outline
            size="12px"
            color="primary"
            class="u-button"
            :label="gettext('Edit')"
            :disable="!canOperate"
            @click="openTaskForm('edit')"
          />
          <q-btn
            no-caps
            outline
            size="12px"
            color="negative"
            class="u-button"
            :label="gettext('Delete')"
            :disable="!canOperate"
            @click="removeSelected"
          />
          <q-btn
            no-caps
            outline
            size="12px"
            color="primary"
            class="u-button"
            :label="gettext('Backup Details')"
            :disable="!canOperate"
            @click="showDetails"
          />
          <q-btn
            no-caps
            outline
            size="12px"
            color="primary"
            class="u-button"
            :label="gettext('Run now')"
            :disable="!canOperate || runNowLoading"
            @click="runSelected"
          />
          <q-btn
            no-caps
            outline
            size="12px"
            color="primary"
            class="u-button"
            :label="gettext('Guests Without Backup Job')"
            @click="openGuestsWithoutBackup"
          />
          <q-btn
            no-caps
            outline
            size="12px"
            color="primary"
            class="u-button"
            :label="gettext('Schedule Simulator')"
            @click="openScheduleSimulator"
          />
          <q-btn flat round dense icon="refresh" :aria-label="gettext('Refresh')" @click="reload" />
        </div>
        <q-space />
        <q-input v-model="filter" borderless dense debounce="300" :placeholder="gettext('Search')">
          <template #append><q-icon name="search" /></template>
        </q-input>
      </template>
      <template #body-cell-enabled="props">
        <q-td :props="props"
          ><q-badge
            :color="props.row.enabledText === gettext('Enabled') ? 'green' : 'red'"
            :label="props.row.enabledText"
        /></q-td>
      </template>
    </q-table>
  </div>

  <q-dialog v-model="detailVisible" persistent transition-show="scale" transition-hide="scale">
    <UWindow :title="gettext('Backup Details')" width="900px" :loading="detailLoading">
      <div v-if="selectedTask" class="backup-dialog-body q-pa-md">
        <div class="u-border q-mb-md q-pa-md backup-info-card">
          <div class="row q-col-gutter-md">
            <div class="col-12 col-md-4">
              <div>
                <b>{{ gettext('Node') }}:</b> {{ selectedTask.node || `-- ${gettext('All')} --` }}
              </div>
              <div>
                <b>{{ gettext('Enabled') }}:</b> {{ selectedTask.enabledText }}
              </div>
              <div>
                <b>{{ gettext('Comment') }}:</b> {{ selectedTask.comment || '-' }}
              </div>
            </div>
            <div class="col-12 col-md-4">
              <div>
                <b>{{ gettext('Schedule') }}:</b> {{ selectedTask.schedule }}
              </div>
              <div>
                <b>{{ gettext('Next Run') }}:</b> {{ nextRunText(selectedTask['next-run']) }}
              </div>
              <div>
                <b>{{ gettext('Mode') }}:</b> {{ gettext(String(selectedTask.mode || '')) }}
              </div>
            </div>
            <div class="col-12 col-md-4">
              <div>
                <b>{{ gettext('Storage') }}:</b> {{ selectedTask.storage }}
              </div>
              <div>
                <b>{{ gettext('Compression') }}:</b> {{ selectedTask.compress }}
              </div>
              <div>
                <b>{{ gettext('Selection Mode') }}:</b> {{ detailSelectionMode(selectedTask) }}
              </div>
              <div>
                <b>{{ gettext('Notice') }}:</b> {{ detailNotification(selectedTask) }}
              </div>
            </div>
          </div>
        </div>
        <div class="row items-center q-mb-sm">
          <div class="text-subtitle2">{{ gettext('Included disks') }}</div>
          <q-space /><q-input
            v-model="detailFilter"
            dense
            outlined
            :placeholder="gettext('Filter')"
            style="width: 200px"
            ><template #prepend><q-icon name="search" /></template
            ><template #append
              ><q-icon
                v-if="detailFilter"
                name="clear"
                class="cursor-pointer"
                @click="detailFilter = ''" /></template
          ></q-input>
        </div>
        <q-tree
          :nodes="detailTree"
          node-key="id"
          label-key="label"
          children-key="children"
          default-expand-all
          no-connectors
          ><template #default-header="prop"
            ><div class="row full-width items-center">
              <div class="col">{{ prop.node.label }}</div>
              <div class="col-2">{{ prop.node.type || '-' }}</div>
              <div class="col-3">{{ prop.node.includedText }}</div>
            </div></template
          ></q-tree
        >
      </div>
      <template #foot
        ><q-btn
          v-close-popup
          no-caps
          flat
          size="12px"
          class="bg-primary text-grey-1 u-button"
          :label="gettext('Close')"
      /></template>
    </UWindow>
  </q-dialog>

  <q-dialog v-model="formVisible" persistent transition-show="scale" transition-hide="scale">
    <UWindow :title="formTitle" width="760px" :loading="formLoading">
      <q-form
        class="backup-dialog-body backup-task-form u-dense q-ma-sm u-border"
        @submit="saveTask"
      >
        <q-inner-loading :showing="formLoading || formOptionsLoading" />
        <q-tabs
          v-model="formTab"
          class="text-grey"
          active-color="primary"
          indicator-color="primary"
          align="justify"
          narrow-indicator
          ><q-tab no-caps name="convention" :label="gettext('Convention')" /><q-tab
            no-caps
            name="retention"
            :label="gettext('Retention')" /><q-tab
            no-caps
            name="note"
            :label="gettext('Note Template')" /><q-tab
            no-caps
            name="advanced"
            :label="gettext('Advanced')"
        /></q-tabs>
        <q-separator />
        <q-tab-panels v-model="formTab" animated>
          <q-tab-panel name="convention" class="q-pa-md">
            <div class="bg-white u-border-dotted-blue q-pa-md">
              <div class="row q-col-gutter-lg">
                <div class="col-12 col-sm-6">
                  <q-select
                    v-model="taskForm.node"
                    class="q-field--with-bottom"
                    dense
                    options-dense
                    emit-value
                    map-options
                    clearable
                    option-value="node"
                    option-label="node"
                    :label="gettext('Node')"
                    :options="nodeOptions"
                  />
                  <q-select
                    v-model="taskForm.storage"
                    class="q-field--with-bottom"
                    dense
                    options-dense
                    emit-value
                    map-options
                    option-value="storage"
                    option-label="storage"
                    :label="gettext('Storage')"
                    :options="storageOptions"
                  />
                  <q-input
                    v-model="taskForm.schedule"
                    class="q-field--with-bottom"
                    dense
                    :label="gettext('Plan')"
                  />
                  <q-select
                    v-model="taskForm.selectionMode"
                    class="q-field--with-bottom"
                    dense
                    options-dense
                    emit-value
                    map-options
                    :label="gettext('Selection Mode')"
                    :options="[
                      { label: gettext('Include selected VMs'), value: 'include' },
                      { label: gettext('All'), value: 'all' },
                      { label: gettext('Exclude selected VMs'), value: 'exclude' },
                      { label: gettext('Pool based'), value: 'pool' },
                    ]"
                  />
                  <q-select
                    v-if="taskForm.selectionMode === 'pool'"
                    v-model="taskForm.pool"
                    class="q-field--with-bottom"
                    dense
                    options-dense
                    emit-value
                    map-options
                    option-value="poolid"
                    option-label="poolid"
                    :label="gettext('Pool Backup')"
                    :options="poolOptions"
                  />
                </div>
                <div class="col-12 col-sm-6">
                  <q-select
                    v-model="taskForm.notificationMode"
                    class="q-field--with-bottom"
                    dense
                    options-dense
                    emit-value
                    map-options
                    :label="gettext('Notification mode')"
                    :options="[
                      { label: gettext('Default'), value: '__default__' },
                      { label: gettext('auto'), value: 'auto' },
                      { label: gettext('Email (legacy)'), value: 'legacy-sendmail' },
                      { label: gettext('Notification system'), value: 'notification-system' },
                    ]"
                  />
                  <q-input
                    v-if="taskForm.notificationMode !== 'notification-system'"
                    v-model="taskForm.mailto"
                    class="q-field--with-bottom"
                    dense
                    :label="gettext('Send email to')"
                  />
                  <q-select
                    v-if="taskForm.notificationMode !== 'notification-system'"
                    v-model="taskForm.mailnotification"
                    class="q-field--with-bottom"
                    dense
                    options-dense
                    emit-value
                    map-options
                    :label="gettext('Send email')"
                    :options="[
                      { label: gettext('Always'), value: 'always' },
                      { label: gettext('On failure only'), value: 'failure' },
                    ]"
                  />
                  <q-select
                    v-model="taskForm.compress"
                    class="q-field--with-bottom"
                    dense
                    options-dense
                    emit-value
                    map-options
                    :label="gettext('Compressed')"
                    :options="
                      ['__default__', 'lzo', 'gzip', 'zstd'].map((value) => ({
                        label: value,
                        value,
                      }))
                    "
                  />
                  <q-select
                    v-model="taskForm.mode"
                    class="q-field--with-bottom"
                    dense
                    options-dense
                    emit-value
                    map-options
                    :label="gettext('Mode')"
                    :options="[
                      { label: gettext('Snapshot'), value: 'snapshot' },
                      { label: gettext('Suspend'), value: 'suspend' },
                      { label: gettext('Stop'), value: 'stop' },
                    ]"
                  />
                  <q-checkbox
                    v-model="taskForm.enabled"
                    size="xs"
                    right-label
                    color="primary"
                    :label="gettext('Enable')"
                  />
                </div>
              </div>
              <q-input
                v-model="taskForm.comment"
                class="q-field--with-bottom"
                dense
                :label="gettext('Job Comment')"
              />
            </div>
            <div
              v-if="['include', 'exclude'].includes(taskForm.selectionMode)"
              class="table q-mt-md bg-white u-border-dotted-blue q-px-md"
            >
              <q-table
                flat
                :rows="filteredVmOptions"
                :columns="[
                  { name: 'vmid', label: gettext('VMID'), field: 'vmid', align: 'left' },
                  { name: 'node', label: gettext('Node'), field: 'node', align: 'left' },
                  { name: 'status', label: gettext('Status'), field: 'status', align: 'left' },
                  { name: 'name', label: gettext('Name'), field: 'name', align: 'left' },
                  { name: 'type', label: gettext('Type'), field: 'type', align: 'left' },
                ]"
                row-key="vmid"
                selection="multiple"
                :selected="selectedVmRows"
                @update:selected="
                  taskForm.selectedVmids = $event.map((row) => String(row.vmid || ''))
                "
                :pagination="{ rowsPerPage: 10 }"
                ><template #top
                  ><q-space /><q-input
                    v-model="vmFilter"
                    dense
                    debounce="300"
                    :placeholder="gettext('Search')"
                    ><template #append><q-icon name="search" /></template></q-input></template
              ></q-table>
            </div>
          </q-tab-panel>
          <q-tab-panel name="retention"
            ><q-checkbox
              v-model="taskForm.keepAll"
              dense
              color="primary"
              :label="gettext('Keep all backups')"
            />
            <div v-if="!taskForm.keepAll" class="row q-col-gutter-lg">
              <div class="col">
                <q-input
                  v-model="taskForm.keepLast"
                  dense
                  type="number"
                  class="q-field--with-bottom"
                  :label="gettext('Keep last time')"
                /><q-input
                  v-model="taskForm.keepDaily"
                  dense
                  type="number"
                  class="q-field--with-bottom"
                  :label="gettext('Keep every day')"
                /><q-input
                  v-model="taskForm.keepMonthly"
                  dense
                  type="number"
                  class="q-field--with-bottom"
                  :label="gettext('Retain monthly')"
                />
              </div>
              <div class="col">
                <q-input
                  v-model="taskForm.keepHourly"
                  dense
                  type="number"
                  class="q-field--with-bottom"
                  :label="gettext('Keep every hour')"
                /><q-input
                  v-model="taskForm.keepWeekly"
                  dense
                  type="number"
                  class="q-field--with-bottom"
                  :label="gettext('Retain every week')"
                /><q-input
                  v-model="taskForm.keepYearly"
                  dense
                  type="number"
                  class="q-field--with-bottom"
                  :label="gettext('Retain every year')"
                />
              </div>
            </div>
            <div class="q-pa-sm bg-yellow-2 text-grey-8 q-my-sm">
              {{
                gettext(
                  "Without any keep option, the storage's configuration or node's vzdump.conf is used as fallback",
                )
              }}
            </div></q-tab-panel
          >
          <q-tab-panel name="note"
            ><q-input
              v-model="taskForm.notesTemplate"
              dense
              outlined
              type="textarea"
              :label="gettext('Backup Notes')"
            />
            <div class="q-mt-sm">
              {{ gettext('Notes are added to every backup created by this job.') }}
              {{ gettext('Template variables:') }} <span v-pre>{{ cluster }}</span
              >, <span v-pre>{{ guestname }}</span
              >, <span v-pre>{{ node }}</span
              >, <span v-pre>{{ vmid }}</span>
            </div></q-tab-panel
          >
          <q-tab-panel name="advanced"
            ><div class="advanced-settings-container bg-white u-border-dotted-blue">
              <div class="advanced-row">
                <div>
                  <q-input
                    v-model="taskForm.id"
                    dense
                    stack-label
                    :label="gettext('Job ID')"
                    :disable="formAction === 'edit'"
                    :placeholder="gettext('Auto generate')"
                  />
                </div>
                <p>{{ gettext('Can be used in notification matchers to match this job.') }}</p>
              </div>
              <div class="advanced-row">
                <div>
                  <q-input
                    v-model="taskForm.bwlimit"
                    dense
                    stack-label
                    type="number"
                    :label="gettext('Bandwidth Limit')"
                    :placeholder="gettext('Fallback')"
                  />
                </div>
                <p>{{ gettext('Limit I/O bandwidth.') }}</p>
              </div>
              <div class="advanced-row">
                <div>
                  <q-input
                    v-model="taskForm.zstd"
                    dense
                    stack-label
                    type="number"
                    :label="gettext('Zstd Threads')"
                    :placeholder="gettext('Fallback')"
                  />
                </div>
                <p>{{ gettext('Threads used for zstd compression (non-PBS).') }}</p>
              </div>
              <div class="advanced-row">
                <div>
                  <q-input
                    v-model="taskForm.maxWorkers"
                    dense
                    stack-label
                    type="number"
                    :label="gettext('IO Workers')"
                    :placeholder="gettext('Fallback')"
                  />
                </div>
                <p>{{ gettext('I/O workers in the QEMU process (VMs only).') }}</p>
              </div>
              <div class="advanced-row">
                <div>
                  <q-checkbox
                    v-model="taskForm.fleecingEnabled"
                    size="xs"
                    color="primary"
                    :label="gettext('Speedup')"
                  />
                </div>
                <p>
                  {{
                    gettext(
                      'Backup write cache that can reduce IO pressure inside guests (VMs only).',
                    )
                  }}
                </p>
              </div>
              <div v-if="taskForm.fleecingEnabled" class="advanced-row">
                <div>
                  <q-select
                    v-model="taskForm.fleecingStorage"
                    dense
                    options-dense
                    emit-value
                    map-options
                    option-value="storage"
                    option-label="storage"
                    :label="gettext('Fleecing Storage')"
                    :options="
                      allStorageOptions.filter((item) =>
                        String(item.content || '')
                          .split(',')
                          .includes('images'),
                      )
                    "
                  />
                </div>
                <p>
                  {{
                    gettext(
                      'Prefer a fast and local storage, ideally with support for discard and thin-provisioning or sparse files.',
                    )
                  }}
                </p>
              </div>
              <div class="advanced-row">
                <div>
                  <q-checkbox
                    v-model="taskForm.repeatMissed"
                    size="xs"
                    color="primary"
                    :label="gettext('Repeat missed')"
                  />
                </div>
                <p>
                  {{
                    gettext(
                      "Run jobs as soon as possible if they couldn't start on schedule, for example, due to the node being offline.",
                    )
                  }}
                </p>
              </div>
              <div class="advanced-row">
                <div>
                  <q-select
                    v-model="taskForm.pbsChangeDetectionMode"
                    dense
                    options-dense
                    emit-value
                    map-options
                    :label="gettext('PBS Change Detection Mode')"
                    :options="[
                      { label: gettext('Default'), value: '__default__' },
                      { label: 'Data', value: 'data' },
                      { label: 'Metadata', value: 'metadata' },
                    ]"
                  />
                </div>
                <p>
                  {{
                    gettext(
                      'Mode to detect file changes and switch archive encoding format for container backups.',
                    )
                  }}
                </p>
              </div>
            </div>
            <div class="q-mt-md bg-amber-1 q-pa-md u-border-dotted-amber">
              <span class="text-weight-bold text-amber-9">{{ gettext('Comment') }}: </span
              >{{
                gettext(
                  "The node-specific 'vzdump.conf' or, if this is not set, the default from the config schema is used to determine fallback values.",
                )
              }}
            </div></q-tab-panel
          >
        </q-tab-panels>
      </q-form>
      <template #foot
        ><q-btn v-close-popup no-caps flat size="12px" :label="gettext('Cancel')" /><q-btn
          no-caps
          flat
          size="12px"
          :class="
            !formSaving ? 'bg-primary text-grey-1 u-button' : 'bg-grey-4 text-grey-6 u-button'
          "
          :disable="formSaving || !taskForm.storage || !taskForm.schedule"
          :loading="formSaving"
          :label="gettext(formAction === 'add' ? 'Add' : 'Save')"
          @click="saveTask"
      /></template>
    </UWindow>
  </q-dialog>

  <q-dialog v-model="guestsVisible" persistent transition-show="scale" transition-hide="scale">
    <UWindow :title="gettext('Guests Without Backup Job')" width="900px" :loading="guestsLoading"
      ><div class="backup-dialog-body q-pa-md">
        <q-table
          flat
          :rows="guests"
          :loading="guestsLoading"
          row-key="id"
          :columns="[
            { name: 'type', label: gettext('Type'), field: 'type', align: 'left' },
            { name: 'vmid', label: gettext('VMID'), field: 'vmid', align: 'left' },
            { name: 'name', label: gettext('Name'), field: 'name', align: 'left' },
          ]"
          :no-data-label="gettext('no record can be found')"
        />
      </div>
      <template #foot
        ><q-btn
          v-close-popup
          no-caps
          flat
          size="12px"
          class="bg-primary text-grey-1 u-button"
          :label="gettext('Close')" /></template
    ></UWindow>
  </q-dialog>

  <q-dialog v-model="simulatorVisible" persistent transition-show="scale" transition-hide="scale">
    <UWindow :title="gettext('Schedule Simulator')" width="800px" :loading="simulatorLoading"
      ><div class="backup-dialog-body q-ma-sm u-border">
        <q-splitter v-model="simulatorSplitter" style="height: 400px"
          ><template #before
            ><div class="q-pa-md">
              <q-select
                v-model="simulatorForm.schedule"
                dense
                options-dense
                emit-value
                map-options
                class="q-field--with-bottom"
                :label="gettext('Plan')"
                :options="planOptions"
                use-input
                fill-input
                input-debounce="0"
              /><q-input
                v-model.number="simulatorForm.iterations"
                dense
                type="number"
                class="q-field--with-bottom"
                :label="gettext('iterations')"
              />
              <div class="flex justify-end">
                <q-btn
                  no-caps
                  flat
                  size="12px"
                  class="bg-primary text-grey-1 u-button"
                  :disable="!simulatorForm.schedule || !simulatorForm.iterations"
                  :loading="simulatorLoading"
                  :label="gettext('Simulate')"
                  @click="runScheduleSimulator"
                />
              </div></div></template
          ><template #after
            ><div class="q-pa-md">
              <q-list v-if="simulationRows.length" bordered separator
                ><q-item
                  v-for="(item, index) in simulationRows"
                  :key="String(item.timestamp || item.utc || index)"
                  ><q-item-section
                    ><q-item-label>{{ scheduleDate(item.utc) }}</q-item-label
                    ><q-item-label caption>{{
                      scheduleTime(item.timestamp)
                    }}</q-item-label></q-item-section
                  ></q-item
                ></q-list
              >
              <div v-else class="text-center text-grey">{{ gettext('No data available') }}</div>
            </div></template
          ></q-splitter
        >
      </div>
      <template #foot
        ><q-btn
          v-close-popup
          no-caps
          flat
          size="12px"
          class="bg-primary text-grey-1 u-button"
          :label="gettext('Finish')" /></template
    ></UWindow>
  </q-dialog>
</template>

<style scoped>
.backup-dialog-body {
  max-height: 70vh;
  overflow: auto;
}
.backup-task-form :deep(.q-field__native),
.backup-task-form :deep(.q-field__prefix),
.backup-task-form :deep(.q-field__suffix),
.backup-task-form :deep(.q-field__input) {
  color: #666666;
  font-size: 12px;
}
.backup-task-form :deep(.q-field__control-container .q-field__label) {
  color: #333333;
  font-size: 12px;
}
.backup-task-form :deep(.q-field--dense .q-field__control),
.backup-task-form :deep(.q-field--dense .q-field__marginal) {
  height: 30px;
}
.backup-task-form :deep(.q-field--with-bottom) {
  padding-bottom: 15px;
}
.backup-task-form :deep(.q-field__bottom) {
  display: none;
}
.backup-task-form :deep(.q-tab-panel) {
  min-height: 520px;
}
.advanced-settings-container {
  max-height: 56vh;
  overflow-y: auto;
}
.advanced-row {
  display: grid;
  grid-template-columns: minmax(220px, 1fr) 2fr;
  border-bottom: 1px solid #e0e0e0;
}
.advanced-row > div {
  padding: 16px;
}
.advanced-row > p {
  margin: 0;
  padding: 16px;
  background: #f5f5f5;
  color: #666;
  font-size: 12px;
  line-height: 20px;
}
.advanced-row:hover {
  background: rgba(33, 150, 243, 0.04);
}
@media (max-width: 700px) {
  .advanced-row {
    grid-template-columns: 1fr;
  }
}
.detail-value {
  max-width: 470px;
  overflow-wrap: anywhere;
  white-space: pre-wrap;
}
</style>
