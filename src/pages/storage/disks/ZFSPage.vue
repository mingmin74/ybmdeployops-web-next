<script setup lang="ts">
import type { QTableColumn } from 'quasar';
import { Notify } from 'quasar';
import { computed, shallowRef } from 'vue';
import TaskOutputDialog from '@/components/TaskOutputDialog.vue';
import UWindow from '@/components/UWindow.vue';
import NodeDiskTablePage from '@/components/NodeDiskTablePage.vue';
import NodeDiskFormDialog, { type NodeDiskFormField } from './NodeDiskFormDialog.vue';
import NodeDiskDestroyDialog from './NodeDiskDestroyDialog.vue';
import { createNodeZfs, deleteNodeZfs, getNodeUnusedDisks, getNodeZfs, getNodeZfsDetail, type PveRecord } from '@/api/resources';
import { gettext } from '@/locale';
import { textValue } from '@/utils/pveFormat';
import { formatBytes } from '@/utils/format';

const props = defineProps<{
  embedded?: boolean;
  node?: string;
}>();
const detailVisible = shallowRef(false);
const detailLoading = shallowRef(false);
const detail = shallowRef<PveRecord>({});
const createVisible = shallowRef(false); const saving = shallowRef(false); const taskVisible = shallowRef(false); const taskUpid = shallowRef('');
const destroyVisible = shallowRef(false); const destroying = shallowRef(false); const destroyPool = shallowRef('');
const table = shallowRef<InstanceType<typeof NodeDiskTablePage>>();
const diskOptions = shallowRef<Array<{ label: string; value: string }>>([]);
const actions = computed(() => [{ name: 'create', label: `${gettext('Create')}: ZFS` }, { name: 'detail', label: gettext('Detail'), requiresSelection: true }, { name: 'destroy', label: gettext('Destroy'), color: 'negative', requiresSelection: true }]);
const fields = computed<NodeDiskFormField[]>(() => [
  { name: 'name', label: gettext('Name'), required: true }, { name: 'devices', label: gettext('Disk'), type: 'select', options: diskOptions.value, multiple: true, required: true },
  { name: 'raidlevel', label: gettext('RAID Level'), type: 'select', required: true, options: [{ label: 'Single Disk', value: 'single' }, { label: 'Mirror', value: 'mirror' }, { label: 'RAID10', value: 'raid10' }, { label: 'RAIDZ', value: 'raidz' }, { label: 'RAIDZ2', value: 'raidz2' }, { label: 'RAIDZ3', value: 'raidz3' }, { label: 'dRAID', value: 'draid' }, { label: 'dRAID2', value: 'draid2' }, { label: 'dRAID3', value: 'draid3' }] },
  { name: 'compression', label: gettext('Compression'), type: 'select', required: true, options: [{ label: 'on', value: 'on' }, { label: 'off', value: 'off' }, { label: 'gzip', value: 'gzip' }, { label: 'lz4', value: 'lz4' }, { label: 'lzjb', value: 'lzjb' }, { label: 'zle', value: 'zle' }, { label: 'zstd', value: 'zstd' }] }, { name: 'ashift', label: 'ashift', type: 'number', required: true },
  { name: 'draidData', label: gettext('Data Devs'), type: 'number', required: true, visible: (values) => textValue(values.raidlevel).startsWith('draid') }, { name: 'draidSpares', label: gettext('Spares'), type: 'number', required: true, visible: (values) => textValue(values.raidlevel).startsWith('draid') }, { name: 'add_storage', label: gettext('Add as storage'), type: 'checkbox' },
]);

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
  { name: 'frag', label: gettext('Fragmentation'), field: (row) => row.frag === undefined ? '-' : `${textValue(row.frag)}%`, align: 'left', sortable: true },
  { name: 'health', label: gettext('Status'), field: (row) => textValue(row.health, '-').toUpperCase(), align: 'left', sortable: true },
];

async function loadRows(node: string) {
  const response = await getNodeZfs(node);
  return (response.data || []).map((item, index) => ({
    ...item,
    node,
    name: item.name || `${node}-${index}`,
  }));
}

