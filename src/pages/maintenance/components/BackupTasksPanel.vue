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
import SelectTable from '@/components/SelectTable.vue';
import BackupScheduleBuilder from './BackupScheduleBuilder.vue';
import { getNodeStorages } from '@/api/storage';
import { getNodes } from '@/api/host';
import { getClusterResources, getPools, type PveRecord } from '@/api/resources';
import { getLocale, gettext } from '@/locale';
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
const scheduleBuilderVisible = ref(false);
const nodeOptions = ref<PveRecord[]>([]);
const storageOptions = ref<PveRecord[]>([]);
const poolOptions = ref<PveRecord[]>([]);
const vmOptions = ref<PveRecord[]>([]);
const vmFilter = ref('');
const guestsVisible = ref(false);
const guestsLoading = ref(false);
const guests = ref<Record<string, unknown>[]>([]);
const guestsFilter = ref('');
const simulatorVisible = ref(false);
const simulatorLoading = ref(false);
const simulationRows = ref<Record<string, unknown>[]>([]);
const simulatorSplitter = ref(42);
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
  notificationMode: 'notification-system',
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
  repeatMissed: false,
  pbsChangeDetectionMode: 'legacy',
});
const taskFormErrors = reactive({
  storage: '',
  schedule: '',
  pool: '',
  selectedVmids: '',
});
const simulatorForm = reactive({ schedule: '', iterations: 10 });

