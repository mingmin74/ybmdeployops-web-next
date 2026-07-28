<script setup lang="ts">
import type { QTableColumn } from 'quasar';
import NodeDiskTablePage from '@/components/NodeDiskTablePage.vue';
import { getNodeZfs, type PveRecord } from '@/api/resources';
import { gettext } from '@/locale';
import { formatBytes } from '@/utils/format';

defineProps<{
  embedded?: boolean;
  node?: string;
}>();

const columns: QTableColumn<PveRecord>[] = [
  { name: 'name', label: gettext('Name'), field: 'name', align: 'left', sortable: true },
  { name: 'node', label: gettext('Node'), field: 'node', align: 'left', sortable: true },
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
  {
    name: 'alloc',
    label: gettext('Allocated'),
    field: (row) => formatBytes(row.alloc),
    align: 'left',
    sortable: true,
  },
  { name: 'frag', label: gettext('Fragmentation'), field: 'frag', align: 'left', sortable: true },
  { name: 'health', label: gettext('Status'), field: 'health', align: 'left', sortable: true },
];

async function loadRows(node: string) {
  const response = await getNodeZfs(node);
  return (response.data || []).map((item, index) => ({
    ...item,
    node,
    name: item.name || `${node}-${index}`,
  }));
}
</script>

<template>
  <NodeDiskTablePage
    :columns="columns"
    :load-rows="loadRows"
    row-key="name"
    :embedded="embedded"
    :node="node"
  />
</template>
