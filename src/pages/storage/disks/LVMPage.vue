<script setup lang="ts">
import type { QTableColumn } from 'quasar';
import NodeDiskTablePage from '@/components/NodeDiskTablePage.vue';
import { getNodeLvm, type PveRecord } from '@/api/resources';
import { gettext } from '@/locale';
import { formatBytes, formatPercent } from '@/utils/format';

defineProps<{
  embedded?: boolean;
}>();

const columns: QTableColumn<PveRecord>[] = [
  { name: 'name', label: gettext('Name'), field: 'name', align: 'left', sortable: true },
  { name: 'node', label: gettext('Node'), field: 'node', align: 'left' },
  {
    name: 'lvcount',
    label: gettext('Number of LVs'),
    field: 'lvcount',
    align: 'left',
    sortable: true,
  },
  {
    name: 'usage',
    label: gettext('Usage'),
    field: (row) => formatPercent(((Number(row.size) - Number(row.free)) / Number(row.size)) * 100),
    align: 'left',
    sortable: true,
  },
  {
    name: 'size',
    label: gettext('Size'),
    field: (row) => formatBytes(row.size),
    align: 'left',
    sortable: true,
  },
  {
    name: 'free',
    label: gettext('Free'),
    field: (row) => formatBytes(row.free),
    align: 'left',
    sortable: true,
  },
];

async function loadRows(node: string) {
  const response = await getNodeLvm(node);
  const data = Array.isArray(response.data) ? response.data : response.data?.children || [];
  return data.map((item, index) => ({ ...item, node, name: item.name || `${node}-${index}` }));
}
</script>

<template>
  <NodeDiskTablePage :columns="columns" :load-rows="loadRows" row-key="name" :embedded="embedded" />
</template>