const selectedTask = computed(() => selectedTasks.value[0]);
const canOperate = computed(() => selectedTasks.value.length === 1);
const formTitle = computed(
  () => `${gettext(formAction.value === 'add' ? 'Add' : 'Edit')}: ${gettext('Backup Task')}`
);
const filteredTasks = computed(() => {
  const keyword = filter.value.trim().toLowerCase();
  if (!keyword) return tasks.value;
  return tasks.value.filter((task) =>
    [task.id, task.nodeText, task.schedule, task.type, task.storage, task.guestText]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()
      .includes(keyword)
  );
});
const filteredVmOptions = computed(() => {
  const keyword = vmFilter.value.trim().toLowerCase();
  if (!keyword) return vmOptions.value;
  return vmOptions.value.filter((item) =>
    [item.vmid, item.name, item.node, item.type].join(' ').toLowerCase().includes(keyword)
  );
});
const selectedVmRows = computed(() =>
  vmOptions.value.filter((item) => taskForm.selectedVmids.includes(textValue(item.vmid)))
);
const selectedVmSummary = computed(() => {
  return taskForm.selectedVmids.join(', ') || gettext('No VMs selected');
});
const selectedNodeLabel = computed(() => taskForm.node || gettext('All Node (No Limit)'));
const selectedStorageLabel = computed(() => taskForm.storage || '');
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
const nodeColumns: QTableColumn<PveRecord>[] = [
  { name: 'node', label: gettext('Node'), field: 'node', align: 'left', sortable: true },
  { name: 'status', label: gettext('Status'), field: 'status', align: 'left', sortable: true },
];
const storageColumns: QTableColumn<PveRecord>[] = [
  { name: 'storage', label: gettext('Storage'), field: 'storage', align: 'left', sortable: true },
  { name: 'type', label: gettext('Type'), field: 'type', align: 'left', sortable: true },
  { name: 'avail', label: gettext('Available'), field: 'avail', align: 'left', sortable: true },
  { name: 'total', label: gettext('Total'), field: 'total', align: 'left', sortable: true },
];
const vmColumns: QTableColumn<PveRecord>[] = [
  { name: 'vmid', label: gettext('VMID'), field: 'vmid', align: 'left', sortable: true },
  { name: 'node', label: gettext('Node'), field: 'node', align: 'left', sortable: true },
  { name: 'status', label: gettext('Status'), field: 'status', align: 'left', sortable: true },
  { name: 'name', label: gettext('Name'), field: 'name', align: 'left', sortable: true },
  { name: 'type', label: gettext('Type'), field: 'type', align: 'left', sortable: true },
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
    includedVolumes.value = normalizeDetailNodes(response.data);
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
function treeIcon(item: PveRecord) {
  if (item.leaf && !item.type) return 'fas fa-hdd';
  if (item.type === 'qemu') return 'fas fa-desktop';
  if (item.type === 'lxc') return 'fas fa-cube';
  return 'fas fa-question-circle';
}
function includedIcon(item: PveRecord) {
  const value = item.included;
  if (!value || typeof value !== 'object') return '';
  const iconCls = textValue((value as Record<string, unknown>).iconCls).toLowerCase();
  const iconMap: Record<string, string> = {
    check: 'check_circle',
    'check-circle': 'check_circle',
    times: 'cancel',
    close: 'cancel',
    ban: 'block',
    warning: 'warning_amber',
  };
  return iconMap[iconCls] || 'help_outline';
}
function includedText(item: PveRecord) {
  const value = item.included;
  if (value === undefined) return '-';
  if (value && typeof value === 'object') {
    return textValue((value as Record<string, unknown>).text, '-');
  }
  return ['1', 'on', 'yes', 'true'].includes(textValue(value).toLowerCase())
    ? gettext('Enabled')
    : gettext('Disabled');
}
function normalizeDetailNodes(value: unknown): PveRecord[] {
  if (Array.isArray(value)) return value as PveRecord[];
  if (value && typeof value === 'object') {
    const children = (value as PveRecord).children;
    return Array.isArray(children) ? (children as PveRecord[]) : [];
  }
  return [];
}
function filterDetailTree(nodes: unknown, filter: string): PveRecord[] {
  const keyword = filter.trim().toLowerCase();
  return normalizeDetailNodes(nodes).reduce<PveRecord[]>((result, item) => {
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
function scheduleWeekday(value: unknown) {
  const raw = Number(value);
  if (!Number.isFinite(raw)) return '';
  return new Intl.DateTimeFormat(getLocale(), { weekday: 'short' }).format(
    new Date(raw > 1e12 ? raw : raw * 1000)
  );
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

function resolveNotificationMode(value: unknown, mailto: unknown) {
  const mode = textValue(value, 'auto');
  return mode === 'legacy-sendmail' ||
    (['auto', '__default__'].includes(mode) && Boolean(textValue(mailto)))
    ? 'legacy-sendmail'
    : 'notification-system';
}

function resolvePbsChangeDetectionMode(value: unknown) {
  const mode = textValue(value, 'legacy');
  return ['legacy', 'data', 'metadata'].includes(mode) ? mode : 'legacy';
}

function resetTaskForm() {
  Object.assign(taskFormErrors, {
    storage: '',
    schedule: '',
    pool: '',
    selectedVmids: '',
  });
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
    notificationMode: 'notification-system',
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
    repeatMissed: false,
    pbsChangeDetectionMode: 'legacy',
  });
}

function requiredLabel(label: string) {
  return `${label} *`;
}

function validateTaskForm() {
  Object.assign(taskFormErrors, {
    storage: taskForm.storage ? '' : gettext('Storage is required'),
    schedule: taskForm.schedule ? '' : gettext('Schedule is required'),
    pool:
      taskForm.selectionMode === 'pool' && !taskForm.pool
        ? gettext('Pool to backup is required')
        : '',
    selectedVmids:
      ['include', 'exclude'].includes(taskForm.selectionMode) && !taskForm.selectedVmids.length
        ? gettext('At least one virtual machine must be selected')
        : '',
  });
  return !Object.values(taskFormErrors).some(Boolean);
}

async function loadFormOptions() {
  formOptionsLoading.value = true;
  try {
    const [nodes, storages, pools, vms] = await Promise.all([
      getNodes(),
      getNodeStorages('localhost', { format: 1, content: 'backup' }),
      getPools(),
      getClusterResources({ type: 'vm' }),
    ]);
    nodeOptions.value = nodes.data || [];
    storageOptions.value = storages.data || [];
    poolOptions.value = pools.data || [];
    vmOptions.value = vms.data || [];
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
        notificationMode: resolveNotificationMode(data['notification-mode'], data.mailto),
        mailto: textValue(data.mailto),
        mailnotification: textValue(
          data.mailnotification,
          textValue(data['notification-policy'], 'always')
        ),
        notesTemplate: textValue(data['notes-template'], '{{guestname}}'),
        bwlimit: textValue(data.bwlimit),
        zstd: textValue(data.zstd),
        maxWorkers: textValue(data['max-workers']),
        repeatMissed: Boolean(data['repeat-missed']),
        pbsChangeDetectionMode: resolvePbsChangeDetectionMode(data['pbs-change-detection-mode']),
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
  if (!validateTaskForm()) return;
  if (formSaving.value) return;
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
      mailto:
        taskForm.notificationMode === 'legacy-sendmail' ? taskForm.mailto || undefined : undefined,
      mailnotification:
        taskForm.notificationMode === 'legacy-sendmail' ? taskForm.mailnotification : undefined,
      'notes-template': taskForm.notesTemplate,
      'prune-backups': pruneBackups,
      bwlimit: taskForm.bwlimit,
      zstd: taskForm.zstd,
      'max-workers': taskForm.maxWorkers,
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
            `${name}=${
              Array.isArray(item)
                ? item.map((entry) => textValue(entry)).join(';')
                : textValue(item)
            }`
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
          targetNodes.map((node) => runBackupTask(node, createRunPayload(task)))
        );
        const failedNodes = results.flatMap((result, index) =>
          result.status === 'rejected' ? [targetNodes[index]] : []
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
  <div class="row column">
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
            :color="canOperate ? 'primary' : 'grey-6'"
            class="u-button"
            :label="gettext('Edit')"
            :disable="!canOperate"
            @click="openTaskForm('edit')"
          />
          <q-btn
            no-caps
            outline
            size="12px"
            :color="canOperate ? 'negative' : 'grey-6'"
            class="u-button"
            :label="gettext('Delete')"
            :disable="!canOperate"
            @click="removeSelected"
          />
          <q-btn
            no-caps
            outline
            size="12px"
            :color="canOperate ? 'primary' : 'grey-6'"
            class="u-button"
            :label="gettext('Backup Details')"
            :disable="!canOperate"
            @click="showDetails"
          />
          <q-btn
            no-caps
            outline
            size="12px"
            :color="canOperate && !runNowLoading ? 'primary' : 'grey-6'"
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
          <q-btn
            flat
            round
            dense
            icon="refresh"
            :aria-label="gettext('Refresh')"
            @click="reload"
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
          <q-badge
            :color="props.row.enabledText === gettext('Enabled') ? 'green' : 'red'"
            :label="props.row.enabledText"
          />
        </q-td>
      </template>
    </q-table>
  </div>

  <q-dialog
    v-model="detailVisible"
    persistent
    transition-show="scale"
    transition-hide="scale"
  >
    <UWindow
      :title="gettext('Backup Details')"
      width="900px"
      :loading="detailLoading"
    >
      <div
        v-if="selectedTask"
        class="backup-dialog-body q-pa-md"
      >
        <section class="backup-info-card q-mb-md">
          <div class="backup-info-card__header">
            <div class="backup-info-card__title">{{ selectedTask.id }}</div>
            <q-badge
              :color="selectedTask.enabledText === gettext('Enabled') ? 'positive' : 'negative'"
              :label="selectedTask.enabledText"
            />
          </div>
          <div class="backup-info-card__content">
            <div class="backup-info-item">
              <span class="backup-info-label">{{ gettext('Node') }}</span>
              <span class="backup-info-value">
                {{ selectedTask.node || '-- ' + gettext('All') + ' --' }}
              </span>
            </div>
            <div class="backup-info-item">
              <span class="backup-info-label">{{ gettext('Storage') }}</span>
              <span class="backup-info-value">{{ selectedTask.storage || '-' }}</span>
            </div>
            <div class="backup-info-item">
              <span class="backup-info-label">{{ gettext('Schedule') }}</span>
              <span class="backup-info-value">{{ selectedTask.schedule || '-' }}</span>
            </div>
            <div class="backup-info-item">
              <span class="backup-info-label">{{ gettext('Next Run') }}</span>
              <span class="backup-info-value backup-info-value--numeric">
                {{ nextRunText(selectedTask['next-run']) }}
              </span>
            </div>
            <div class="backup-info-item">
              <span class="backup-info-label">{{ gettext('Mode') }}</span>
              <span class="backup-info-value">
                {{ gettext(String(selectedTask.mode || '')) || '-' }}
              </span>
            </div>
            <div class="backup-info-item">
              <span class="backup-info-label">{{ gettext('Compression') }}</span>
              <span class="backup-info-value">{{ selectedTask.compress || '-' }}</span>
            </div>
            <div class="backup-info-item">
              <span class="backup-info-label">{{ gettext('Selection Mode') }}</span>
              <span class="backup-info-value">{{ detailSelectionMode(selectedTask) }}</span>
            </div>
            <div class="backup-info-item">
              <span class="backup-info-label">{{ gettext('Notice') }}</span>
              <span class="backup-info-value">{{ detailNotification(selectedTask) }}</span>
            </div>
            <div class="backup-info-item backup-info-item--full">
              <span class="backup-info-label">{{ gettext('Comment') }}</span>
              <span class="backup-info-value">{{ selectedTask.comment || '-' }}</span>
            </div>
          </div>
        </section>
        <section class="backup-disk-section">
          <div class="row items-center q-mb-md backup-disk-section__header">
            <div class="backup-task-form__section-title backup-disk-section__title">
              {{ gettext('Included disks') }}
            </div>
            <q-space />
            <q-input
              v-model="detailFilter"
              dense
              outlined
              class="backup-disk-section__filter"
              :placeholder="gettext('Filter')"
            >
              <template #prepend><q-icon name="search" /></template>
              <template #append>
                <q-icon
                  v-if="detailFilter"
                  name="clear"
                  class="cursor-pointer"
                  @click="detailFilter = ''"
                />
              </template>
            </q-input>
          </div>
          <div class="backup-tree">
            <div class="backup-tree__columns">
              <span>{{ gettext('VMID') }}</span>
              <span>{{ gettext('Type') }}</span>
              <span>{{ gettext('Backup Task') }}</span>
            </div>
            <q-tree
              :nodes="detailTree"
              node-key="id"
              label-key="label"
              children-key="children"
              default-expand-all
              no-connectors
            >
              <template #default-header="prop">
                <div class="backup-tree__row">
                  <div class="backup-tree__label">
                    <q-icon
                      :name="treeIcon(prop.node)"
                      size="16px"
                      class="q-mr-sm text-grey-7"
                    />
                    <span>{{ prop.node.label }}</span>
                  </div>
                  <div class="backup-tree__muted">{{ prop.node.type || '-' }}</div>
                  <div class="backup-tree__included">
                    <q-icon
                      v-if="includedIcon(prop.node)"
                      :name="includedIcon(prop.node)"
                      size="16px"
                      class="q-mr-xs"
                    />
                    <span>{{ prop.node.includedText }}</span>
                  </div>
                </div>
              </template>
            </q-tree>
            <div
              v-if="!detailTree.length && !detailLoading"
              class="backup-tree__empty"
            >
              {{ gettext('No data') }}
            </div>
          </div>
        </section>
      </div>
      <template #foot>
        <q-btn
          v-close-popup
          no-caps
          flat
          size="12px"
          class="u-button"
          :label="gettext('Close')"
        />
      </template>
    </UWindow>
  </q-dialog>

  <q-dialog
    v-model="formVisible"
    persistent
    transition-show="scale"
    transition-hide="scale"
  >
    <UWindow
      :title="formTitle"
      width="760px"
      :loading="formLoading"
    >
      <q-form
        class="backup-dialog-body backup-task-form u-dense"
        @submit="saveTask"
      >
        <q-inner-loading :showing="formLoading || formOptionsLoading" />
        <q-tabs
          v-model="formTab"
          class="text-grey"
          active-color="primary"
          indicator-color="primary"
          align="left"
          narrow-indicator
        >
          <q-tab
            no-caps
            name="convention"
            :label="gettext('Convention')"
          />
          <q-tab
            no-caps
            name="retention"
            :label="gettext('Retention')"
          />
          <q-tab
            no-caps
            name="notification"
            :label="gettext('Notification')"
          />
          <q-tab
            no-caps
            name="note"
            :label="gettext('Note Template')"
          />
          <q-tab
            no-caps
            name="advanced"
            :label="gettext('Advanced')"
          />
        </q-tabs>
        <q-separator />
        <q-tab-panels
          v-model="formTab"
          animated
        >
          <q-tab-panel
            name="convention"
            class="backup-task-form__panel"
          >
            <section class="backup-task-form__section">
              <div class="backup-task-form__section-header">
                <div class="backup-task-form__section-title">{{ gettext('Basic Settings') }}</div>
                <q-checkbox
                  v-model="taskForm.enabled"
                  size="xs"
                  right-label
                  color="primary"
                  :label="gettext('Enable')"
                />
              </div>
              <div class="backup-task-form__fields">
                <div class="backup-task-form__field">
                  <SelectTable
                    v-model="taskForm.node"
                    class="q-field--with-bottom"
                    row-key="node"
                    field-style="standard"
                    :label="gettext('Node')"
                    :rows="nodeOptions"
                    :columns="nodeColumns"
                    :display-value="selectedNodeLabel"
                    width="500px"
                    :get-row-value="(row) => String(row.node || '')"
                  />
                </div>
                <div class="backup-task-form__field">
                  <SelectTable
                    v-model="taskForm.storage"
                    class="q-field--with-bottom"
                    row-key="storage"
                    field-style="standard"
                    :label="requiredLabel(gettext('Storage'))"
                    :rows="storageOptions"
                    :columns="storageColumns"
                    :display-value="selectedStorageLabel"
                    width="500px"
                    show-error
                    :error="Boolean(taskFormErrors.storage)"
                    :error-message="taskFormErrors.storage"
                    @update:model-value="taskFormErrors.storage = ''"
                    :get-row-value="(row) => String(row.storage || '')"
                  />
                </div>
                <div class="backup-task-form__field">
                  <q-select
                    v-model="taskForm.compress"
                    class="q-field--with-bottom"
                    dense
                    options-dense
                    emit-value
                    map-options
                    :label="gettext('Compressed')"
                    :options="[
                      { label: gettext('None'), value: '__default__' },
                      { label: 'LZO(' + gettext('Fast') + ')', value: 'lzo' },
                      { label: 'GZIP(' + gettext('Good') + ')', value: 'gzip' },
                      { label: 'ZSTD(' + gettext('Fast and Good') + ')', value: 'zstd' },
                    ]"
                  />
                </div>
                <div class="backup-task-form__field">
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
                </div>
                <div class="backup-task-form__field">
                  <q-select
                    v-model="taskForm.schedule"
                    class="q-field--with-bottom"
                    dense
                    options-dense
                    emit-value
                    map-options
                    use-input
                    fill-input
                    input-debounce="0"
                    :label="requiredLabel(gettext('Plan'))"
                    :options="planOptions"
                    :error="Boolean(taskFormErrors.schedule)"
                    :error-message="taskFormErrors.schedule"
                    @update:model-value="taskFormErrors.schedule = ''"
                  >
                    <template #append>
                      <q-btn
                        round
                        flat
                        dense
                        class="backup-plan-builder-btn"
                        color="primary"
                        icon="event"
                        :title="gettext('Custom Execution Plan')"
                        @mousedown.stop
                        @click.stop="scheduleBuilderVisible = true"
                      />
                    </template>
                  </q-select>
                </div>
                <div class="backup-task-form__field">
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
                    @update:model-value="
                      taskFormErrors.pool = '';
                      taskFormErrors.selectedVmids = '';
                    "
                  />
                </div>
                <div
                  v-if="taskForm.selectionMode === 'pool'"
                  class="backup-task-form__field"
                >
                  <q-select
                    v-model="taskForm.pool"
                    class="q-field--with-bottom"
                    dense
                    options-dense
                    emit-value
                    map-options
                    option-value="poolid"
                    option-label="poolid"
                    :label="requiredLabel(gettext('Pool Backup'))"
                    :options="poolOptions"
                    :error="Boolean(taskFormErrors.pool)"
                    :error-message="taskFormErrors.pool"
                    @update:model-value="taskFormErrors.pool = ''"
                  />
                </div>
                <div class="backup-task-form__field backup-task-form__field--full">
                  <q-input
                    v-model="taskForm.comment"
                    class="q-field--with-bottom"
                    dense
                    :label="gettext('Job Comment')"
                  />
                </div>
              </div>
            </section>
            <section
              v-if="['include', 'exclude'].includes(taskForm.selectionMode)"
              class="backup-task-form__section backup-task-form__section--objects"
            >
              <div class="backup-task-form__section-title">{{ gettext('Backup Objects') }}</div>
              <q-select
                v-model="taskForm.selectedVmids"
                class="backup-vm-picker q-field--with-bottom"
                dense
                multiple
                options-dense
                :options="[]"
                :label="requiredLabel(gettext('Virtual Machines'))"
                :display-value="selectedVmSummary"
                :error="Boolean(taskFormErrors.selectedVmids)"
                :error-message="taskFormErrors.selectedVmids"
                @update:model-value="taskFormErrors.selectedVmids = ''"
              >
                <q-popup-proxy
                  transition-show="jump-down"
                  transition-hide="jump-up"
                >
                  <div class="backup-vm-picker__popup">
                    <div class="q-px-sm u-border-bottom bg-grey-2 text-grey">
                      <q-input
                        v-model="vmFilter"
                        borderless
                        dense
                        debounce="300"
                        :placeholder="gettext('Search')"
                      >
                        <template #append><q-icon name="search" /></template>
                      </q-input>
                    </div>
                    <q-scroll-area class="backup-vm-picker__scroll">
                      <q-table
                        flat
                        dense
                        hide-bottom
                        :rows="filteredVmOptions"
                        :columns="vmColumns"
                        row-key="vmid"
                        table-header-class="u-table-header"
                        selection="multiple"
                        :selected="selectedVmRows"
                        @update:selected="
                          taskForm.selectedVmids = $event.map((row) => String(row.vmid || ''));
                          taskFormErrors.selectedVmids = '';
                        "
                        :pagination="{ rowsPerPage: 0 }"
                      />
                    </q-scroll-area>
                  </div>
                </q-popup-proxy>
              </q-select>
            </section>
          </q-tab-panel>
          <q-tab-panel
            name="retention"
            class="q-pa-md"
          >
            <div class="bg-white q-pa-sm">
              <q-checkbox
                v-model="taskForm.keepAll"
                dense
                color="primary"
                :label="gettext('Keep all backups')"
                class="q-field--with-bottom"
              />
              <div
                v-if="!taskForm.keepAll"
                class="row q-col-gutter-lg"
              >
                <div class="col">
                  <q-input
                    v-model="taskForm.keepLast"
                    dense
                    type="number"
                    class="q-field--with-bottom"
                    :label="gettext('Keep last time')"
                  />
                  <q-input
                    v-model="taskForm.keepDaily"
                    dense
                    type="number"
                    class="q-field--with-bottom"
                    :label="gettext('Keep every day')"
                  />
                  <q-input
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
                  />
                  <q-input
                    v-model="taskForm.keepWeekly"
                    dense
                    type="number"
                    class="q-field--with-bottom"
                    :label="gettext('Retain every week')"
                  />
                  <q-input
                    v-model="taskForm.keepYearly"
                    dense
                    type="number"
                    class="q-field--with-bottom"
                    :label="gettext('Retain every year')"
                  />
                </div>
              </div>
            </div>
            <div class="backup-task-form__hint q-mt-md">
              {{
                gettext(
                  "Without any keep option, the storage's configuration or node's vzdump.conf is used as fallback"
                )
              }}
            </div>
          </q-tab-panel>
          <q-tab-panel
            name="notification"
            class="q-pa-md"
          >
            <div class="bg-white q-pa-sm notification-settings">
              <q-option-group
                v-model="taskForm.notificationMode"
                class="notification-settings__mode q-field--with-bottom"
                type="radio"
                color="primary"
                :options="[
                  {
                    label: gettext('Use global notification settings'),
                    value: 'notification-system',
                  },
                  {
                    label: gettext('Use sendmail to send an email (legacy)'),
                    value: 'legacy-sendmail',
                  },
                ]"
              />
              <q-input
                v-model="taskForm.mailto"
                class="notification-settings__legacy q-field--with-bottom"
                dense
                :disable="taskForm.notificationMode !== 'legacy-sendmail'"
                :label="gettext('Recipients')"
                placeholder="test@example.com, ..."
              />
              <q-select
                v-model="taskForm.mailnotification"
                class="notification-settings__legacy q-field--with-bottom"
                dense
                options-dense
                emit-value
                map-options
                :disable="taskForm.notificationMode !== 'legacy-sendmail'"
                :label="gettext('When')"
                :options="[
                  { label: gettext('Always'), value: 'always' },
                  { label: gettext('On failure only'), value: 'failure' },
                ]"
              />
            </div>
          </q-tab-panel>
          <q-tab-panel
            name="note"
            class="q-pa-md"
          >
            <div class="bg-white q-pa-sm">
              <q-input
                v-model="taskForm.notesTemplate"
                dense
                class="q-field--with-bottom"
                type="textarea"
                :label="gettext('Backup Notes')"
              />
            </div>
            <div class="backup-task-form__hint q-mt-md">
              {{ gettext('Notes are added to every backup created by this job.') }}
              {{ gettext('Template variables:') }}
              <span v-pre>{{ cluster }}</span>
              ,
              <span v-pre>{{ guestname }}</span>
              ,
              <span v-pre>{{ node }}</span>
              ,
              <span v-pre>{{ vmid }}</span>
            </div>
          </q-tab-panel>
          <q-tab-panel
            name="advanced"
            class="backup-task-form__panel backup-task-form__panel--advanced"
          >
            <section class="backup-advanced-section">
              <div class="backup-task-form__section-title">{{ gettext('Advanced settings') }}</div>
              <div class="advanced-settings-container">
                <div class="advanced-row">
                  <div>
                    <q-input
                      v-model="taskForm.id"
                      class="q-field--with-bottom"
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
                      class="q-field--with-bottom"
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
                      class="q-field--with-bottom"
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
                      class="q-field--with-bottom"
                      dense
                      stack-label
                      type="number"
                      :label="gettext('IO Workers')"
                      :placeholder="gettext('Fallback')"
                    />
                  </div>
                  <p>{{ gettext('I/O workers in the QEMU process (VMs only).') }}</p>
                </div>
                <div class="advanced-row advanced-row--checkbox">
                  <div>
                    <q-checkbox
                      v-model="taskForm.repeatMissed"
                      dense
                      right-label
                      size="xs"
                      color="primary"
                      :label="gettext('Repeat missed')"
                    />
                  </div>
                  <p>
                    {{
                      gettext(
                        "Run jobs as soon as possible if they couldn't start on schedule, for example, due to the node being offline."
                      )
                    }}
                  </p>
                </div>
                <div class="advanced-row">
                  <div>
                    <q-select
                      v-model="taskForm.pbsChangeDetectionMode"
                      class="q-field--with-bottom"
                      dense
                      options-dense
                      emit-value
                      map-options
                      :label="gettext('PBS Change Detection Mode')"
                      :options="[
                        { label: gettext('Legacy'), value: 'legacy' },
                        { label: 'Data', value: 'data' },
                        { label: 'Metadata', value: 'metadata' },
                      ]"
                    />
                  </div>
                  <p>
                    {{
                      gettext(
                        'Mode to detect file changes and switch archive encoding format for container backups.'
                      )
                    }}
                  </p>
                </div>
              </div>
            </section>
            <div class="backup-advanced-note">
              <span class="text-weight-medium">{{ gettext('Comment') }}:</span>
              {{
                gettext(
                  "The node-specific 'vzdump.conf' or, if this is not set, the default from the config schema is used to determine fallback values."
                )
              }}
            </div>
          </q-tab-panel>
        </q-tab-panels>
      </q-form>
      <template #foot>
        <q-btn
          class="u-button"
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
          :class="
            !formSaving ? 'bg-primary text-grey-1 u-button' : 'bg-grey-4 text-grey-6 u-button'
          "
          :loading="formSaving"
          :label="gettext(formAction === 'add' ? 'Add' : 'Save')"
          @click="saveTask"
        />
      </template>
    </UWindow>
  </q-dialog>

  <BackupScheduleBuilder
    v-model="scheduleBuilderVisible"
    :schedule="taskForm.schedule"
    @apply="taskForm.schedule = $event"
  />

  <q-dialog
    v-model="guestsVisible"
    persistent
    transition-show="scale"
    transition-hide="scale"
  >
    <UWindow
      :title="gettext('Guests Without Backup Job')"
      width="900px"
      :loading="guestsLoading"
    >
      <div class="backup-dialog-body q-pa-md">
        <q-scroll-area style="height: 500px">
          <q-table
            flat
            :rows="guests"
            :loading="guestsLoading"
            :filter="guestsFilter"
            row-key="id"
            table-header-class="u-table-header"
            :columns="[
              { name: 'type', label: gettext('Type'), field: 'type', align: 'left' },
              { name: 'vmid', label: gettext('VMID'), field: 'vmid', align: 'left' },
              { name: 'name', label: gettext('Name'), field: 'name', align: 'left' },
            ]"
            :no-data-label="gettext('no record can be found')"
            :pagination="{ rowsPerPage: 0 }"
          >
            <template #top>
              <q-input
                v-model="guestsFilter"
                borderless
                dense
                debounce="300"
                :placeholder="gettext('Search')"
              >
                <template #append><q-icon name="search" /></template>
              </q-input>
            </template>
          </q-table>
        </q-scroll-area>
      </div>
      <template #foot>
        <q-btn
          v-close-popup
          no-caps
          flat
          size="12px"
          class="u-button"
          :label="gettext('Close')"
        />
      </template>
    </UWindow>
  </q-dialog>

  <q-dialog
    v-model="simulatorVisible"
    persistent
    transition-show="scale"
    transition-hide="scale"
  >
    <UWindow
      :title="gettext('Schedule Simulator')"
      width="900px"
      :loading="simulatorLoading"
    >
      <div class="backup-simulator">
        <q-splitter
          v-model="simulatorSplitter"
          class="backup-simulator__splitter"
          :limits="[35, 60]"
        >
          <template #before>
            <div class="backup-simulator__pane backup-simulator__pane--form">
              <div class="backup-simulator__title">{{ gettext('Simulation Parameters') }}</div>
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
              />
              <q-input
                v-model.number="simulatorForm.iterations"
                dense
                type="number"
                class="q-field--with-bottom"
                :label="gettext('iterations')"
              />
              <div class="backup-simulator__actions">
                <q-btn
                  no-caps
                  flat
                  size="12px"
                  icon="play_circle_outline"
                  class="bg-primary text-grey-1 u-button"
                  :disable="!simulatorForm.schedule || !simulatorForm.iterations"
                  :loading="simulatorLoading"
                  :label="gettext('Simulate')"
                  @click="runScheduleSimulator"
                />
              </div>
            </div>
          </template>
          <template #after>
            <div class="backup-simulator__pane backup-simulator__pane--results">
              <div class="backup-simulator__heading">
                <div class="backup-simulator__title">{{ gettext('Simulation Results') }}</div>
                <span
                  v-if="simulationRows.length"
                  class="backup-simulator__count"
                >
                  {{
                    gettext('Simulation total: {0}').replace('{0}', String(simulationRows.length))
                  }}
                </span>
              </div>
              <div class="backup-simulator__result-box">
                <div class="backup-simulator__columns">
                  <span>{{ gettext('Expected execution date') }}</span>
                  <span>{{ gettext('Execution Time') }}</span>
                </div>
                <q-scroll-area class="backup-simulator__scroll">
                  <div
                    v-if="simulationRows.length"
                    class="backup-simulator__rows"
                  >
                    <div
                      v-for="(item, index) in simulationRows"
                      :key="String(item.timestamp || item.utc || index)"
                      class="backup-simulator__row"
                    >
                      <span class="backup-simulator__index">
                        {{ String(index + 1).padStart(2, '0') }}
                      </span>
                      <span class="backup-simulator__date">
                        {{ scheduleDate(item.utc) }}
                        <span class="backup-simulator__weekday">
                          {{ scheduleWeekday(item.utc) }}
                        </span>
                      </span>
                      <span class="backup-simulator__time">{{ scheduleTime(item.timestamp) }}</span>
                    </div>
                  </div>
                  <div
                    v-else
                    class="backup-simulator__empty"
                  >
                    {{ gettext('No data available') }}
                  </div>
                </q-scroll-area>
              </div>
            </div>
          </template>
        </q-splitter>
      </div>
      <template #foot>
        <q-btn
          v-close-popup
          no-caps
          flat
          size="12px"
          class="bg-primary text-grey-1 u-button"
          :label="gettext('Finish')"
        />
      </template>
    </UWindow>
  </q-dialog>
