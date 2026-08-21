<script setup lang="ts">
import type { QTableColumn } from 'quasar';
import { Dialog } from 'quasar';
import { computed, shallowRef } from 'vue';
import TaskOutputDialog from '@/components/TaskOutputDialog.vue';
import UWindow from '@/components/UWindow.vue';
import NodeDiskTablePage from '@/components/NodeDiskTablePage.vue';
import { getNodeDiskSmart, getNodeDisks, initializeNodeDiskGpt, wipeNodeDisk, type PveRecord } from '@/api/resources';
import { gettext } from '@/locale';
import { formatBytes } from '@/utils/format';

const props = defineProps<{
  embedded?: boolean;
  node?: string;
}>();
const table = shallowRef<InstanceType<typeof NodeDiskTablePage>>();
const smartVisible = shallowRef(false);
const smartLoading = shallowRef(false);
const smartValues = shallowRef<PveRecord>({});
const taskVisible = shallowRef(false);
const taskUpid = shallowRef('');
const taskTitle = shallowRef('');
const actions = computed(() => [
  { name: 'smart', label: gettext('Show S.M.A.R.T. values'), requiresSelection: true },
  { name: 'gpt', label: gettext('Initialize Disk with GPT'), requiresSelection: true },
  { name: 'wipe', label: gettext('Wipe Disk'), color: 'negative', requiresSelection: true },
]);

const columns: QTableColumn<PveRecord>[] = [
  { name: 'devpath', label: gettext('Device'), field: 'devpath', align: 'left', sortable: true },
  { name: 'type', label: gettext('Type'), field: (row) => diskType(row['disk-type']), align: 'left', sortable: true },
  { name: 'used', label: gettext('Purpose'), field: (row) => diskUsage(row.used), align: 'left', sortable: true },
  {
    name: 'size',
    label: gettext('Size'),
    field: (row) => formatBytes(row.size),
    align: 'left',
    sortable: true,
  },
  { name: 'gpt', label: 'GPT', field: (row) => Boolean(row.gpt) ? gettext('Yes') : gettext('No'), align: 'left', sortable: true },
  { name: 'model', label: gettext('Model'), field: 'model', align: 'left', sortable: true },
  { name: 'serial', label: gettext('Serial'), field: 'serial', align: 'left', sortable: true },
  { name: 'status', label: 'S.M.A.R.T', field: 'status', align: 'left', sortable: true },
  { name: 'wearout', label: gettext('Wearout'), field: (row) => Number.isFinite(Number(row.wearout)) ? `${100 - Number(row.wearout)}%` : 'N/A', align: 'left', sortable: true },
];

function diskType(value: unknown) {
  return ({ ssd: 'SSD', hdd: gettext('Hard Disk'), usb: 'USB' } as Record<string, string>)[String(value)] || String(value || '-');
}

function diskUsage(value: unknown) {
  return ({ bios: gettext('BIOS boot'), zfsreserved: gettext('ZFS reserved'), efi: 'EFI', lvm: 'LVM', zfs: 'ZFS' } as Record<string, string>)[String(value)] || String(value || '-');
}

async function loadRows(node: string) {
  const response = await getNodeDisks(node);
  const normalize = (items: PveRecord[], prefix = ''): PveRecord[] => items.map((item, index) => ({
    ...item,
    node,
    devpath: item.devpath || item.path || item.device || `${node}-${prefix}${index}`,
    children: Array.isArray(item.children) ? normalize(item.children as PveRecord[], `${prefix}${index}-`) : [],
  }));
  return normalize(response.data || []);
}

function diskName(row?: PveRecord) { return String(row?.devpath || row?.name || row?.device || ''); }
function openTask(upid: unknown, title: string) {
  taskUpid.value = String(upid || ''); taskTitle.value = title;
  taskVisible.value = taskUpid.value.startsWith('UPID:');
  if (!taskVisible.value) void table.value?.reload();
}
async function showSmart(row?: PveRecord) {
  const disk = diskName(row); if (!props.node || !disk) return;
  smartVisible.value = true; smartLoading.value = true;
  try { smartValues.value = (await getNodeDiskSmart(props.node, disk)).data || {}; }
  finally { smartLoading.value = false; }
}
function initializeGpt(row?: PveRecord) {
  const disk = diskName(row); if (!props.node || !disk || String(row?.used) !== 'unused') return;
  Dialog.create({ title: gettext('Initialize Disk with GPT'), message: `${gettext('Initialize Disk with GPT')}: ${disk}`, cancel: true, persistent: true }).onOk(() => void initializeNodeDiskGpt(props.node!, disk).then((result) => openTask(result.data, gettext('Initialize Disk with GPT'))));
}
function wipe(row?: PveRecord) {
  const disk = diskName(row); if (!props.node || !disk || String(row?.used) !== 'unused') return;
  Dialog.create({ title: gettext('Wipe Disk'), message: `${gettext('All data on the device will be lost!')}<br><br>${disk}<br>${gettext('Usage')}: ${diskUsage(row?.used)}<br>${gettext('Size')}: ${formatBytes(row?.size)}<br>${gettext('Serial')}: ${row?.serial || '-'}`, html: true, cancel: true, persistent: true }).onOk(() => void wipeNodeDisk(props.node!, disk).then((result) => openTask(result.data, gettext('Wipe Disk'))));
}
function handleAction(name: string, row?: PveRecord) {
  if (name === 'smart') void showSmart(row);
  else if (name === 'gpt') initializeGpt(row);
  else if (name === 'wipe') wipe(row);
}
</script>

<template>
  <NodeDiskTablePage
    ref="table"
    :columns="columns"
    :load-rows="loadRows"
    row-key="devpath"
    :embedded="embedded"
    :node="node"
    tree
    :actions="actions"
    @action="handleAction"
    @row-dblclick="showSmart"
  />
  <q-dialog v-model="smartVisible" persistent transition-show="scale" transition-hide="scale">
    <UWindow :title="gettext('S.M.A.R.T. values')" width="620px" :loading="smartLoading">
      <q-list dense separator class="q-pa-sm">
        <q-item v-for="(value, key) in smartValues" :key="String(key)"><q-item-section>{{ key }}</q-item-section><q-item-section side>{{ value }}</q-item-section></q-item>
        <q-item v-if="!smartLoading && !Object.keys(smartValues).length"><q-item-section>{{ gettext('no record can be found') }}</q-item-section></q-item>
      </q-list>
      <template #foot><q-btn v-close-popup no-caps outline size="12px" class="u-button" :label="gettext('Close')" /></template>
    </UWindow>
  </q-dialog>
  <TaskOutputDialog v-model="taskVisible" :node="node || ''" :upid="taskUpid" :title="taskTitle" @finished="table?.reload()" />
</template>
