<script setup lang="ts">
import type { QTableColumn } from 'quasar';
import { onMounted, ref, shallowRef } from 'vue';
import { getClusterLogs } from '@/api/maintenance';
import type { PveRecord } from '@/api/resources';
import { gettext } from '@/locale';
import { severityColor, severityMap, timestampToTime } from '@/utils/pveFormat';

const loading = ref(false);
const rows = shallowRef<PveRecord[]>([]);

const columns: QTableColumn<PveRecord>[] = [
  { name: 'index', label: '#', align: 'left', field: 'pos' },
  {
    name: 'time',
    label: gettext('Time'),
    align: 'left',
    field: (row) => timestampToTime(Number(row.time) * 1000),
    sortable: true,
  },
  { name: 'node', label: gettext('Node'), align: 'left', field: 'node', sortable: true },
  { name: 'tag', label: gettext('Service'), align: 'left', field: 'tag', sortable: true },
  { name: 'pid', label: gettext('PID'), align: 'left', field: 'pid', sortable: true },
  { name: 'user', label: gettext('Username'), align: 'left', field: 'user', sortable: true },
  {
    name: 'pri',
    label: gettext('Severity'),
    align: 'left',
    field: (row) => Number(row.pri),
    sortable: true,
  },
  { name: 'msg', label: gettext('Message'), align: 'left', field: 'msg' },
];

async function reload() {
  loading.value = true;
  try {
    const response = await getClusterLogs();
    rows.value = [...(response.data || [])].sort(
      (left, right) => Number(right.time || 0) - Number(left.time || 0)
    );
  } finally {
    loading.value = false;
  }
}

onMounted(() => {
  void reload();
});
</script>

<template>
  <q-table
    flat
    row-key="pos"
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
    <template #body-cell-pri="scope">
      <q-td :props="scope">
        <q-badge
          :color="severityColor[Number(scope.value)] || 'grey'"
          :label="gettext(severityMap[Number(scope.value)] || String(scope.value))"
        />
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