</template>

<style scoped>
.backup-dialog-body {
  max-height: 70vh;
  overflow: auto;
}

.backup-info-card {
  overflow: hidden;
  border: 1px solid #e3e8f0;
  border-radius: 6px;
  background: #fff;
}

.backup-info-card__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 12px 20px;
  border-bottom: 1px solid #e7ebf1;
  background: #f7f9fc;
}

.backup-info-card__title {
  min-width: 0;
  color: #202939;
  font-size: 14px;
  font-weight: 600;
  overflow-wrap: anywhere;
}

.backup-info-card__content {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  column-gap: 28px;
  row-gap: 16px;
  padding: 18px 20px 20px;
}

.backup-info-item {
  display: flex;
  flex-direction: column;
  min-width: 0;
  gap: 4px;
}

.backup-info-item--full {
  grid-column: 1 / -1;
  padding-top: 14px;
  border-top: 1px solid #eef1f5;
}

.backup-info-label,
.backup-tree__columns,
.backup-tree__muted {
  color: #778196;
  font-size: 12px;
}

.backup-info-value {
  min-width: 0;
  color: #313b4c;
  overflow-wrap: anywhere;
}

.backup-info-value--numeric {
  font-variant-numeric: tabular-nums;
}

.backup-disk-section__header {
  min-height: 34px;
}

