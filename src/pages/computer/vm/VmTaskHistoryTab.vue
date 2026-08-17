<script setup lang="ts">
import type { QTableColumn } from 'quasar';
import { computed, shallowRef, useTemplateRef, watch } from 'vue';
import type { QInput } from 'quasar';
import { gettext } from '@/locale';
import { getVmTaskHistory, getVmTaskLogDownloadUrl, type VmTask } from '@/api/vm';

const props = defineProps<{ node: string; vmid: string }>();
const emit = defineEmits<{ task: [node: string, upid: string, title: string] }>();
const loading = shallowRef(false);
const filter = shallowRef('');
const showFilter = shallowRef(false);
const since = shallowRef('');
const until = shallowRef('');
const userfilter = shallowRef('');
const statusfilter = shallowRef<string[]>([]);
const typefilter = shallowRef('');
const sinceDateInput = useTemplateRef<QInput>('sinceDateInput');
const untilDateInput = useTemplateRef<QInput>('untilDateInput');
const selected = shallowRef<VmTask[]>([]);
const tasks = shallowRef<VmTask[]>([]);
const page = shallowRef(1);
const pageSize = 500;
const total = shallowRef(0);
const selectedTask = computed(() => selected.value[0]);
const filterCount = computed(
  () =>
    [since.value, until.value, userfilter.value, ...statusfilter.value, typefilter.value].filter(
      Boolean
    ).length
);
const clearFilterText = computed(() =>
  filterCount.value ? `${gettext('Clear Filter')} (${filterCount.value})` : gettext('Clear Filter')
);
const statusOptions = [
  { label: 'OK', value: 'ok' },
  { label: gettext('unknown'), value: 'unknown' },
  { label: gettext('Warnings'), value: 'warning' },
  { label: gettext('Errors'), value: 'error' },
];
const taskTypes = [
  'acmedeactivate',
  'acmenewcert',
  'acmerefresh',
  'acmeregister',
  'acmerenew',
  'acmerevoke',
  'acmeupdate',
  'aptupdate',
  'auth-realm-sync',
  'auth-realm-sync-test',
  'bulk-migrate',
  'bulk-shutdown',
  'bulk-start',
  'bulk-suspend',
  'cephcreatemds',
  'cephcreatemgr',
  'cephcreatemon',
  'cephcreateosd',
  'cephcreatepool',
  'cephdestroymds',
  'cephdestroymgr',
  'cephdestroymon',
  'cephdestroyosd',
  'cephdestroyfs',
  'cephdestroypool',
  'cephfscreate',
  'cephsetflags',
  'cephsetpool',
  'clustercreate',
  'clusterjoin',
  'dircreate',
  'dirremove',
  'diskinit',
  'download',
  'hamigrate',
  'hashutdown',
  'hastart',
  'hastop',
  'imgcopy',
  'imgdel',
  'lvmcreate',
  'lvmremove',
  'lvmthincreate',
  'lvmthinremove',
  'migrateall',
  'move_volume',
  'pbs-download',
  'pull_file',
  'push_file',
  'qmclone',
  'qmconfig',
  'qmcreate',
  'qmdelsnapshot',
  'qmdestroy',
  'qmigrate',
  'qmmove',
  'qmpause',
  'qmreboot',
  'qmreset',
  'qmrestore',
  'qmresume',
  'qmrollback',
  'qmshutdown',
  'qmsnapshot',
  'qmstart',
  'qmstop',
  'qmsuspend',
  'qmtemplate',
  'reloadnetworkall',
  'resize',
  'spiceproxy',
  'spiceshell',
  'srvreload',
  'srvrestart',
  'srvstart',
  'srvstop',
  'startall',
  'stopall',
  'suspendall',
  'termproxy',
  'unknownimgdel',
  'vncproxy',
  'vncshell',
  'vzclone',
  'vzcreate',
  'vzdelsnapshot',
  'vzdestroy',
  'vzdump',
  'vzmigrate',
  'vzmount',
  'vzreboot',
  'vzrestore',
  'vzresume',
  'vzrollback',
  'vzshutdown',
  'vzsnapshot',
  'vzstart',
  'vzstop',
  'vzsuspend',
  'vztemplate',
  'vzumount',
  'wipedisk',
  'zfscreate',
  'zfsremove',
]
  .sort()
  .map((type) => ({ label: type, value: type }));
