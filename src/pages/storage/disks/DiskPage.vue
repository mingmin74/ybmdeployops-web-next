<script setup lang="ts">
import type { QTableColumn } from 'quasar';
import NodeDiskTablePage from '@/components/NodeDiskTablePage.vue';
import { getNodeDisks, type PveRecord } from '@/api/resources';
import { gettext } from '@/locale';
import { formatBytes } from '@/utils/format';

defineProps<{
  embedded?: boolean;
  node?: string;
}>();

const columns: QTableColumn<PveRecord>[] = [
  { name: 'devpath', label: gettext('Device'), field: 'devpath', align: 'left', sortable: true },
  { name: 'type', label: gettext('Type'), field: 'type', align: 'left', sortable: true },
  { name: 'used', label: gettext('Purpose'), field: 'used', align: 'left', sortable: true },
  {
    name: 'size',
    label: gettext('Size'),
    field: (row) => formatBytes(row.size),
    align: 'left',
    sortable: true,
  },
  { name: 'gpt', label: 'GPT', field: 'gpt', align: 'left', sortable: true },
  { name: 'model', label: gettext('Model'), field: 'model', align: 'left', sortable: true },
  { name: 'serial', label: gettext('Serial'), field: 'serial', align: 'left', sortable: true },
  { name: 'health', label: 'S.M.A.R.T', field: 'health', align: 'left', sortable: true },
  { name: 'wearout', label: gettext('Wearout'), field: 'wearout', align: 'left', sortable: true },
];

async function loadRows(node: string) {
  const response = await getNodeDisks(node);
  return (response.data || []).map((item, index) => ({
    ...item,
    node,
    devpath: item.devpath || item.path || item.device || `${node}-${index}`,
  }));
}
</script>

<template>
  <NodeDiskTablePage
    :columns="columns"
    :load-rows="loadRows"
    row-key="devpath"
    :embedded="embedded"
    :node="node"
  />
</template>