.backup-disk-section__title {
  margin-bottom: 0;
}

.backup-disk-section__filter {
  width: 200px;
}

.backup-disk-section__filter :deep(.q-field__control),
.backup-disk-section__filter :deep(.q-field__marginal) {
  align-items: center;
}

.backup-disk-section__filter :deep(.q-field__prepend) {
  height: 100%;
}

.backup-tree {
  overflow: hidden;
  border: 1px solid #e3e8f0;
  border-radius: 4px;
}

.backup-tree__columns,
.backup-tree__row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 130px 190px;
  align-items: center;
}

.backup-tree__columns {
  min-height: 40px;
  padding: 8px 16px;
  border-bottom: 1px solid #dfe1e6;
  background: #f2f5fc;
  font-weight: 600;
}

.backup-tree :deep(.q-tree__node-header) {
  min-height: 40px;
  padding-right: 16px;
  border-bottom: 1px solid #eef1f5;
}

.backup-tree :deep(.q-tree__node-header-content) {
  flex: 1;
  min-width: 0;
}

.backup-tree :deep(.q-tree__node-header:hover) {
  background: #f5f8fc;
}

.backup-tree__row {
  width: 100%;
}

.backup-tree__label {
  display: flex;
  align-items: center;
  min-width: 0;
}

.backup-tree__label span {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.backup-tree__included {
  display: flex;
  align-items: center;
  color: #4d5b70;
}

.backup-tree__empty {
  padding: 32px 16px;
  color: #8993a5;
  text-align: center;
}

@media (max-width: 720px) {
  .backup-info-card__content {
    grid-template-columns: minmax(0, 1fr);
  }

  .backup-tree__columns,
  .backup-tree__row {
    grid-template-columns: minmax(0, 1fr) 80px 90px;
  }
}

.backup-task-form__panel {
  padding: 24px;
}

.backup-task-form__section {
  padding: 0 0 28px;
}

.backup-task-form__section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
}