const visibleTasks = computed(() => {
  const keyword = filter.value.trim().toLowerCase();
  if (!keyword) return tasks.value;
  return tasks.value.filter((task) =>
    [task.type, task.id, task.user, task.status, task.node]
      .join(' ')
      .toLowerCase()
      .includes(keyword)
  );
});
const columns = computed<QTableColumn<VmTask>[]>(() => [
  {
    name: 'starttime',
    label: gettext('Start Time'),
    field: (row) => formatTime(row.starttime),
    align: 'left',
  },
  {
    name: 'endtime',
    label: gettext('End Time'),
    field: (row) => formatTime(row.endtime),
    align: 'left',
  },
  {
    name: 'duration',
    label: gettext('Duration'),
    field: (row) => formatDuration(row.starttime, row.endtime),
    align: 'left',
  },
  { name: 'node', label: gettext('Node'), field: 'node', align: 'left' },
  { name: 'user', label: gettext('Username'), field: 'user', align: 'left' },
  {
    name: 'description',
    label: gettext('Description'),
    field: taskDescription,
    align: 'left',
  },
  { name: 'status', label: gettext('Status'), field: 'status', align: 'left' },
  { name: 'actions', label: '', field: () => '', align: 'right' },
]);

function formatTime(value: unknown) {
  const seconds = Number(value);
  return Number.isFinite(seconds) && seconds > 0 ? new Date(seconds * 1000).toLocaleString() : '-';
}

type TaskDescription = [string, string];

