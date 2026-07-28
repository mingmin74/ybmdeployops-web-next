<script setup lang="ts">
import type { QTableColumn } from 'quasar';
import { computed, shallowRef, watch } from 'vue';
import { getNodeTasks, type PveNodeTask } from '@/api/host';
import TaskOutputDialog from '@/components/TaskOutputDialog.vue';
import { gettext } from '@/locale';

const { node } = defineProps<{ node: string }>();

const loading = shallowRef(false);
const rows = shallowRef<PveNodeTask[]>([]);
const selected = shallowRef<PveNodeTask[]>([]);
const showFilter = shallowRef(false);
const since = shallowRef('');
const until = shallowRef('');
const userfilter = shallowRef('');
const vmidfilter = shallowRef('');
const statusfilter = shallowRef<string[]>([]);
const typefilter = shallowRef<string[]>([]);
const taskDialogVisible = shallowRef(false);
const page = shallowRef(1);
const rowsPerPage = shallowRef(50);
const total = shallowRef(0);

const selectedTask = computed(() => selected.value[0]);
const filterCount = computed(
  () =>
    [
      since.value,
      until.value,
      userfilter.value,
      vmidfilter.value,
      ...statusfilter.value,
      ...typefilter.value,
    ].filter(Boolean).length,
);
const clearFilterText = computed(() =>
  filterCount.value ? `${gettext('Clear Filter')} (${filterCount.value})` : gettext('Clear Filter'),
);
const taskTitle = computed(() => taskDescription(selectedTask.value));
const statusOptions = [
  { label: 'OK', value: 'ok' },
  { label: gettext('unknown'), value: 'unknown' },
  { label: gettext('Warnings'), value: 'warning' },
  { label: gettext('Errors'), value: 'error' },
];
const taskTypes = computed(() =>
  [...new Set(rows.value.map((row) => row.type).filter(Boolean) as string[])]
    .sort()
    .map((type) => ({ label: type, value: type })),
);
const columns: QTableColumn<PveNodeTask>[] = [
  {
    name: 'starttime',
    label: gettext('Start Time'),
    align: 'left',
    field: (row) => formatTime(row.starttime),
  },
  {
    name: 'endtime',
    label: gettext('End Time'),
    align: 'left',
    field: (row) => formatTime(row.endtime),
  },
  { name: 'user', label: gettext('User name'), align: 'left', field: 'user' },
  {
    name: 'description',
    label: gettext('Description'),
    align: 'left',
    field: (row) => taskDescription(row),
  },
  { name: 'status', label: gettext('Status'), align: 'left', field: 'status' },
];

function formatTime(value?: number) {
  if (!value) return '';
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'medium' }).format(
    new Date(value * 1000),
  );
}

function taskDescription(task?: PveNodeTask) {
  if (!task) return '';
  const names: Record<string, string> = {
    aptupdate: gettext('Update package database'),
    diskinit: gettext('Initialize Disk with GPT'),
    spiceshell: `${gettext('Shell')} (Spice)`,
    srvreload: gettext('Reload'),
    srvrestart: gettext('Restart'),
    srvstart: gettext('Start'),
    srvstop: gettext('Stop'),
    termproxy: `${gettext('Console')} (xterm.js)`,
    vncshell: gettext('Shell'),
  };
  return names[task.type || ''] || [task.type, task.id].filter(Boolean).join(' ');
}

function statusClass(status?: string) {
  const value = String(status || '').toLowerCase();
  if (value.includes('error')) return 'negative';
  if (value.includes('warn')) return 'warning';
  if (value.includes('ok')) return 'positive';
  return 'grey';
}

function buildParams() {
  const start = (page.value - 1) * rowsPerPage.value;
  const params: Record<string, unknown> = { start, limit: rowsPerPage.value };
  if (typefilter.value.length) params.typefilter = typefilter.value.join(',');
  if (statusfilter.value.length) params.statusfilter = statusfilter.value.join(',');
  if (userfilter.value) params.userfilter = userfilter.value;
  if (vmidfilter.value) params.vmid = vmidfilter.value;
  if (since.value) params.since = new Date(since.value).valueOf() / 1000;
  if (until.value) {
    const date = new Date(until.value);
    date.setDate(date.getDate() + 1);
    params.until = date.valueOf() / 1000;
  }
  return params;
}

async function loadTasks(resetPage = false) {
  if (!node) return;
  if (resetPage) page.value = 1;
  loading.value = true;
  try {
    const response = await getNodeTasks(node, buildParams());
    rows.value = response.data || [];
    total.value = Number(
      (response as typeof response & { total?: number }).total || rows.value.length,
    );
    selected.value = [];
  } finally {
    loading.value = false;
  }
}

