<script setup lang="ts">
import type { QTableColumn } from 'quasar';
import { computed, shallowRef, useTemplateRef, watch } from 'vue';
import type { QInput } from 'quasar';
import { gettext } from '@/locale';
import { getVmTaskHistory, type VmTask } from '@/api/vm';

const props = defineProps<{ node: string; vmid: string }>();
const emit = defineEmits<{ task: [node: string, upid: string, title: string] }>();
const loading = shallowRef(false);
const filter = shallowRef('');
const showFilter = shallowRef(false);
const since = shallowRef('');
const until = shallowRef('');
const userfilter = shallowRef('');
const statusfilter = shallowRef<string[]>([]);
const typefilter = shallowRef<string[]>([]);
const sinceDateInput = useTemplateRef<QInput>('sinceDateInput');
const untilDateInput = useTemplateRef<QInput>('untilDateInput');
const selected = shallowRef<VmTask[]>([]);
const tasks = shallowRef<VmTask[]>([]);
const selectedTask = computed(() => selected.value[0]);
const filterCount = computed(
  () =>
    [since.value, until.value, userfilter.value, ...statusfilter.value, ...typefilter.value].filter(
      Boolean,
    ).length,
);
const clearFilterText = computed(() =>
  filterCount.value ? `${gettext('Clear Filter')} (${filterCount.value})` : gettext('Clear Filter'),
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
const filteredTasks = computed(() => {
  const keyword = filter.value.trim().toLowerCase();
  const sinceTime = since.value ? new Date(since.value).valueOf() / 1000 : 0;
  const untilTime = until.value ? new Date(until.value).valueOf() / 1000 + 86400 : 0;
  return tasks.value.filter((task) => {
    const startTime = Number(task.starttime) || 0;
    const status = String(task.status || '').toLowerCase();
    return (
      (!keyword ||
        [task.type, task.id, task.user, task.status, task.node]
          .join(' ')
          .toLowerCase()
          .includes(keyword)) &&
      (!sinceTime || startTime >= sinceTime) &&
      (!untilTime || startTime < untilTime) &&
      (!userfilter.value ||
        String(task.user || '')
          .toLowerCase()
          .includes(userfilter.value.toLowerCase())) &&
      (!statusfilter.value.length || statusfilter.value.some((value) => status.includes(value))) &&
      (!typefilter.value.length || typefilter.value.includes(String(task.type || '')))
    );
  });
});
const columns = computed<QTableColumn<VmTask>[]>(() => [
  {
    name: 'starttime',
    label: gettext('Start Time'),
    field: (row) => formatTime(row.starttime),
    align: 'left',
    sortable: true,
  },
  {
    name: 'endtime',
    label: gettext('End Time'),
    field: (row) => formatTime(row.endtime),
    align: 'left',
    sortable: true,
  },
  { name: 'node', label: gettext('Node'), field: 'node', align: 'left', sortable: true },
  { name: 'user', label: gettext('Username'), field: 'user', align: 'left', sortable: true },
  {
    name: 'description',
    label: gettext('Description'),
    field: taskDescription,
    align: 'left',
    sortable: true,
  },
  { name: 'status', label: gettext('Status'), field: 'status', align: 'left', sortable: true },
  { name: 'actions', label: '', field: () => '', align: 'right' },
]);

function formatTime(value: unknown) {
  const seconds = Number(value);
  return Number.isFinite(seconds) && seconds > 0 ? new Date(seconds * 1000).toLocaleString() : '-';
}

function taskDescription(row: VmTask) {
  return [row.type, row.id].filter(Boolean).join(' ') || '-';
}

async function reload() {
  if (!props.node || !props.vmid) return;
  loading.value = true;
  try {
    const response = await getVmTaskHistory(props.node, props.vmid);
    tasks.value = response.data || [];
    selected.value = [];
  } finally {
    loading.value = false;
  }
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
  typefilter.value = [];
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
  { immediate: true },
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
        class="u-button q-ml-sm"
        :color="filterCount ? 'primary' : 'grey'"
        :disable="!filterCount"
        :label="clearFilterText"
        @click="clearFilters"
      />
      <q-space />
      <q-input v-model="filter" borderless dense debounce="300" :placeholder="gettext('Search')"
        ><template #append><q-icon name="search" /></template
      ></q-input>
      <q-spinner v-if="loading" color="primary" size="20px" class="q-ml-sm" />
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
    <div v-if="showFilter" class="task-history-filter q-px-md q-py-lg">
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
            @click="openDatePicker(sinceDateInput)"
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
            @click="openDatePicker(untilDateInput)"
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
            multiple
            emit-value
            map-options
            options-dense
            :options="taskTypes"
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
      :rows="filteredTasks"
      :columns="columns"
      :loading="loading"
      :pagination="{ rowsPerPage: 20 }"
      class="u-compact-table"
      @row-dblclick="(_, row) => openTask(row)"
    >
      <template #body-cell-status="scope"
        ><q-td :props="scope"
          ><span :class="scope.value === 'OK' ? 'text-positive' : 'text-negative'">{{
            scope.value || '-'
          }}</span></q-td
        ></template
      >
      <template #body-cell-actions="scope">
        <q-td :props="scope" class="text-right">
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