const taskDescriptions: Record<string, TaskDescription> = {
  acmedeactivate: ['ACME Account', gettext('Deactivate')],
  acmenewcert: ['SRV', gettext('Order Certificate')],
  acmerefresh: ['ACME Account', gettext('Refresh')],
  acmeregister: ['ACME Account', gettext('Register')],
  acmerenew: ['SRV', gettext('Renew Certificate')],
  acmerevoke: ['SRV', gettext('Revoke Certificate')],
  acmeupdate: ['ACME Account', gettext('Update')],
  'auth-realm-sync': [gettext('Realm'), gettext('Sync')],
  'auth-realm-sync-test': [gettext('Realm'), gettext('Sync Preview')],
  'bulk-migrate': ['', gettext('Bulk migrate VMs and Containers')],
  'bulk-shutdown': ['', gettext('Bulk shutdown VMs and Containers')],
  'bulk-start': ['', gettext('Bulk start VMs and Containers')],
  'bulk-suspend': ['', gettext('Bulk shutdown VMs and Containers')],
  cephcreatemds: ['Ceph Metadata Server', gettext('Create')],
  cephcreatemgr: ['Ceph Manager', gettext('Create')],
  cephcreatemon: ['Ceph Monitor', gettext('Create')],
  cephcreateosd: ['Ceph OSD', gettext('Create')],
  cephcreatepool: ['Ceph Pool', gettext('Create')],
  cephdestroymds: ['Ceph Metadata Server', gettext('Destroy')],
  cephdestroymgr: ['Ceph Manager', gettext('Destroy')],
  cephdestroymon: ['Ceph Monitor', gettext('Destroy')],
  cephdestroyosd: ['Ceph OSD', gettext('Destroy')],
  cephdestroyfs: ['CephFS', gettext('Destroy')],
  cephdestroypool: ['Ceph Pool', gettext('Destroy')],
  cephfscreate: ['CephFS', gettext('Create')],
  cephsetflags: ['', gettext('Change global Ceph flags')],
  cephsetpool: ['Ceph Pool', gettext('Edit')],
  clustercreate: ['', gettext('Create Cluster')],
  clusterjoin: ['', gettext('Join Cluster')],
  dircreate: [gettext('Directory Storage'), gettext('Create')],
  dirremove: [gettext('Directory'), gettext('Remove')],
  download: [gettext('File'), gettext('Download')],
  hamigrate: ['HA', gettext('Migrate')],
  hashutdown: ['HA', gettext('Shutdown')],
  hastart: ['HA', gettext('Start')],
  hastop: ['HA', gettext('Stop')],
  imgcopy: ['', gettext('Copy data')],
  imgdel: ['', gettext('Erase data')],
  lvmcreate: [gettext('LVM Storage'), gettext('Create')],
  lvmremove: ['Volume Group', gettext('Remove')],
  lvmthincreate: ['LVM-Thin Storage', gettext('Create')],
  lvmthinremove: ['Thinpool', gettext('Remove')],
  migrateall: ['', gettext('Bulk migrate VMs and Containers')],
  move_volume: ['CT', gettext('Move Volume')],
  'pbs-download': ['VM/CT', gettext('File Restore Download')],
  pull_file: ['CT', gettext('Pull file')],
  push_file: ['CT', gettext('Push file')],
  qmclone: ['VM', gettext('Clone')],
  qmconfig: ['VM', gettext('Configure')],
  qmcreate: ['VM', gettext('Create')],
  qmdelsnapshot: ['VM', gettext('Delete Snapshot')],
  qmdestroy: ['VM', gettext('Destroy')],
  qmigrate: ['VM', gettext('Migrate')],
  qmmove: ['VM', gettext('Move disk')],
  qmpause: ['VM', gettext('Pause')],
  qmreboot: ['VM', gettext('Reboot')],
  qmreset: ['VM', gettext('Reset')],
  qmrestore: ['VM', gettext('Restore')],
  qmresume: ['VM', gettext('Resume')],
  qmrollback: ['VM', gettext('Rollback')],
  qmshutdown: ['VM', gettext('Shutdown')],
  qmsnapshot: ['VM', gettext('Snapshot')],
  qmstart: ['VM', gettext('Start')],
  qmstop: ['VM', gettext('Stop')],
  qmsuspend: ['VM', gettext('Hibernate')],
  qmtemplate: ['VM', gettext('Convert to template')],
  reloadnetworkall: ['', gettext('Reload network configuration on all nodes')],
  resize: ['VM/CT', gettext('Resize')],
  spiceproxy: ['VM/CT', `${gettext('Console')} (Spice)`],
  spiceshell: ['', `${gettext('Shell')} (Spice)`],
  startall: ['', gettext('Bulk start VMs and Containers')],
  stopall: ['', gettext('Bulk shutdown VMs and Containers')],
  suspendall: ['', gettext('Suspend all VMs')],
  unknownimgdel: ['', gettext('Destroy image from unknown guest')],
  vncproxy: ['VM/CT', gettext('Console')],
  vncshell: ['', gettext('Shell')],
  vzclone: ['CT', gettext('Clone')],
  vzcreate: ['CT', gettext('Create')],
  vzdelsnapshot: ['CT', gettext('Delete Snapshot')],
  vzdestroy: ['CT', gettext('Destroy')],
  vzmigrate: ['CT', gettext('Migrate')],
  vzmount: ['CT', gettext('Mount')],
  vzreboot: ['CT', gettext('Reboot')],
  vzrestore: ['CT', gettext('Restore')],
  vzresume: ['CT', gettext('Resume')],
  vzrollback: ['CT', gettext('Rollback')],
  vzshutdown: ['CT', gettext('Shutdown')],
  vzsnapshot: ['CT', gettext('Snapshot')],
  vzstart: ['CT', gettext('Start')],
  vzstop: ['CT', gettext('Stop')],
  vzsuspend: ['CT', gettext('Suspend')],
  vztemplate: ['CT', gettext('Convert to template')],
  vzumount: ['CT', gettext('Unmount')],
  wipedisk: ['Device', gettext('Wipe Disk')],
  zfscreate: [gettext('ZFS Storage'), gettext('Create')],
  zfsremove: ['ZFS Pool', gettext('Remove')],
};

function formatTaskDescription(type?: string, id?: string) {
  if (type === 'vzdump') return id ? `VM/CT ${id} - ${gettext('Backup')}` : gettext('Backup Job');
  const description = taskDescriptions[type || ''];
  if (description) {
    const [subject, action] = description;
    return subject ? `${subject}${id ? ` ${id}` : ''} - ${action}` : action;
  }
  return [type, id].filter(Boolean).join(' ') || '-';
}

function taskDescription(row: VmTask) {
  return formatTaskDescription(row.type, row.id);
}

function formatDuration(starttime?: number, endtime?: number) {
  const seconds = Number(endtime) - Number(starttime);
  if (!Number.isFinite(seconds) || seconds < 0) return '-';
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainingSeconds = seconds % 60;
  return [hours && `${hours}h`, minutes && `${minutes}m`, `${remainingSeconds}s`]
    .filter(Boolean)
    .join(' ');
}

function parseTaskStatus(status?: string) {
  if (status === 'OK') return 'ok';
  if (status === 'unknown') return 'unknown';
  if (status?.startsWith('WARNINGS:')) return 'warning';
  return 'error';
}