.backup-task-form__section-title {
  display: flex;
  align-items: center;
  gap: 12px;
  color: #252d3d;
  font-size: 14px;
  font-weight: 600;
  line-height: 24px;
}

.backup-task-form__section-title::before {
  width: 4px;
  height: 14px;
  border-radius: 2px;
  background: var(--q-primary);
  content: '';
}

.backup-task-form__panel .backup-task-form__section-title::before {
  height: 16px;
}

.backup-task-form__fields {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  column-gap: 30px;
  row-gap: 8px;
}

.backup-task-form__field {
  min-width: 0;
}

.backup-task-form__field--full {
  grid-column: 1 / -1;
}

.backup-task-form__field .select-table,
.backup-task-form__field .q-field {
  width: 100%;
}

.backup-task-form__section--objects {
  border-top: 1px solid #e3e7ee;
  padding-top: 28px;
}

.backup-task-form__section--objects .backup-task-form__section-title {
  margin-bottom: 16px;
}

@media (max-width: 600px) {
  .backup-task-form__panel {
    padding: 16px;
  }

  .backup-task-form__fields {
    grid-template-columns: minmax(0, 1fr);
  }
}

.backup-vm-picker__popup {
  width: 720px;
  max-width: calc(100vw - 32px);
  background: #ffffff;
}

