<script setup lang="ts">
import type { QTableColumn } from 'quasar';
import { Dialog } from 'quasar';
import { computed, shallowRef } from 'vue';
import TaskOutputDialog from '@/components/TaskOutputDialog.vue';
import NodeDiskTablePage from '@/components/NodeDiskTablePage.vue';
import DiskSmartDialog from './DiskSmartDialog.vue';
import DiskWipeDialog from './DiskWipeDialog.vue';
import { getNodeDiskSmart, getNodeDisks, initializeNodeDiskGpt, wipeNodeDisk, type PveRecord } from '@/api/resources';
import { gettext } from '@/locale';
import { formatBytes } from '@/utils/format';
import { textValue } from '@/utils/pveFormat';

const props = defineProps<{
  embedded?: boolean;
  node?: string;
}>();
const table = shallowRef<InstanceType<typeof NodeDiskTablePage>>();
const smartVisible = shallowRef(false);
const smartLoading = shallowRef(false);
const smartValues = shallowRef<PveRecord>({});
const smartDisk = shallowRef('');
const wipeVisible = shallowRef(false);
const wipeLoading = shallowRef(false);
const wipeTarget = shallowRef<PveRecord>({});
const taskVisible = shallowRef(false);
const taskUpid = shallowRef('');
const taskTitle = shallowRef('');
const actions = computed(() => [
  { name: 'smart', label: gettext('Show S.M.A.R.T. values'), requiresSelection: true, disable: (row?: PveRecord) => Boolean(row?.parent) },
  { name: 'gpt', label: gettext('Initialize Disk with GPT'), requiresSelection: true, disable: (row?: PveRecord) => Boolean(row?.parent || (row?.used && row.used !== 'unused')) },
  { name: 'wipe', label: gettext('Wipe Disk'), color: 'negative', requiresSelection: true, disable: (row?: PveRecord) => Boolean(row?.parent) },
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
  { name: 'gpt', label: 'GPT', field: (row) => row.gpt ? gettext('Yes') : gettext('No'), align: 'left', sortable: true },
  { name: 'model', label: gettext('Model'), field: 'model', align: 'left', sortable: true },
  { name: 'serial', label: gettext('Serial'), field: 'serial', align: 'left', sortable: true },
  { name: 'status', label: 'S.M.A.R.T', field: 'status', align: 'left', sortable: true },
  { name: 'wearout', label: gettext('Wearout'), field: (row) => Number.isFinite(Number(row.wearout)) ? `${100 - Number(row.wearout)}%` : 'N/A', align: 'left', sortable: true },
];

function diskType(value: unknown) {
  return ({ ssd: 'SSD', hdd: gettext('Hard Disk'), usb: 'USB' } as Record<string, string>)[String(value)] || textValue(value, '-');
}

function diskUsage(value: unknown) {
  return ({ bios: gettext('BIOS boot'), zfsreserved: gettext('ZFS reserved'), efi: 'EFI', lvm: 'LVM', zfs: 'ZFS' } as Record<string, string>)[String(value)] || textValue(value, '-');
}

async function loadRows(node: string) {
  const response = await getNodeDisks(node);
  const disks = new Map<string, PveRecord>();
  const records: PveRecord[] = (response.data || []).map((item, index) => ({ ...item, node, devpath: item.devpath || item.path || item.device || `${node}-${index}`, children: [] }));
  records.forEach((item) => { if (!item.parent) disks.set(String(item.devpath), item); });
  records.forEach((item) => {
    if (Array.isArray(item.partitions)) {
      item.children = (item.partitions as PveRecord[]).map((partition) => ({ ...partition, node, parent: item.devpath, 'disk-type': 'partition', used: partition.used === 'filesystem' ? partition.filesystem : partition.used, children: [] }));
    }
    if (item.parent) (disks.get(textValue(item.parent))?.children as PveRecord[] | undefined)?.push(item);
  });
  return [...disks.values()];
}

function diskName(row?: PveRecord) { return textValue(row?.devpath || row?.name || row?.device); }
function openTask(upid: unknown, title: string) {
  taskUpid.value = textValue(upid); taskTitle.value = title;
  taskVisible.value = taskUpid.value.startsWith('UPID:');
  if (!taskVisible.value) void table.value?.reload();
}
async function showSmart(row?: PveRecord) {
  const disk = diskName(row); if (!props.node || !disk) return;
  smartDisk.value = disk;
  smartVisible.value = true; smartLoading.value = true;
  try { smartValues.value = (await getNodeDiskSmart(props.node, disk)).data || {}; }
  finally { smartLoading.value = false; }
}
function initializeGpt(row?: PveRecord) {
  const disk = diskName(row); if (!props.node || !disk || row?.parent || (row?.used && row.used !== 'unused')) return;
  Dialog.create({ title: gettext('Initialize Disk with GPT'), message: `${gettext('Initialize Disk with GPT')}: ${disk}`, cancel: true, persistent: true }).onOk(() => void initializeNodeDiskGpt(props.node!, disk).then((result) => openTask(result.data, gettext('Initialize Disk with GPT'))));
}
function wipe(row?: PveRecord) {
  const disk = diskName(row); if (!props.node || !disk || row?.parent) return;
  wipeTarget.value = row || {};
  wipeVisible.value = true;
}
async function confirmWipe() {
  const disk = diskName(wipeTarget.value); if (!props.node || !disk) return;
  wipeLoading.value = true;
  try {
    const result = await wipeNodeDisk(props.node, disk);
    wipeVisible.value = false;
    openTask(result.data, gettext('Wipe Disk'));
  } finally {
    wipeLoading.value = false;
  }
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
    tree-column="devpath"
    :actions="actions"
    @action="handleAction"
    @row-dblclick="showSmart"
  />
  <DiskSmartDialog v-model="smartVisible" :disk="smartDisk" :loading="smartLoading" :values="smartValues" @reload="showSmart({ devpath: smartDisk })" />
  <DiskWipeDialog v-model="wipeVisible" :disk="wipeTarget" :loading="wipeLoading" @submit="confirmWipe" />
  <TaskOutputDialog v-model="taskVisible" :node="node || ''" :upid="taskUpid" :title="taskTitle" @finished="table?.reload()" />
</template>