function formatTaskStatus(status?: string) {
  const kind = parseTaskStatus(status);
  if (kind === 'ok') return 'text-positive';
  if (kind === 'warning') return 'text-warning';
  if (kind === 'unknown') return 'text-grey';
  return 'text-negative';
}

function dayStart(value: string) {
  return value ? new Date(`${value}T00:00:00`).valueOf() / 1000 : undefined;
}

function dateRangeIsValid() {
  return !since.value || !until.value || since.value <= until.value;
}

function buildParams() {
  const sinceStart = dayStart(since.value);
  const untilStart = dayStart(until.value);
  return {
    start: (page.value - 1) * pageSize,
    limit: pageSize,
    ...(sinceStart === undefined ? {} : { since: sinceStart }),
    ...(untilStart === undefined ? {} : { until: untilStart + 86400 }),
    ...(userfilter.value ? { userfilter: userfilter.value } : {}),
    ...(typefilter.value ? { typefilter: typefilter.value } : {}),
    ...(statusfilter.value.length ? { statusfilter: statusfilter.value } : {}),
  };
}

async function reload(resetPage = false) {
  if (!props.node || !props.vmid) return;
  if (!dateRangeIsValid()) return;
  if (resetPage) page.value = 1;
  loading.value = true;
  try {
    const response = await getVmTaskHistory(props.node, props.vmid, buildParams());
    tasks.value = response.data || [];
    total.value = Number(
      (response as typeof response & { total?: number }).total ?? tasks.value.length
    );
    selected.value = [];
  } catch {
    // request() already presents PVE API errors; consume them for watcher and event callers.
  } finally {
    loading.value = false;
  }
}

function downloadTask(task = selectedTask.value) {
  const url = task?.upid ? getVmTaskLogDownloadUrl(task.upid) : '';
  if (url) window.location.assign(url);
}

function openTask(task = selectedTask.value) {
  if (!task?.upid) return;
  emit('task', props.node, task.upid, taskDescription(task));
}

function clearFilters() {
  since.value = '';
  until.value = '';
  userfilter.value = '';
  statusfilter.value = [];
  typefilter.value = '';
  void reload(true);
}

function openDatePicker(input: QInput | null) {
  const nativeInput = input?.nativeEl as HTMLInputElement | undefined;
  nativeInput?.focus();
  nativeInput?.showPicker?.();
}

watch(
  () => [props.node, props.vmid],
  () => {
    void reload();
  },
  { immediate: true }
);
</script>