.backup-vm-picker__scroll {
  height: 250px;
}

.notification-settings__mode {
  padding-top: 4px;
}

.notification-settings__legacy {
  margin-left: 50px;
  max-width: calc(100% - 50px);
}

.backup-task-form__panel--advanced {
  padding-bottom: 20px;
}

.backup-advanced-section .backup-task-form__section-title {
  margin-bottom: 12px;
}

.advanced-settings-container {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  column-gap: 28px;
  row-gap: 4px;
}

.advanced-row {
  min-width: 0;
  padding: 8px 0 14px;
  /* border-bottom: 1px solid #e6ebf2; */
}

.advanced-row :deep(.q-field--with-bottom) {
  padding-bottom: 0;
}

.advanced-row > p {
  margin: 4px 0 0;
  color: #66758b;
  font-size: 12px;
  line-height: 1.5;
}

.advanced-row--checkbox > div {
  display: flex;
  align-items: center;
  min-height: 40px;
}

.backup-advanced-note {
  margin-top: 20px;
  font-size: 12px;
  padding: 12px 14px;
  border-left: 3px solid #b9d2ee;
  background: #f7f9fc;
  color: #54657d;
  line-height: 1.6;
}

.backup-task-form__hint {
  padding: 16px;
  border: 1px dotted #e0b11c;
  background: #fff8df;
  color: #6f5810;
  font-size: 12px;
  line-height: 20px;
}

