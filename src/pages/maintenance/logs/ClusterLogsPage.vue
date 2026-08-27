<script setup lang="ts">
import type { QTableColumn } from 'quasar';
import { onMounted, ref, shallowRef } from 'vue';
import { getClusterLogs } from '@/api/maintenance';
import type { PveRecord } from '@/api/resources';
import { gettext } from '@/locale';
import { severityColor, severityMap, textValue, timestampToTime } from '@/utils/pveFormat';

const loading = ref(false);
const filter = ref('');
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

function exportData() {
  const data = rows.value
    .map(
      (item) =>
        [
          timestampToTime(Number(item.time) * 1000),
          item.node,
          item.tag,
          item.pid,
          item.user,
          gettext(severityMap[Number(item.pri)] || textValue(item.pri)),
        ]
          .map((value) => `[${textValue(value)}]`)
          .join('') + textValue(item.msg)
    )
    .join('\n');
  const blob = new Blob([data], { type: 'text/plain;charset=utf-8' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = 'cluster-logs.txt';
  link.click();
  URL.revokeObjectURL(link.href);
}

onMounted(() => {
  void reload();
});
</script>

<template>
  <div class="row column q-px-md q-py-sm">
    <q-table
      flat
      row-key="pos"
      table-header-class="u-table-header"
      :rows="rows"
      :columns="columns"
      :filter="filter"
      :pagination="{ page: 1, rowsPerPage: 10 }"
      :rows-per-page-options="[10]"
      :loading="loading"
      :no-data-label="gettext('no record can be found')"
    >
      <template #top>
        <q-btn
          no-caps
          outline
          size="12px"
          color="primary"
          class="u-button"
          :label="gettext('Export')"
          @click="exportData"
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
      </template>
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
  </div>
</template>
