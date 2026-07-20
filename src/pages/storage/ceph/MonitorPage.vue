<script setup lang="ts">
import type { QTableColumn } from 'quasar';
import { onMounted, ref, shallowRef } from 'vue';
import type { PveRecord } from '@/api/resources';
import { getCephManagers, getCephMonitors, getCephOsds } from '@/api/ceph';
import { gettext } from '@/locale';

const loading = ref(false);
const mons = shallowRef<PveRecord[]>([]);
const mgrs = shallowRef<PveRecord[]>([]);
const osds = shallowRef<PveRecord[]>([]);
const columns: QTableColumn<PveRecord>[] = [
  { name: 'name', required: true, label: gettext('Name'), align: 'left', field: (row) => row.name || row.id || '-', sortable: true },
  { name: 'host', label: gettext('Host'), align: 'left', field: (row) => row.host || row.hostname || '-', sortable: true },
  { name: 'status', label: gettext('Status'), align: 'left', field: (row) => row.status || row.state || row.health || '-', sortable: true },
  { name: 'address', label: gettext('Address'), align: 'left', field: (row) => row.addr || row.address || '-', sortable: true },
];

async function refreshData() {
  loading.value = true;
  try {
    const [monResponse, mgrResponse, osdResponse] = await Promise.allSettled([getCephMonitors(), getCephManagers(), getCephOsds()]);
    if (monResponse.status === 'fulfilled') mons.value = monResponse.value.data || [];
    if (mgrResponse.status === 'fulfilled') mgrs.value = mgrResponse.value.data || [];
    if (osdResponse.status === 'fulfilled') osds.value = osdResponse.value.data || [];
  } finally {
    loading.value = false;
  }
}

onMounted(refreshData);
</script>

<template>
  <div class="column q-gutter-md">
    <q-btn no-caps outline size="12px" color="primary" class="u-button self-start" :loading="loading" :label="gettext('Refresh')" @click="refreshData" />
    <q-table flat row-key="name" table-header-class="u-table-header" :title="gettext('Monitor')" :rows="mons" :columns="columns" :loading="loading" :pagination="{ page: 1, rowsPerPage: 5 }" :rows-per-page-options="[5]" />
    <q-table flat row-key="name" table-header-class="u-table-header" :title="gettext('Manager')" :rows="mgrs" :columns="columns" :loading="loading" :pagination="{ page: 1, rowsPerPage: 5 }" :rows-per-page-options="[5]" />
    <q-table flat row-key="id" table-header-class="u-table-header" :title="gettext('OSDs')" :rows="osds" :columns="columns" :loading="loading" :pagination="{ page: 1, rowsPerPage: 8 }" :rows-per-page-options="[8]" />
  </div>
</template>
