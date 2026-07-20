<script setup lang="ts">
import type { QTableColumn } from 'quasar';
import { computed, onMounted, ref, shallowRef } from 'vue';
import type { PveRecord } from '@/api/resources';
import { getIpamsPveStatus } from '@/api/sdn';
import { gettext } from '@/locale';
import { textValue } from '@/utils/pveFormat';

const loading = ref(false);
const selectedKey = ref('');
const rows = shallowRef<PveRecord[]>([]);

const treeNodes = computed(() =>
  rows.value.map((item) => {
    const node: { id: string; label: string; children?: { id: string; label: string }[] } = {
      id: textValue(item.id || item.name || item.vnet || item.subnet),
      label: textValue(item.name || item.vnet || item.subnet || item.id || 'IPAM'),
    };

    if (Array.isArray(item.children)) {
      node.children = (item.children as PveRecord[]).map((child) => ({
        id: textValue(child.id || child.name || child.ip || child.mac),
        label: textValue(child.name || child.ip || child.mac || child.id),
      }));
    }

    return node;
  }),
);

const flatRows = computed(() => {
  const result: PveRecord[] = [];
  rows.value.forEach((item) => {
    result.push(item);
    if (Array.isArray(item.children)) result.push(...(item.children as PveRecord[]));
  });
  return result;
});

const visibleRows = computed(() => {
  if (!selectedKey.value) return flatRows.value;
  return flatRows.value.filter((item) => textValue(item.id || item.name || item.vnet || item.subnet || item.ip || item.mac) === selectedKey.value);
});

const columns: QTableColumn<PveRecord>[] = [
  { name: 'name', required: true, label: gettext('Name'), align: 'left', field: (row) => row.name || row.vmid || row.vnet || '-', sortable: true },
  { name: 'ip', label: 'IP Address', align: 'left', field: (row) => row.ip || row.address || '-', sortable: true },
  { name: 'mac', label: 'MAC', align: 'left', field: (row) => row.mac || '-', sortable: true },
  { name: 'gateway', label: gettext('Gateway'), align: 'left', field: (row) => row.gateway || '-', sortable: true },
];

async function refreshData() {
  loading.value = true;
  try {
    const response = await getIpamsPveStatus();
    rows.value = response.data || [];
  } finally {
    loading.value = false;
  }
}

onMounted(refreshData);
</script>

<template>
  <div class="q-ma-md row no-wrap sdn-ipam">
    <div class="sdn-tree bg-white q-pa-sm">
      <q-tree v-model:selected="selectedKey" :nodes="treeNodes" node-key="id" selected-color="primary" default-expand-all />
    </div>
    <div class="col q-ml-md bg-white">
      <q-table flat row-key="id" table-header-class="u-table-header" :rows="visibleRows" :columns="columns" :loading="loading" :pagination="{ page: 1, rowsPerPage: 10 }" :rows-per-page-options="[10]" :no-data-label="gettext('no record can be found')">
        <template #top><q-btn no-caps outline size="12px" color="primary" class="u-button" :label="gettext('Refresh')" @click="refreshData" /></template>
      </q-table>
    </div>
  </div>
</template>

<style scoped>
.sdn-ipam {
  min-height: calc(100vh - 96px);
}

.sdn-tree {
  width: 260px;
  min-width: 260px;
  border-right: 1px solid #eeeeee;
}
</style>
