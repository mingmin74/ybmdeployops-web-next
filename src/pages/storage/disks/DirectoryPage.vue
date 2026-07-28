<script setup lang="ts">
import type { QTableColumn } from 'quasar';
import NodeDiskTablePage from '@/components/NodeDiskTablePage.vue';
import { getNodeDirectories, type PveRecord } from '@/api/resources';
import { gettext } from '@/locale';

defineProps<{
  embedded?: boolean;
  node?: string;
}>();

const columns: QTableColumn<PveRecord>[] = [
  { name: 'path', label: gettext('Path'), field: 'path', align: 'left', sortable: true },
  { name: 'device', label: gettext('Device'), field: 'device', align: 'left', sortable: true },
  { name: 'type', label: gettext('Type'), field: 'type', align: 'left', sortable: true },
  { name: 'options', label: gettext('Options'), field: 'options', align: 'left' },
];

async function loadRows(node: string) {
  const response = await getNodeDirectories(node);
  return (response.data || []).map((item, index) => ({
    ...item,
    node,
    path: item.path || `${node}-${index}`,
  }));
}
</script>

<template>
  <NodeDiskTablePage
    :columns="columns"
    :load-rows="loadRows"
    row-key="path"
    :embedded="embedded"
    :node="node"
  />
</template>
