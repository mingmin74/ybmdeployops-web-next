<script setup lang="ts">
import type { QTableColumn } from 'quasar';
import { onBeforeUnmount, onMounted, ref, shallowRef } from 'vue';
import TaskOutputDialog from '@/components/TaskOutputDialog.vue';
import { getTaskLogs } from '@/api/maintenance';
import type { PveRecord } from '@/api/resources';
import { gettext } from '@/locale';
import {
  formatTaskDescription,
  formatTaskStatus,
  taskStatusColor,
  textValue,
  timestampToTime,
} from '@/utils/pveFormat';

const loading = ref(false);
const filter = ref('');
const selected = ref<PveRecord[]>([]);
const rows = shallowRef<PveRecord[]>([]);
const taskDialog = ref(false);
const taskParams = ref({ node: '', upid: '', title: '' });
let refreshTimer: ReturnType<typeof setInterval> | undefined;

const columns: QTableColumn<PveRecord>[] = [
  { name: 'index', label: '#', align: 'left', field: 'upid', sortable: false },
  {
    name: 'starttime',
    label: gettext('Start Time'),
    align: 'left',
    field: (row) => timestampToTime(Number(row.starttime) * 1000),
    sortable: true,
  },
  {
    name: 'endtime',
    label: gettext('End Time'),
    align: 'left',
    field: (row) => timestampToTime(Number(row.endtime) * 1000),
    sortable: true,
  },
  { name: 'node', label: gettext('Node Name'), align: 'left', field: 'node', sortable: true },
  { name: 'user', label: gettext('Username'), align: 'left', field: 'user', sortable: true },
  {
    name: 'desc',
    label: gettext('Description'),
    align: 'left',
    field: (row) => formatTaskDescription(row.type, row.id),
    sortable: true,
  },
  { name: 'status', label: gettext('Status'), align: 'left', field: 'status', sortable: true },
];

async function reload() {
  const response = await getTaskLogs();
  rows.value = [...(response.data || [])].sort(
    (left, right) => Number(right.starttime || 0) - Number(left.starttime || 0)
  );
}

function rowClick(_: Event, row: PveRecord) {
  selected.value = selected.value[0] === row ? [] : [row];
}

function openTask() {
  const row = selected.value[0];
  if (!row) return;
  taskParams.value = {
    node: textValue(row.node),
    upid: textValue(row.upid),
    title: formatTaskDescription(row.type, row.id),
  };
  taskDialog.value = true;
}

function exportData() {
  const data = rows.value
    .map((item) =>
      [
        `[${timestampToTime(Number(item.starttime) * 1000)} - ${timestampToTime(Number(item.endtime) * 1000)}]`,
        `[${textValue(item.node)}]`,
        `[${textValue(item.user)}]`,
        `[${formatTaskDescription(item.type, item.id)}]`,
        textValue(item.status),
      ].join('')
    )
    .join('\n');
  const blob = new Blob([data], { type: 'text/plain;charset=utf-8' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = 'operation-logs.txt';
  link.click();
  URL.revokeObjectURL(link.href);
}

onMounted(() => {
  loading.value = true;
  void reload().finally(() => {
    loading.value = false;
  });
  refreshTimer = setInterval(() => {
    void reload();
  }, 7000);
});

onBeforeUnmount(() => {
  if (refreshTimer) clearInterval(refreshTimer);
});
</script>

<template>
  <div class="row column q-px-md q-py-sm">
    <q-table
      flat
      row-key="upid"
      table-header-class="u-table-header"
      selection="single"
      :rows="rows"
      :columns="columns"
      :selected="selected"
      :filter="filter"
      :pagination="{ page: 1, rowsPerPage: 10 }"
      :rows-per-page-options="[10]"
      :loading="loading"
      :no-data-label="gettext('no record can be found')"
      @row-click="rowClick"
      @update:selected="selected = [...$event]"
    >
      <template #top>
        <div class="q-gutter-sm">
          <q-btn
            no-caps
            outline
            size="12px"
            color="primary"
            class="u-button"
            :label="gettext('Export')"
            @click="exportData"
          />
          <q-btn
            no-caps
            outline
            size="12px"
            class="u-button"
            :color="selected.length !== 1 ? 'grey' : 'primary'"
            :disable="selected.length !== 1"
            :label="gettext('Viewer')"
            @click="openTask"
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
      <template #body-cell-status="scope">
        <q-td :props="scope">
          <q-spinner
            v-if="scope.row.pid && scope.row.type !== 'vncproxy'"
            size="18px"
          />
          <span
            v-else
            :class="taskStatusColor(scope.value)"
          >
            {{ formatTaskStatus(scope.value) }}
          </span>
        </q-td>
      </template>
      <template #body-cell-index="scope">
        <q-td :props="scope">{{ scope.rowIndex + 1 }}</q-td>
      </template>
      <template #no-data="{ message }">
        <div class="full-width row flex-center text-accent q-gutter-sm">
          <span class="text-grey-6">{{ message }}</span>
        </div>
      </template>
    </q-table>
    <TaskOutputDialog
      v-model="taskDialog"
      :node="taskParams.node"
      :upid="taskParams.upid"
      :title="taskParams.title"
    />
  </div>
</template>