async function showDetail(row?: PveRecord) {
  const pool = textValue(row?.name); if (!props.node || !pool) return;
  detailVisible.value = true; detailLoading.value = true;
  try { detail.value = (await getNodeZfsDetail(props.node, pool)).data || {}; }
  finally { detailLoading.value = false; }
}
function openTask(upid: unknown) { taskUpid.value = textValue(upid); taskVisible.value = taskUpid.value.startsWith('UPID:'); if (!taskVisible.value) void table.value?.reload(); }
function validPoolName(value: unknown) { const name = textValue(value); return name.length <= 128 && !/^(mirror|raidz|draid|spare)/i.test(name) && name.toLowerCase() !== 'log' && /^[a-zA-Z][a-zA-Z0-9\-_.]*$/.test(name); }
async function create(values: Record<string, unknown>) { if (!props.node) return; const ashift = Number(values.ashift); const draid = textValue(values.raidlevel).startsWith('draid'); const data = Number(values.draidData); const spares = Number(values.draidSpares); const devices = Array.isArray(values.devices) ? values.devices : []; const raid = textValue(values.raidlevel); const minimumDisks: Record<string, number> = { mirror: 2, raid10: 4, raidz: 3, raidz2: 6, raidz3: 7 }; const invalidCount = (minimumDisks[raid] && devices.length < minimumDisks[raid]) || (raid === 'raid10' && devices.length % 2 !== 0); if (!validPoolName(values.name) || !Number.isInteger(ashift) || ashift < 9 || ashift > 16 || !devices.length || invalidCount || (draid && (!Number.isInteger(data) || data < 1 || !Number.isInteger(spares) || spares < 0))) { Notify.create({ type: 'negative', message: gettext('Invalid ZFS configuration') }); return; } const payload = { ...values }; if (draid) payload['draid-config'] = `data=${data},spares=${spares}`; delete payload.draidData; delete payload.draidSpares; saving.value = true; try { const result = await createNodeZfs(props.node, payload); createVisible.value = false; openTask(result.data); } finally { saving.value = false; } }
function destroy(row?: PveRecord) { destroyPool.value = textValue(row?.name); destroyVisible.value = Boolean(props.node && destroyPool.value); }
async function confirmDestroy(params: PveRecord) { if (!props.node || !destroyPool.value) return; destroying.value = true; try { const result = await deleteNodeZfs(props.node, destroyPool.value, params); destroyVisible.value = false; openTask(result.data); } finally { destroying.value = false; } }
async function action(name: string, row?: PveRecord) { if (name === 'create' && props.node) { const result = await getNodeUnusedDisks(props.node); diskOptions.value = (result.data || []).map((disk) => ({ label: String(disk.devpath || disk.name), value: String(disk.devpath || disk.name) })); createVisible.value = true; } else if (name === 'detail') void showDetail(row); else if (name === 'destroy') destroy(row); }
function healthClass(value: unknown) { const health = textValue(value).toUpperCase(); return health === 'ONLINE' ? 'good' : health === 'DEGRADED' ? 'warning' : health === 'FAULTED' || health === 'UNAVAIL' ? 'critical' : 'faded'; }
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
    @action="action"
    @row-dblclick="showDetail"
  ><template #body-cell-health="scope"><q-td :props="scope"><span :class="healthClass(scope.value)">{{ scope.value }}</span></q-td></template></NodeDiskTablePage>
  <q-dialog v-model="detailVisible" persistent transition-show="scale" transition-hide="scale">
    <UWindow :title="gettext('ZFS Status')" width="760px" :loading="detailLoading">
      <q-list dense separator class="q-pa-sm">
        <q-item v-for="(value, key) in detail" :key="String(key)"><q-item-section>{{ key }}</q-item-section><q-item-section side class="zfs-detail-value">{{ typeof value === 'object' ? JSON.stringify(value) : value }}</q-item-section></q-item>
        <q-item v-if="!detailLoading && !Object.keys(detail).length"><q-item-section>{{ gettext('no record can be found') }}</q-item-section></q-item>
      </q-list>
      <template #foot><q-btn v-close-popup no-caps outline size="12px" class="u-button" :label="gettext('Close')" /></template>
    </UWindow>
  </q-dialog>
  <NodeDiskFormDialog v-model="createVisible" :title="`${gettext('Create')}: ZFS`" :fields="fields" :defaults="{ raidlevel: 'single', compression: 'on', ashift: '12', add_storage: true }" :loading="saving" @submit="create" />
  <NodeDiskDestroyDialog v-model="destroyVisible" :item="destroyPool" :loading="destroying" @submit="confirmDestroy" />
  <TaskOutputDialog v-model="taskVisible" :node="node || ''" :upid="taskUpid" :title="gettext('Create')" @finished="table?.reload()" />
</template>

<style scoped>
.zfs-detail-value { max-width: 520px; overflow-wrap: anywhere; white-space: pre-wrap; }
</style>
