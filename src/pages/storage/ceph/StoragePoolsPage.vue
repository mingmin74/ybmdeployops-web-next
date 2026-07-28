<script setup lang="ts">
import type { QTableColumn } from 'quasar';
import { onMounted, ref, shallowRef } from 'vue';
import type { PveRecord } from '@/api/resources';
import { getCephPools } from '@/api/ceph';
import { gettext } from '@/locale';
import { formatBytes, usedPercent } from '@/utils/pveFormat';

const loading = ref(false);
const rows = shallowRef<PveRecord[]>([]);
const columns: QTableColumn<PveRecord>[] = [
  {
    name: 'pool_name',
    required: true,
    label: gettext('Name'),
    align: 'left',
    field: (row) => row.pool_name || row.name || '-',
    sortable: true,
  },
  {
    name: 'size',
    label: gettext('Size'),
    align: 'left',
    field: (row) => row.size || '-',
    sortable: true,
  },
  {
    name: 'min_size',
    label: gettext('Min Size'),
    align: 'left',
    field: (row) => row.min_size || '-',
    sortable: true,
  },
  { name: 'pg_num', label: 'PG', align: 'left', field: (row) => row.pg_num || '-', sortable: true },
  {
    name: 'used',
    label: gettext('Used'),
    align: 'left',
    field: (row) => formatBytes(row.bytes_used as number),
    sortable: true,
  },
  {
    name: 'usage',
    label: gettext('Usage'),
    align: 'left',
    field: (row) =>
      `${usedPercent(Number(row.bytes_used), Number(row.max_avail) + Number(row.bytes_used)).toFixed(2)}%`,
    sortable: true,
  },
];

async function refreshData() {
  loading.value = true;
  try {
    const response = await getCephPools();
    rows.value = response.data || [];
  } finally {
    loading.value = false;
  }
}

onMounted(refreshData);
</script>

<template>
  <q-table
    flat
    row-key="pool_name"
    table-header-class="u-table-header"
    :rows="rows"
    :columns="columns"
    :loading="loading"
    :pagination="{ page: 1, rowsPerPage: 10 }"
    :rows-per-page-options="[10]"
    :no-data-label="gettext('no record can be found')"
  >
    <template #top
      ><q-btn
        no-caps
        outline
        size="12px"
        color="primary"
        class="u-button"
        :label="gettext('Refresh')"
        @click="refreshData"
    /></template>
  </q-table>
</template>
