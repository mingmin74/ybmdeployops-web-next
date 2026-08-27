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
  { name: 'actions', label: '', align: 'right', field: () => '', sortable: false },
];

async function reload() {
  const response = await getTaskLogs();
  rows.value = [...(response.data || [])].sort(
    (left, right) => Number(right.starttime || 0) - Number(left.starttime || 0)
  );
}

function openTask(row: PveRecord) {
  taskParams.value = {
    node: textValue(row.node),
    upid: textValue(row.upid),
    title: formatTaskDescription(row.type, row.id),
  };
  taskDialog.value = true;
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
  <q-table
    flat
    row-key="upid"
    table-header-class="u-table-header"
    class="overlay-log-table"
    :rows="rows"
    :columns="columns"
    :pagination="{ rowsPerPage: 0 }"
    :rows-per-page-options="[0]"
    hide-bottom
    :loading="loading"
    :no-data-label="gettext('no record can be found')"
  >
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
          @click.stop="openTask(scope.row)"
          @keyup.enter.stop="openTask(scope.row)"
        />
      </q-td>
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
</template>

<style scoped>
.overlay-log-table {
  height: 100%;
  min-height: 0;
}

.overlay-log-table :deep(.q-table__middle) {
  min-height: 0;
  flex: 1 1 0;
  overflow: auto;
}

.overlay-log-table :deep(.q-table__middle table) {
  border-collapse: separate;
  border-spacing: 0;
}

.overlay-log-table :deep(thead tr th) {
  position: sticky;
  z-index: 1;
  top: 0;
  background: #f2f5fc;
}
</style>