function clearFilter() {
  since.value = '';
  until.value = '';
  userfilter.value = '';
  vmidfilter.value = '';
  statusfilter.value = [];
  typefilter.value = [];
  void loadTasks(true);
}

function selectRow(_event: Event, row: PveNodeTask) {
  selected.value = selectedTask.value?.upid === row.upid ? [] : [row];
}

function openSelectedTask() {
  if (selectedTask.value) taskDialogVisible.value = true;
}

watch(
  () => node,
  () => {
    void loadTasks(true);
  },
  { immediate: true },
);
</script>

<template>
  <section class="node-task-history">
    <q-table
      flat
      row-key="upid"
      selection="single"
      hide-selected-banner
      table-header-class="u-table-header"
      :rows="rows"
      :columns="columns"
      :selected="selected"
      :loading="loading"
      :pagination="{ page, rowsPerPage, rowsNumber: total }"
      :rows-per-page-options="[25, 50, 100]"
      :no-data-label="gettext('No Tasks found')"
      @row-click="selectRow"
      @row-dblclick="openSelectedTask"
      @update:selected="selected = [...$event]"
      @update:pagination="
        (value) => {
          page = value.page;
          rowsPerPage = value.rowsPerPage;
          loadTasks();
        }
      "
    >
      <template #top>
        <div class="row q-gutter-sm">
          <q-btn
            no-caps
            outline
            size="12px"
            class="u-button"
            :color="selectedTask ? 'primary' : 'grey'"
            :disable="!selectedTask"
            :label="gettext('View Task')"
            @click="openSelectedTask"
          />
          <q-btn
            no-caps
            outline
            size="12px"
            class="u-button"
            color="primary"
            :label="gettext('Reload')"
            @click="loadTasks(true)"
          />
          <q-btn
            no-caps
            outline
            size="12px"
            class="u-button"
            :color="filterCount ? 'primary' : 'grey'"
            :disable="!filterCount"
            :label="clearFilterText"
            @click="clearFilter"
          />
          <q-btn
            no-caps
            outline
            size="12px"
            class="u-button"
            :color="showFilter ? 'primary' : 'grey'"
            :label="gettext('Filter')"
            icon="filter_alt"
            @click="showFilter = !showFilter"
          />
        </div>
      </template>
      <template v-if="showFilter" #top-row>
        <q-tr
          ><q-td colspan="100%" class="q-pa-md"
            ><div class="row q-col-gutter-md">
              <q-input
                v-model="since"
                class="col-12 col-md-3 u-dense"
                dense
                outlined
                type="date"
                :label="gettext('Since')"
                @update:model-value="loadTasks(true)"
              />
              <q-input
                v-model="until"
                class="col-12 col-md-3 u-dense"
                dense
                outlined
                type="date"
                :label="gettext('Until')"
                @update:model-value="loadTasks(true)"
              />
              <q-select
                v-model="statusfilter"
                class="col-12 col-md-3 u-dense"
                dense
                outlined
                multiple
                emit-value
                map-options
                options-dense
                :label="gettext('Task Result')"
                :options="statusOptions"
                @update:model-value="loadTasks(true)"
              />
              <q-select
                v-model="typefilter"
                class="col-12 col-md-3 u-dense"
                dense
                outlined
                multiple
                emit-value
                map-options
                options-dense
                :label="gettext('Task Type')"
                :options="taskTypes"
                @update:model-value="loadTasks(true)"
              />
              <q-input
                v-model="userfilter"
                class="col-12 col-md-3 u-dense"
                dense
                outlined
                :label="gettext('User name')"
                @update:model-value="loadTasks(true)"
              />
              <q-input
                v-model="vmidfilter"
                class="col-12 col-md-3 u-dense"
                dense
                outlined
                type="number"
                label="CT/VM ID"
                @update:model-value="loadTasks(true)"
              /></div></q-td
        ></q-tr>
      </template>
      <template #body-cell-status="props"
        ><q-td :props="props"
          ><q-badge :color="statusClass(props.value)" :label="props.value || '-'" /></q-td
      ></template>
    </q-table>
    <TaskOutputDialog
      v-model="taskDialogVisible"
      :node="node"
      :upid="selectedTask?.upid || ''"
      :title="taskTitle"
    />
  </section>
</template>

<style scoped>
.node-task-history {
  min-height: 420px;
}
</style>
