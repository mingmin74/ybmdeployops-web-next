<script setup lang="ts">
import type { QTableColumn } from 'quasar';
import { computed, shallowRef } from 'vue';
import TaskOutputDialog from '@/components/TaskOutputDialog.vue';
import UsageProgress from '@/components/UsageProgress.vue';
import NodeDiskTablePage from '@/components/NodeDiskTablePage.vue';
import NodeDiskFormDialog, { type NodeDiskFormField } from './NodeDiskFormDialog.vue';
import NodeDiskDestroyDialog from './NodeDiskDestroyDialog.vue';
import { createNodeLvm, deleteNodeLvm, getNodeUnusedDisks, getNodeLvm, type PveRecord } from '@/api/resources';
import { gettext } from '@/locale';
import { textValue } from '@/utils/pveFormat';
import { formatBytes, usagePercent } from '@/utils/format';

const props = defineProps<{
  embedded?: boolean;
  node?: string;
}>();
const table = shallowRef<InstanceType<typeof NodeDiskTablePage>>(); const createVisible = shallowRef(false); const saving = shallowRef(false); const taskVisible = shallowRef(false); const taskUpid = shallowRef('');
const destroyVisible = shallowRef(false); const destroying = shallowRef(false); const destroyName = shallowRef('');
const diskOptions = shallowRef<Array<{ label: string; value: string }>>([]);
const actions = computed(() => [{ name: 'create', label: `${gettext('Create')}: ${gettext('Volume Group')}` }, { name: 'destroy', label: gettext('Destroy'), color: 'negative', requiresSelection: true }]);
const fields = computed<NodeDiskFormField[]>(() => [{ name: 'name', label: gettext('Name'), required: true }, { name: 'device', label: gettext('Disk'), type: 'select', options: diskOptions.value, required: true }, { name: 'add_storage', label: gettext('Add as storage'), type: 'checkbox' }]);

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
    field: (row) => usagePercent(Number(row.size) - Number(row.free), row.size),
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
  const normalize = (items: PveRecord[], prefix = ''): PveRecord[] => items.map((item, index) => ({ ...item, node, name: item.name || `${node}-${prefix}${index}`, children: Array.isArray(item.children) ? normalize(item.children as PveRecord[], `${prefix}${index}-`) : [] }));
  return normalize(data);
}
function openTask(upid: unknown) { taskUpid.value = textValue(upid); taskVisible.value = taskUpid.value.startsWith('UPID:'); if (!taskVisible.value) void table.value?.reload(); }
async function create(values: Record<string, unknown>) { if (!props.node) return; saving.value = true; try { const result = await createNodeLvm(props.node, values); createVisible.value = false; openTask(result.data); } finally { saving.value = false; } }
function destroy(row?: PveRecord) { destroyName.value = textValue(row?.name); destroyVisible.value = Boolean(props.node && destroyName.value); }
async function confirmDestroy(params: PveRecord) { if (!props.node || !destroyName.value) return; destroying.value = true; try { const result = await deleteNodeLvm(props.node, destroyName.value, params); destroyVisible.value = false; openTask(result.data); } finally { destroying.value = false; } }
async function action(name: string, row?: PveRecord) { if (name === 'create' && props.node) { const result = await getNodeUnusedDisks(props.node); diskOptions.value = (result.data || []).map((disk) => ({ label: String(disk.devpath || disk.name), value: String(disk.devpath || disk.name) })); createVisible.value = true; } else if (name === 'destroy') destroy(row); }
</script>

<template>
  <NodeDiskTablePage
    ref="table"
    :columns="columns"
    :load-rows="loadRows"
    row-key="name"
    :embedded="embedded"
    :node="node"
    :actions="actions"
    tree
    @action="action"
  >
    <template #body-cell-lvcount="scope"><q-td :props="scope">{{ Number(scope.row.__treeLevel || 0) ? '-' : scope.value }}</q-td></template>
    <template #body-cell-free="scope"><q-td :props="scope">{{ Number(scope.row.__treeLevel || 0) ? '-' : scope.value }}</q-td></template>
    <template #body-cell-usage="scope"><q-td :props="scope"><UsageProgress v-if="Number(scope.row.__treeLevel || 0) || scope.value !== '-'" :percent="Number(scope.value)" /><span v-else>-</span></q-td></template>
  </NodeDiskTablePage>
  <NodeDiskFormDialog v-model="createVisible" :title="`${gettext('Create')}: ${gettext('Volume Group')}`" :fields="fields" :defaults="{ add_storage: true }" :loading="saving" @submit="create" />
  <NodeDiskDestroyDialog v-model="destroyVisible" :item="destroyName" :loading="destroying" @submit="confirmDestroy" />
  <TaskOutputDialog v-model="taskVisible" :node="node || ''" :upid="taskUpid" :title="gettext('Create')" @finished="table?.reload()" />
</template>
