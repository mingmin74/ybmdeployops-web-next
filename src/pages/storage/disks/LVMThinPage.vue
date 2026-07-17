<script setup lang="ts">
import type { QTableColumn } from 'quasar';
import NodeDiskTablePage from '@/components/NodeDiskTablePage.vue';
import { getNodeLvmThin, type PveRecord } from '@/api/resources';
import { gettext } from '@/locale';
import { formatBytes } from '@/utils/format';

defineProps<{
  embedded?: boolean;
}>();

const columns: QTableColumn<PveRecord>[] = [
  { name: 'lv', label: gettext('Name'), field: 'lv', align: 'left', sortable: true },
  { name: 'node', label: gettext('Node'), field: 'node', align: 'left', sortable: true },
  { name: 'usage', label: gettext('Usage'), field: 'usage', align: 'left', sortable: true },
  {
    name: 'lv_size',
    label: gettext('Size'),
    field: (row) => formatBytes(row.lv_size),
    align: 'left',
    sortable: true,
  },
  {
    name: 'used',
    label: gettext('Used'),
    field: (row) => formatBytes(row.used),
    align: 'left',
    sortable: true,
  },
  {
    name: 'metadatausage',
    label: gettext('Metadata Usage'),
    field: 'metadatausage',
    align: 'left',
    sortable: true,
  },
  {
    name: 'metadata_size',
    label: gettext('Metadata Size'),
    field: (row) => formatBytes(row.metadata_size),
    align: 'left',
    sortable: true,
  },
  {
    name: 'metadata_used',
    label: gettext('Metadata Used'),
    field: (row) => formatBytes(row.metadata_used),
    align: 'left',
    sortable: true,
  },
];

async function loadRows(node: string) {
  const response = await getNodeLvmThin(node);
  return (response.data || []).map((item, index) => ({
    ...item,
    node,
    lv: item.lv || `${node}-${index}`,
  }));
}
</script>

<template>
  <NodeDiskTablePage :columns="columns" :load-rows="loadRows" row-key="lv" :embedded="embedded" />
</template>
