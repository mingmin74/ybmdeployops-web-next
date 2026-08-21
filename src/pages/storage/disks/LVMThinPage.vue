<script setup lang="ts">
import type { QTableColumn } from 'quasar';
import { computed, shallowRef } from 'vue';
import TaskOutputDialog from '@/components/TaskOutputDialog.vue';
import NodeDiskTablePage from '@/components/NodeDiskTablePage.vue';
import NodeDiskFormDialog, { type NodeDiskFormField } from './NodeDiskFormDialog.vue';
import NodeDiskDestroyDialog from './NodeDiskDestroyDialog.vue';
import { createNodeLvmThin, deleteNodeLvmThin, getNodeDisks, getNodeLvmThin, type PveRecord } from '@/api/resources';
import { gettext } from '@/locale';
import { formatBytes, formatPercent } from '@/utils/format';

const props = defineProps<{
  embedded?: boolean;
  node?: string;
}>();
const table = shallowRef<InstanceType<typeof NodeDiskTablePage>>(); const createVisible = shallowRef(false); const saving = shallowRef(false); const taskVisible = shallowRef(false); const taskUpid = shallowRef('');
const destroyVisible = shallowRef(false); const destroying = shallowRef(false); const destroyPool = shallowRef(''); const destroyVg = shallowRef('');
const diskOptions = shallowRef<Array<{ label: string; value: string }>>([]);
const actions = computed(() => [{ name: 'create', label: `${gettext('Create')}: ${gettext('Thinpool')}` }, { name: 'destroy', label: gettext('Destroy'), color: 'negative', requiresSelection: true }]);
const fields = computed<NodeDiskFormField[]>(() => [{ name: 'device', label: gettext('Disk'), type: 'select', options: diskOptions.value, required: true }, { name: 'name', label: gettext('Name'), required: true }, { name: 'add_storage', label: gettext('Add as storage'), type: 'checkbox' }]);

const columns: QTableColumn<PveRecord>[] = [
  { name: 'lv', label: gettext('Name'), field: 'lv', align: 'left', sortable: true },
  { name: 'vg', label: gettext('Volume Group'), field: 'vg', align: 'left', sortable: true },
  { name: 'node', label: gettext('Node'), field: 'node', align: 'left', sortable: true },
  { name: 'usage', label: gettext('Usage'), field: (row) => formatPercent(Number(row.used) / Number(row.lv_size) * 100), align: 'left', sortable: true },
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
    name: 'metadata_usage',
    label: gettext('Metadata Usage'),
    field: (row) => formatPercent(Number(row.metadata_used) / Number(row.metadata_size) * 100),
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
function openTask(upid: unknown) { taskUpid.value = String(upid || ''); taskVisible.value = taskUpid.value.startsWith('UPID:'); if (!taskVisible.value) void table.value?.reload(); }
async function create(values: Record<string, unknown>) { if (!props.node) return; saving.value = true; try { const result = await createNodeLvmThin(props.node, values); createVisible.value = false; openTask(result.data); } finally { saving.value = false; } }
function destroy(row?: PveRecord) { destroyPool.value = String(row?.lv || ''); destroyVg.value = String(row?.vg || row?.['volume-group'] || ''); destroyVisible.value = Boolean(props.node && destroyPool.value && destroyVg.value); }
async function confirmDestroy(params: PveRecord) { if (!props.node || !destroyPool.value || !destroyVg.value) return; destroying.value = true; try { const result = await deleteNodeLvmThin(props.node, destroyVg.value, destroyPool.value, params); destroyVisible.value = false; openTask(result.data); } finally { destroying.value = false; } }
async function action(name: string, row?: PveRecord) { if (name === 'create' && props.node) { const result = await getNodeDisks(props.node); diskOptions.value = (result.data || []).filter((disk) => disk.used === 'unused').map((disk) => ({ label: String(disk.devpath || disk.name), value: String(disk.devpath || disk.name) })); createVisible.value = true; } else if (name === 'destroy') destroy(row); }
</script>

<template>
  <NodeDiskTablePage
    ref="table"
    :columns="columns"
    :load-rows="loadRows"
    row-key="lv"
    :embedded="embedded"
    :node="node"
    :actions="actions"
    @action="action"
  />
  <NodeDiskFormDialog v-model="createVisible" :title="`${gettext('Create')}: ${gettext('Thinpool')}`" :fields="fields" :defaults="{ add_storage: true }" :loading="saving" @submit="create" />
  <NodeDiskDestroyDialog v-model="destroyVisible" :item="`${destroyVg}/${destroyPool}`" :loading="destroying" @submit="confirmDestroy" />
  <TaskOutputDialog v-model="taskVisible" :node="node || ''" :upid="taskUpid" :title="gettext('Create')" @finished="table?.reload()" />
</template>