<template>
  <div class="vm-task-history-tab q-pa-md">
    <div class="row items-center task-history-toolbar">
      <q-btn
        no-caps
        outline
        size="12px"
        color="primary"
        class="u-button"
        :label="gettext('View')"
        :disable="!selectedTask"
        @click="openTask()"
      />
      <q-btn
        no-caps
        outline
        size="12px"
        class="u-button q-ml-sm"
        color="primary"
        :label="gettext('Filter')"
        icon="filter_alt"
        @click="showFilter = !showFilter"
      />
      <q-btn
        no-caps
        outline
        size="12px"
        color="primary"
        class="u-button q-ml-sm"
        :label="gettext('Download')"
        :disable="!selectedTask"
        @click="downloadTask()"
      />
      <q-btn
        no-caps
        outline
        size="12px"
        class="u-button q-ml-sm"
        :color="filterCount ? 'primary' : 'grey'"
        :disable="!filterCount"
        :label="clearFilterText"
        @click="clearFilters"
      />
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
      <q-spinner
        v-if="loading"
        color="primary"
        size="20px"
        class="q-ml-sm"
      />
      <q-icon
        v-else
        name="refresh"
        color="primary"
        size="20px"
        class="q-ml-sm cursor-pointer refresh-icon"
        role="button"
        tabindex="0"
        :aria-label="gettext('Refresh')"
        @click="reload"
        @keyup.enter="reload"
      >
        <q-tooltip>{{ gettext('Refresh') }}</q-tooltip>
      </q-icon>
    </div>
    <div
      v-if="showFilter"
      class="task-history-filter q-px-md q-py-lg"
    >
      <div class="row q-col-gutter-md">
        <div class="col-12 col-md-4 task-filter-field">
          <span class="task-filter-label">{{ gettext('Since') }}</span>
          <q-input
            ref="sinceDateInput"
            v-model="since"
            class="task-filter-control u-dense u-size-12"
            square
            outlined
            dense
            type="date"
            :max="until || undefined"
            :rules="[
              (value) => !until || value <= until || gettext('Since cannot be later than Until'),
            ]"
            @click="openDatePicker(sinceDateInput)"
            @update:model-value="reload(true)"
          />
        </div>
        <div class="col-12 col-md-4 task-filter-field">
          <span class="task-filter-label">{{ gettext('Until') }}</span>
          <q-input
            ref="untilDateInput"
            v-model="until"
            class="task-filter-control u-dense u-size-12"
            square
            outlined
            dense
            type="date"
            :min="since || undefined"
            :rules="[
              (value) => !since || value >= since || gettext('Until cannot be earlier than Since'),
            ]"
            @click="openDatePicker(untilDateInput)"
            @update:model-value="reload(true)"
          />
        </div>
        <div class="col-12 col-md-4 task-filter-field">
          <span class="task-filter-label">{{ gettext('Task Result') }}</span>
          <q-select
            v-model="statusfilter"
            class="task-filter-control u-dense u-size-12"
            square
            outlined
            dense
            multiple
            emit-value
            map-options
            options-dense
            :options="statusOptions"
            @update:model-value="reload(true)"
          />
        </div>
        <div class="col-12 col-md-4 task-filter-field">
          <span class="task-filter-label">{{ gettext('Task Type') }}</span>
          <q-select
            v-model="typefilter"
            class="task-filter-control u-dense u-size-12"
            square
            outlined
            dense
            emit-value
            map-options
            options-dense
            :options="taskTypes"
            @update:model-value="reload(true)"
          />
        </div>
        <div class="col-12 col-md-4 task-filter-field">
          <span class="task-filter-label">{{ gettext('Username') }}</span>
          <q-input
            v-model="userfilter"
            class="task-filter-control u-dense u-size-12"
            square
            outlined
            dense
            @update:model-value="reload(true)"
          />
        </div>
      </div>
    </div>
    <q-table
      v-model:selected="selected"
      flat
      row-key="upid"
      selection="single"
      hide-selected-banner
      table-header-class="u-table-header"
      :rows="visibleTasks"
      :columns="columns"
      :loading="loading"
      :pagination="{ page, rowsPerPage: pageSize, rowsNumber: total }"
      :rows-per-page-options="[pageSize]"
      class="u-compact-table"
      @row-dblclick="(_, row) => openTask(row)"
      @update:pagination="
        (value) => {
          page = value.page;
          void reload();
        }
      "
    >
      <template #body-cell-status="scope">
        <q-td :props="scope">
          <span :class="formatTaskStatus(scope.value)">{{ scope.value || '-' }}</span>
        </q-td>
      </template>
      <template #body-cell-actions="scope">
        <q-td
          :props="scope"
          class="text-right"
        >
          <q-icon
            name="chevron_right"
            color="primary"
            size="20px"
            class="cursor-pointer"
            role="button"
            tabindex="0"
            :aria-label="gettext('View Task')"
            @click="openTask(scope.row)"
            @keyup.enter="openTask(scope.row)"
          >
            <q-tooltip>{{ gettext('View Task') }}</q-tooltip>
          </q-icon>
        </q-td>
      </template>
    </q-table>
  </div>
</template>

<style scoped>
.u-compact-table :deep(tbody td) {
  height: 40px;
  font-size: 12px;
}

.task-history-toolbar {
  min-height: 52px;
  padding: 12px;
}

.task-filter-field {
  align-items: center;
  display: flex;
  gap: 8px;
}

.task-filter-label {
  color: #666;
  flex: 0 0 62px;
  font-size: 12px;
  text-align: right;
}

.task-filter-control {
  flex: 1;
  min-width: 0;
}

.task-filter-control :deep(.q-field__control),
.task-filter-control :deep(.q-field__marginal) {
  height: 28px !important;
  min-height: 28px !important;
}

.task-filter-control :deep(.q-field__native),
.task-filter-control :deep(.q-field__input) {
  line-height: 28px;
  min-height: 28px !important;
  padding-bottom: 0;
  padding-top: 0;
}

.task-filter-control :deep(.q-field--outlined .q-field__control::before),
.task-filter-control :deep(.q-field--outlined .q-field__control::after) {
  border: 1px solid #ccc !important;
}
</style>