.backup-plan-builder-btn :deep(.q-btn__content .q-icon) {
  font-size: 18px !important;
}

@media (max-width: 700px) {
  .advanced-settings-container {
    grid-template-columns: minmax(0, 1fr);
  }
}

.backup-simulator__splitter {
  height: 480px;
}

.backup-simulator__splitter :deep(.q-splitter__separator) {
  background: #e3e8f0;
}

.backup-simulator__pane {
  height: 100%;
  padding: 24px;
}

.backup-simulator__title {
  display: flex;
  align-items: center;
  gap: 12px;
  color: #253248;
  font-size: 14px;
  font-weight: 600;
  line-height: 24px;
}

.backup-simulator__title::before {
  width: 4px;
  height: 20px;
  border-radius: 2px;
  background: var(--q-primary);
  content: '';
}

.backup-simulator__pane--form .backup-simulator__title {
  margin-bottom: 20px;
}

.backup-simulator__actions {
  display: flex;
  justify-content: flex-end;
  margin-top: 16px;
}

.backup-simulator__heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 18px;
}

.backup-simulator__count {
  color: #8593a8;
}

.backup-simulator__result-box {
  overflow: hidden;
  border: 1px solid #e3e8f0;
  border-radius: 6px;
}

.backup-simulator__columns {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 100px;
  align-items: center;
  min-height: 40px;
  padding: 0 16px;
  background: #f2f5fc;
  color: #63748d;
}

.backup-simulator__columns span:last-child {
  text-align: right;
}

.backup-simulator__scroll {
  height: 350px;
}

.backup-simulator__row {
  display: grid;
  grid-template-columns: 24px minmax(0, 1fr) 100px;
  align-items: center;
  gap: 8px;
  min-height: 58px;
  padding: 0 16px;
  border-bottom: 1px solid #e9edf3;
}

.backup-simulator__row:last-child {
  border-bottom: 0;
}

.backup-simulator__index {
  color: #9aa8ba;
  font-variant-numeric: tabular-nums;
}

.backup-simulator__date {
  min-width: 0;
  color: #33445f;
  font-weight: 500;
  overflow-wrap: anywhere;
}

.backup-simulator__weekday {
  margin-left: 8px;
  color: #8896aa;
  font-weight: normal;
}
.backup-simulator__time {
  color: var(--q-primary);
  font-variant-numeric: tabular-nums;
  text-align: right;
}

.backup-simulator__empty {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 350px;
  color: #8993a5;
}
.detail-value {
  max-width: 470px;
  overflow-wrap: anywhere;
  white-space: pre-wrap;
}
</style>
