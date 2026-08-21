<script setup lang="ts">
import type { QTableColumn } from 'quasar';
import { computed, shallowRef } from 'vue';
import TaskOutputDialog from '@/components/TaskOutputDialog.vue';
import NodeDiskTablePage from '@/components/NodeDiskTablePage.vue';
import NodeDiskFormDialog, { type NodeDiskFormField } from './NodeDiskFormDialog.vue';
import NodeDiskDestroyDialog from './NodeDiskDestroyDialog.vue';
import { createNodeDirectory, deleteNodeDirectory, getNodeDirectories, getNodeUnusedDisks, type PveRecord } from '@/api/resources';
import { gettext } from '@/locale';

const props = defineProps<{
  embedded?: boolean;
  node?: string;
}>();
const table = shallowRef<InstanceType<typeof NodeDiskTablePage>>();
const createVisible = shallowRef(false); const saving = shallowRef(false);
const taskVisible = shallowRef(false); const taskUpid = shallowRef('');
const destroyVisible = shallowRef(false); const destroying = shallowRef(false); const destroyName = shallowRef('');
const diskOptions = shallowRef<Array<{ label: string; value: string }>>([]);
const actions = computed(() => [{ name: 'create', label: `${gettext('Create')}: ${gettext('Directory')}` }, { name: 'destroy', label: gettext('Destroy'), color: 'negative', requiresSelection: true }]);
const fields = computed<NodeDiskFormField[]>(() => [
  { name: 'device', label: gettext('Disk'), type: 'select', options: diskOptions.value, required: true },
  { name: 'filesystem', label: gettext('Filesystem'), type: 'select', required: true, options: [{ label: 'ext4', value: 'ext4' }, { label: 'xfs', value: 'xfs' }] },
  { name: 'name', label: gettext('Name'), required: true }, { name: 'add_storage', label: gettext('Add as storage'), type: 'checkbox' },
]);

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
function openTask(upid: unknown) { taskUpid.value = String(upid || ''); taskVisible.value = taskUpid.value.startsWith('UPID:'); if (!taskVisible.value) void table.value?.reload(); }
async function create(values: Record<string, unknown>) { if (!props.node) return; saving.value = true; try { const result = await createNodeDirectory(props.node, values); createVisible.value = false; openTask(result.data); } finally { saving.value = false; } }
function destroy(row?: PveRecord) { destroyName.value = String(row?.path || ''); destroyVisible.value = Boolean(props.node && destroyName.value); }
async function confirmDestroy(params: PveRecord) { if (!props.node || !destroyName.value) return; destroying.value = true; try { const result = await deleteNodeDirectory(props.node, destroyName.value, params); destroyVisible.value = false; openTask(result.data); } finally { destroying.value = false; } }
async function action(name: string, row?: PveRecord) { if (name === 'create' && props.node) { const result = await getNodeUnusedDisks(props.node); diskOptions.value = (result.data || []).map((disk) => ({ label: String(disk.devpath || disk.name), value: String(disk.devpath || disk.name) })); createVisible.value = true; } else if (name === 'destroy') destroy(row); }
</script>

<template>
  <NodeDiskTablePage
    ref="table"
    :columns="columns"
    :load-rows="loadRows"
    row-key="path"
    :embedded="embedded"
    :node="node"
    :actions="actions"
    @action="action"
  />
  <NodeDiskFormDialog v-model="createVisible" :title="`${gettext('Create')}: ${gettext('Directory')}`" :fields="fields" :defaults="{ filesystem: 'ext4', add_storage: true }" :loading="saving" @submit="create" />
  <NodeDiskDestroyDialog v-model="destroyVisible" :item="destroyName" :loading="destroying" @submit="confirmDestroy" />
  <TaskOutputDialog v-model="taskVisible" :node="node || ''" :upid="taskUpid" :title="gettext('Create')" @finished="table?.reload()" />
</template>
