<script setup lang="ts">
import type { QTableColumn, QTreeNode } from 'quasar';
import { computed, onMounted, shallowRef, watch } from 'vue';
import { useRouter } from 'vue-router';
import {
  getVmResources,
  getVmSpiceProxy,
  migrateVm,
  runVmPowerCommand,
  runVmBackup,
  type VmPowerCommand,
  type VmResource,
} from '@/api/vm';
import { getNodes, type PveNode } from '@/api/resources';
import { getNodeStorage } from '@/api/storageContent';
import UWindow from '@/components/UWindow.vue';
import UsageProgress from '@/components/UsageProgress.vue';
import VmResourceOperationDialog from '@/pages/computer/vm/VmResourceOperationDialog.vue';
import CreateVmDialog from '@/pages/computer/vm/CreateVmDialog.vue';
import TaskOutputDialog from '@/components/TaskOutputDialog.vue';
import { gettext } from '@/locale';
import { useSessionStore } from '@/stores/session';
import { usagePercent } from '@/utils/format';
import { textValue } from '@/utils/pveFormat';
import { toChineseStr } from '@/utils/unicode';
import { createVmSnapshot, getVmConfig, updateVmConfig } from '@/api/overview';

type VmTreeNode = QTreeNode & {
  kind: 'node' | 'category' | 'vm';
  node?: string;
  vmid?: string;
  status?: string;
  template?: boolean;
};

const loading = shallowRef(false);
const resources = shallowRef<VmResource[]>([]);
const selectedRows = shallowRef<VmResource[]>([]);
const selectedTreeNode = shallowRef('');
const search = shallowRef('');
const treeSearch = shallowRef('');
const treeExpanded = shallowRef<string[]>([]);
const pagination = shallowRef({ page: 1, rowsPerPage: 20 });
const confirmVisible = shallowRef(false);
const pendingCommand = shallowRef<VmPowerCommand>();
const pendingCommandData = shallowRef<Record<string, unknown>>();
const pendingCommandTitle = shallowRef('');
const commandLoading = shallowRef(false);
const session = useSessionStore();
const router = useRouter();
const operationDialogVisible = shallowRef(false);
const operation = shallowRef<'migrate' | 'clone' | 'delete' | 'template'>();
const taskDialogVisible = shallowRef(false);
const taskNode = shallowRef('');
const taskUpid = shallowRef('');
const taskTitle = shallowRef('');
const createDialogVisible = shallowRef(false);
const tagsDialogVisible = shallowRef(false);
const tagsSaving = shallowRef(false);
const tagValue = shallowRef('');
const bulkMigrateVisible = shallowRef(false);
const bulkMigrateLoading = shallowRef(false);
const bulkMigrateTarget = shallowRef('');
const migrationNodes = shallowRef<PveNode[]>([]);
const snapshotVisible = shallowRef(false);
const snapshotLoading = shallowRef(false);
const snapshotName = shallowRef('');
const snapshotDescription = shallowRef('');
const snapshotIncludeRam = shallowRef(false);
const backupVisible = shallowRef(false);
const backupLoading = shallowRef(false);
const backupStorages = shallowRef<string[]>([]);
const backupStorage = shallowRef('');
const backupMode = shallowRef<'snapshot' | 'suspend' | 'stop'>('snapshot');
const backupCompression = shallowRef<'zstd' | 'lzo' | 'gzip' | '0'>('zstd');
const backupProtected = shallowRef(false);
const defaultVisibleColumns = ['vmid', 'name', 'status', 'node', 'cpu', 'memory', 'disk', 'uptime'];
const visibleColumnNames = shallowRef<string[]>(
  (() => {
    try {
      const saved = JSON.parse(window.localStorage.getItem('vm-list-visible-columns') || '[]');
      return Array.isArray(saved) && saved.length
        ? saved.filter((value): value is string => typeof value === 'string')
        : defaultVisibleColumns;
    } catch {
      return defaultVisibleColumns;
    }
  })(),
);

const treeNodes = computed<VmTreeNode[]>(() => {
  const nodeGroups = new Map<string, VmResource[]>();
  resources.value.forEach((row) => {
    const node = String(row.node || gettext('Unknown'));
    const entries = nodeGroups.get(node) || [];
    entries.push(row);
    nodeGroups.set(node, entries);
  });

  return [...nodeGroups.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([node, rows]) => {
      const toVmNode = (row: VmResource): VmTreeNode => ({
        key: vmKey(row),
        label: `${textValue(row.vmid)} (${vmDisplayName(row) || gettext('No Name')})`,
        kind: 'vm',
        node: textValue(row.node),
        vmid: textValue(row.vmid),
        status: textValue(row.status) || 'unknown',
        template: Boolean(row.template),
      });
      const sortedRows = [...rows].sort((left, right) =>
        (textValue(left.name) || textValue(left.vmid)).localeCompare(textValue(right.name) || textValue(right.vmid)),
      );
      return {
        key: `node:${node}`,
        label: node,
        kind: 'node',
        node,
        children: [
          { key: `node:${node}:vms`, label: gettext('Virtual Machine'), kind: 'category' as const, node, children: sortedRows.filter((row) => !row.template).map(toVmNode) },
          { key: `node:${node}:templates`, label: gettext('Template'), kind: 'category' as const, node, children: sortedRows.filter((row) => Boolean(row.template)).map(toVmNode) },
        ],
      };
    });
});

const filteredTreeNodes = computed(() => {
  const keyword = treeSearch.value.trim().toLocaleLowerCase();
  if (!keyword) return treeNodes.value;
  const filterNodes = (nodes: VmTreeNode[]): VmTreeNode[] => nodes.flatMap((node) => {
    const children = filterNodes((node.children || []) as VmTreeNode[]);
    return textValue(node.label).toLocaleLowerCase().includes(keyword) || children.length
      ? [{ ...node, children }]
      : [];
  });
  return filterNodes(treeNodes.value);
});

const selectedNode = computed(() =>
  selectedTreeNode.value.match(/^node:([^:]+)/)?.[1] || '',
);
const selectedCategory = computed(() =>
  selectedTreeNode.value.endsWith(':vms') ? 'vms' : selectedTreeNode.value.endsWith(':templates') ? 'templates' : '',
);

const selectedVm = computed(() => selectedRows.value[0]);
const isStopped = computed(() => selectedVm.value?.status === 'stopped');
const isSuspended = computed(() =>
  ['paused', 'suspended'].includes(String(selectedVm.value?.status || '')),
);
const isTemplate = computed(() => Boolean(selectedVm.value?.template));
const canPowerManage = computed(() => hasCapability('VM.PowerMgmt'));
const canUseConsole = computed(() => hasCapability('VM.Console') && !isTemplate.value);
const canStart = computed(
  () => Boolean(selectedVm.value) && canPowerManage.value && isStopped.value && !isTemplate.value,
);
const canStop = computed(
  () => Boolean(selectedVm.value) && canPowerManage.value && !isStopped.value,
);
const canShutdown = computed(
  () =>
    Boolean(selectedVm.value) &&
    canPowerManage.value &&
    selectedVm.value?.status === 'running' &&
    !isTemplate.value,
);
const canReboot = computed(
  () =>
    Boolean(selectedVm.value) &&
    canPowerManage.value &&
    selectedVm.value?.status === 'running' &&
    !isTemplate.value,
);
const canSuspend = computed(
  () =>
    Boolean(selectedVm.value) &&
    canPowerManage.value &&
    selectedVm.value?.status === 'running' &&
    !isTemplate.value,
);
const canResume = computed(
  () => Boolean(selectedVm.value) && canPowerManage.value && isSuspended.value && !isTemplate.value,
);
const canMigrate = computed(
  () => Boolean(selectedVm.value) && hasCapability('VM.Migrate') && !isTemplate.value,
);
const canClone = computed(() => Boolean(selectedVm.value) && hasCapability('VM.Clone'));
const canDelete = computed(() => Boolean(selectedVm.value) && hasCapability('VM.Allocate'));
const canConvertTemplate = computed(
  () => Boolean(selectedVm.value) && hasCapability('VM.Allocate') && !isTemplate.value,
);
const canCreate = computed(() => hasCapability('VM.Allocate'));
const canSnapshot = computed(
  () => Boolean(selectedVm.value) && hasCapability('VM.Snapshot') && !isTemplate.value,
);
const canBackup = computed(
  () => Boolean(selectedVm.value) && hasCapability('VM.Backup') && !isTemplate.value,
);
const pendingCommandLabel = computed(
  () => pendingCommandTitle.value || commandLabel(pendingCommand.value),
);
const confirmationText = computed(() => {
  const vm = selectedVm.value;
  if (!vm || !pendingCommand.value) return '';
  return `${gettext('Are you sure you want to')} ${pendingCommandLabel.value}: ${vmDisplayName(vm) || vm.vmid} ?`;
});
const canBulkPower = computed(
  () => canPowerManage.value && selectedRows.value.some((row) => !row.template),
);

const filteredRows = computed(() => {
  const keyword = search.value.trim().toLocaleLowerCase();
  return resources.value.filter((row) => {
    const matchesNode = !selectedNode.value || row.node === selectedNode.value;
    const matchesCategory = !selectedCategory.value || (selectedCategory.value === 'templates' ? Boolean(row.template) : !row.template);
    const matchesSearch =
      !keyword ||
      [row.vmid, row.displayName, row.description, row.name, row.rawName, row.node]
        .filter((value) => value !== undefined && value !== null)
        .join(' ')
        .toLocaleLowerCase()
        .includes(keyword);
    return matchesNode && matchesCategory && matchesSearch;
  });
});

const columns = computed<QTableColumn<VmResource>[]>(() => [
  { name: 'vmid', label: gettext('VMID'), field: 'vmid', align: 'left', sortable: true },
  {
    name: 'name',
    label: gettext('Name'),
    field: (row) => vmDisplayName(row) || '-',
    align: 'left',
    sortable: true,
  },
  {
    name: 'status',
    label: gettext('Status'),
    field: (row) => statusText(row.status),
    align: 'left',
    sortable: true,
  },
  {
    name: 'node',
    label: gettext('Node'),
    field: (row) => row.node || '-',
    align: 'left',
    sortable: true,
  },
  {
    name: 'cpu',
    label: gettext('CPU Usage'),
    field: (row) => cpuPercent(row),
    align: 'left',
    sortable: true,
  },
  {
    name: 'memory',
    label: gettext('Memory Usage'),
    field: (row) => usagePercent(row.mem, row.maxmem),
    align: 'left',
    sortable: true,
  },
  {
    name: 'disk',
    label: gettext('Disk Usage'),
    field: (row) => usagePercent(row.disk, row.maxdisk),
    align: 'left',
    sortable: true,
  },
  {
    name: 'uptime',
    label: gettext('Uptime'),
    field: (row) => formatUptime(row.uptime),
    align: 'left',
    sortable: true,
  },
]);
watch(
  visibleColumnNames,
  (value) => {
    window.localStorage.setItem('vm-list-visible-columns', JSON.stringify(value));
  },
  { deep: true },
);

function vmKey(row: VmResource) {
  return `vm:${row.node || ''}:${row.vmid}`;
}

function decodeVmName(name: unknown) {
  const value = textValue(name);
  if (!value) return '';
  try {
    return toChineseStr(value);
  } catch {
    return value;
  }
}

function mergeVmDisplayName(vm: VmResource): VmResource {
  const rawName = textValue(vm.rawName || vm.name);
  const decodedName = decodeVmName(rawName);
  const displayName = textValue(vm.displayName || vm.description || decodedName || rawName);
  return {
    ...vm,
    rawName,
    name: decodedName || rawName,
    description: displayName,
    displayName,
  };
}

function vmDisplayName(vm: VmResource) {
  return textValue(vm.displayName || vm.description || vm.name);
}

function cpuPercent(row: VmResource) {
  const value = Number(row.cpu);
  return Number.isFinite(value) ? Math.min(Math.max(value * 100, 0), 100) : 0;
}

function statusText(status: unknown) {
  const value = textValue(status) || 'unknown';
  if (value === 'running') return gettext('Running');
  if (value === 'stopped') return gettext('Stopped');
  return gettext('Unknown');
}

function statusColor(status: unknown) {
  if (status === 'running') return 'green';
  if (status === 'stopped') return 'red';
  return 'grey';
}

function hasCapability(capability: string) {
  const caps = session.caps as { vms?: Record<string, unknown> };
  return Boolean(caps.vms?.[capability]);
}

function commandLabel(command?: VmPowerCommand) {
  if (command === 'start') return gettext('Start');
  if (command === 'shutdown') return gettext('Shutdown');
  if (command === 'stop') return gettext('Stop');
  if (command === 'reboot') return gettext('Reboot');
  if (command === 'reset') return gettext('Reset');
  if (command === 'suspend') return gettext('Suspend');
  if (command === 'resume') return gettext('Resume');
  return '';
}

function formatUptime(value: unknown) {
  const seconds = Number(value);
  if (!Number.isFinite(seconds) || seconds <= 0) return '-';
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return `${days}d ${hours}h ${minutes}m`;
}

function onTreeSelection(key: string) {
  selectedTreeNode.value = key;
  if (!key.startsWith('vm:')) {
    selectedRows.value = [];
    return;
  }
  const selected = resources.value.find((row) => vmKey(row) === key);
  selectedRows.value = selected ? [selected] : [];
  if (selected) openDetail(selected);
}

function toggleRowSelection(_event: Event, row: VmResource) {
  const isSelected = selectedRows.value.some((selected) => selected.id === row.id);
  selectedRows.value = isSelected
    ? selectedRows.value.filter((selected) => selected.id !== row.id)
    : [...selectedRows.value, row];
}

function requestCommand(command: VmPowerCommand, data?: Record<string, unknown>, title = '') {
  if (!selectedVm.value) return;
  pendingCommand.value = command;
  pendingCommandData.value = data;
  pendingCommandTitle.value = title;
  confirmVisible.value = true;
}

async function confirmCommand() {
  const vm = selectedVm.value;
  const command = pendingCommand.value;
  if (!vm?.node || !vm.vmid || !command) return;

  commandLoading.value = true;
  try {
    const taskCommandLabel = pendingCommandLabel.value || commandLabel(command);
    const response = await runVmPowerCommand(vm.node, vm.vmid, command, pendingCommandData.value);
    confirmVisible.value = false;
    pendingCommandData.value = undefined;
    pendingCommandTitle.value = '';
    await reload();
    if (response.data)
      openTask(vm.node, response.data, `${vmDisplayName(vm) || vm.vmid}: ${taskCommandLabel}`);
  } finally {
    commandLoading.value = false;
  }
}

async function bulkCommand(command: 'start' | 'shutdown' | 'stop') {
  const targets = selectedRows.value.filter(
    (row) =>
      !row.template &&
      row.node &&
      row.vmid &&
      (command === 'start'
        ? row.status === 'stopped'
        : command === 'shutdown'
          ? row.status === 'running'
          : row.status !== 'stopped'),
  );
  if (!targets.length) return;
  commandLoading.value = true;
  try {
    const results = await Promise.allSettled(
      targets.map((row) => runVmPowerCommand(String(row.node), row.vmid, command)),
    );
    const first = results.find(
      (result): result is PromiseFulfilledResult<Awaited<ReturnType<typeof runVmPowerCommand>>> =>
        result.status === 'fulfilled',
    );
    await reload();
    if (first?.value.data)
      openTask(
        String(targets[0]?.node || ''),
        first.value.data,
        `${gettext('Bulk')} ${commandLabel(command)}`,
      );
  } finally {
    commandLoading.value = false;
  }
}

function openTags() {
  tagValue.value = selectedRows.value.length === 1 ? String(selectedRows.value[0]?.tags || '') : '';
  tagsDialogVisible.value = true;
}

async function saveTags() {
  const targets = selectedRows.value.filter((row) => row.node && row.vmid && !row.template);
  if (!targets.length) return;
  tagsSaving.value = true;
  try {
    await Promise.all(
      targets.map(async (row) => {
        const config = await getVmConfig(String(row.node), row.vmid);
        await updateVmConfig(String(row.node), row.vmid, {
          digest: config.data?.digest,
          tags: tagValue.value.trim() || undefined,
        });
      }),
    );
    tagsDialogVisible.value = false;
    await reload();
  } finally {
    tagsSaving.value = false;
  }
}

async function openBulkMigrate() {
  bulkMigrateLoading.value = true;
  try {
    const response = await getNodes();
    migrationNodes.value = (response.data || []).filter((node) => node.status === 'online');
    bulkMigrateTarget.value =
      migrationNodes.value.find(
        (node) => !selectedRows.value.every((row) => row.node === node.node),
      )?.node || '';
    bulkMigrateVisible.value = true;
  } finally {
    bulkMigrateLoading.value = false;
  }
}
async function runBulkMigrate() {
  const targets = selectedRows.value.filter(
    (row) => row.node && row.vmid && !row.template && row.node !== bulkMigrateTarget.value,
  );
  if (!bulkMigrateTarget.value || !targets.length) return;
  bulkMigrateLoading.value = true;
  try {
    const results = await Promise.allSettled(
      targets.map((row) =>
        migrateVm(String(row.node), row.vmid, {
          target: bulkMigrateTarget.value,
          ...(row.status === 'running' ? { online: 1 } : {}),
        }),
      ),
    );
    const first = results.find(
      (result): result is PromiseFulfilledResult<Awaited<ReturnType<typeof migrateVm>>> =>
        result.status === 'fulfilled',
    );
    bulkMigrateVisible.value = false;
    await reload();
    if (first?.value.data)
      openTask(String(targets[0]?.node || ''), first.value.data, gettext('Bulk Migrate'));
  } finally {
    bulkMigrateLoading.value = false;
  }
}

function openOperation(nextOperation: 'migrate' | 'clone' | 'delete' | 'template') {
  if (!selectedVm.value) return;
  operation.value = nextOperation;
  operationDialogVisible.value = true;
}

function openSnapshot() {
  if (!canSnapshot.value) return;
  snapshotName.value = `snapshot-${new Date().toISOString().slice(0, 16).replace(/[-T:]/g, '')}`;
  snapshotDescription.value = '';
  snapshotIncludeRam.value = false;
  snapshotVisible.value = true;
}

async function createSnapshot() {
  const vm = selectedVm.value;
  const snapname = snapshotName.value.trim();
  if (!canSnapshot.value || !vm?.node || !snapname) return;
  snapshotLoading.value = true;
  try {
    const response = await createVmSnapshot(String(vm.node), vm.vmid, {
      snapname,
      ...(snapshotDescription.value.trim()
        ? { description: snapshotDescription.value.trim() }
        : {}),
      ...(snapshotIncludeRam.value ? { vmstate: 1 } : {}),
    });
    snapshotVisible.value = false;
    if (response.data) openTask(String(vm.node), response.data, gettext('Take Snapshot'));
  } finally {
    snapshotLoading.value = false;
  }
}

async function openBackup() {
  const vm = selectedVm.value;
  if (!canBackup.value || !vm?.node) return;
  backupLoading.value = true;
  try {
    const response = await getNodeStorage(String(vm.node), 'backup');
    backupStorages.value = (response.data || [])
      .map((item) => textValue(item.storage))
      .filter(Boolean);
    backupStorage.value = backupStorages.value[0] || '';
    backupMode.value = 'snapshot';
    backupCompression.value = 'zstd';
    backupProtected.value = false;
    backupVisible.value = true;
  } finally {
    backupLoading.value = false;
  }
}

async function backupNow() {
  const vm = selectedVm.value;
  if (!canBackup.value || !vm?.node || !backupStorage.value) return;
  backupLoading.value = true;
  try {
    const response = await runVmBackup(String(vm.node), vm.vmid, {
      storage: backupStorage.value,
      mode: backupMode.value,
      compress: backupCompression.value,
      protected: backupProtected.value ? 1 : 0,
    });
    backupVisible.value = false;
    if (response.data) openTask(String(vm.node), response.data, gettext('Backup'));
  } finally {
    backupLoading.value = false;
  }
}

function openTask(node: string, upid: string, title: string) {
  taskNode.value = node;
  taskUpid.value = upid;
  taskTitle.value = title;
  taskDialogVisible.value = true;
}

function openDetail(row: VmResource) {
  if (!row.node || row.vmid === undefined || row.vmid === null) return;
  void router.push({
    name: 'computer-vm-detail',
    params: { node: row.node, vmid: String(row.vmid) },
  });
}

function openConsole(type: 'noVNC' | 'xterm.js' = 'noVNC') {
  const vm = selectedVm.value;
  if (!vm?.node || !vm.vmid || !canUseConsole.value) return;

  const params = new URLSearchParams({
    console: 'kvm',
    vmid: String(vm.vmid),
    vmname: vmDisplayName(vm),
    node: vm.node,
  });
  if (type === 'noVNC') {
    params.set('novnc', '1');
    params.set('resize', 'scale');
    params.set('autoconnect', '1');
    params.set('reconnect', '1');
    window.open(
      `/?${params.toString()}`,
      `vm-console-${vm.vmid}`,
      'innerWidth=745,innerHeight=427',
    );
    return;
  }
  params.set('xtermjs', '1');
  window.open(
    `/?${params.toString()}`,
    '_blank',
    'toolbar=no,location=no,status=no,menubar=no,resizable=yes,width=1024,height=600',
  );
}

async function downloadSpice() {
  const vm = selectedVm.value;
  if (!vm?.node || !vm.vmid || !canUseConsole.value) return;
  commandLoading.value = true;
  try {
    const response = await getVmSpiceProxy(vm.node, vm.vmid, window.location.hostname);
    const content = [
      '[virt-viewer]',
      ...Object.entries(response.data || {}).map(([key, value]) => `${key}=${value}`),
    ].join('\n');
    const url = URL.createObjectURL(new Blob([content], { type: 'application/x-virt-viewer' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${vmDisplayName(vm) || vm.vmid}.vv`;
    anchor.click();
    URL.revokeObjectURL(url);
  } finally {
    commandLoading.value = false;
  }
}

async function reload() {
  loading.value = true;
  try {
    const response = await getVmResources();
    resources.value = (response.data || []).filter((row) => row.type === 'qemu').map(mergeVmDisplayName);
    treeExpanded.value = resources.value.flatMap((row) => {
      const node = textValue(row.node) || gettext('Unknown');
      return [`node:${node}`, `node:${node}:vms`, `node:${node}:templates`];
    });
    selectedRows.value = selectedRows.value
      .map((selected) => resources.value.find((row) => vmKey(row) === vmKey(selected)))
      .filter((row): row is VmResource => Boolean(row));
  } finally {
    loading.value = false;
  }
}

onMounted(() => {
  void reload();
});
</script>

<template>
  <div class="vm-list-page q-ma-md">
    <q-card class="no-shadow no-border-radius vm-list-card">
      <q-card-section class="q-pa-md">
        <div class="row no-wrap vm-list-layout">
          <aside class="vm-resource-tree">
            <q-input v-model="treeSearch" dense outlined square clearable class="vm-tree-search" :placeholder="gettext('Search')">
              <template #append><q-icon name="search" /></template>
            </q-input>
            <q-tree
              v-model:selected="selectedTreeNode"
              v-model:expanded="treeExpanded"
              :nodes="filteredTreeNodes"
              node-key="key"
              label-key="label"
              selected-color="primary"
              @update:selected="onTreeSelection"
            >
              <template #default-header="scope">
                <div class="row items-center no-wrap vm-tree-node">
                  <q-icon
                    :name="scope.node.kind === 'node' ? 'dns' : scope.node.kind === 'category' ? 'folder' : scope.node.template ? 'article' : 'desktop_windows'"
                    :color="scope.node.kind === 'node' ? 'primary' : scope.node.kind === 'category' ? 'grey-7' : statusColor(scope.node.status)"
                    size="16px"
                    class="q-mr-xs"
                  />
                  <span class="ellipsis">{{ scope.node.label }}</span>
                </div>
              </template>
            </q-tree>
          </aside>

          <section class="vm-table-panel">
            <q-table
              v-model:selected="selectedRows"
              flat
              selection="multiple"
              row-key="id"
              table-header-class="u-table-header"
              :rows="filteredRows"
              :columns="columns"
              :visible-columns="visibleColumnNames"
              :loading="loading"
              v-model:pagination="pagination"
              :rows-per-page-options="[10, 20, 50, 0]"
              :no-data-label="gettext('no record can be found')"
              @row-click="toggleRowSelection"
            >
              <template #top>
                <div class="full-width row items-center q-gutter-sm">
                  <q-btn
                    no-caps
                    outline
                    size="12px"
                    color="primary"
                    class="u-button"
                    :label="gettext('Create')"
                    :disable="!canCreate"
                    @click="createDialogVisible = true"
                  />
                  <q-btn-dropdown no-caps outline size="12px" color="primary" class="u-button" :label="gettext('Power')" :disable="!selectedVm || commandLoading">
                    <q-list dense><q-item v-close-popup clickable :disable="!canStart" @click="requestCommand('start')"><q-item-section>{{ gettext('Start') }}</q-item-section></q-item><q-item v-close-popup clickable :disable="!canShutdown" @click="requestCommand('shutdown')"><q-item-section>{{ gettext('Shutdown') }}</q-item-section></q-item><q-item v-close-popup clickable :disable="!canStop" @click="requestCommand('stop')"><q-item-section class="text-red">{{ gettext('Stop') }}</q-item-section></q-item><q-item v-close-popup clickable :disable="!canReboot" @click="requestCommand('reboot')"><q-item-section>{{ gettext('Reboot') }}</q-item-section></q-item><q-item v-close-popup clickable :disable="!canSuspend" @click="requestCommand('suspend')"><q-item-section>{{ gettext('Suspend') }}</q-item-section></q-item><q-item v-close-popup clickable :disable="!canSuspend" @click="requestCommand('suspend', { todisk: 1 }, gettext('Hibernate'))"><q-item-section>{{ gettext('Hibernate') }}</q-item-section></q-item><q-item v-close-popup clickable :disable="!canResume" @click="requestCommand('resume')"><q-item-section>{{ gettext('Resume') }}</q-item-section></q-item><q-item v-close-popup clickable :disable="!canStop" @click="requestCommand('reset')"><q-item-section>{{ gettext('Reset') }}</q-item-section></q-item></q-list>
                  </q-btn-dropdown>
                  <q-btn-dropdown no-caps outline size="12px" color="primary" class="u-button" :label="gettext('Console')" :disable="!selectedVm || !canUseConsole || commandLoading"><q-list dense><q-item v-close-popup clickable @click="openConsole('noVNC')"><q-item-section>noVNC</q-item-section></q-item><q-item v-close-popup clickable @click="downloadSpice"><q-item-section>SPICE</q-item-section></q-item><q-item v-close-popup clickable @click="openConsole('xterm.js')"><q-item-section>xterm.js</q-item-section></q-item></q-list></q-btn-dropdown>
                  <q-btn-dropdown no-caps outline size="12px" color="primary" class="u-button" :label="`${gettext('Bulk')} ${gettext('Actions')}`" :disable="!selectedRows.length || commandLoading"><q-list dense><q-item v-close-popup clickable :disable="!canBulkPower" @click="bulkCommand('start')"><q-item-section>{{ gettext('Bulk Start') }}</q-item-section></q-item><q-item v-close-popup clickable :disable="!canBulkPower" @click="bulkCommand('shutdown')"><q-item-section>{{ gettext('Bulk Shutdown') }}</q-item-section></q-item><q-item v-close-popup clickable :disable="!canBulkPower" @click="bulkCommand('stop')"><q-item-section>{{ gettext('Bulk Stop') }}</q-item-section></q-item><q-item v-close-popup clickable :disable="!hasCapability('VM.Migrate')" @click="openBulkMigrate"><q-item-section>{{ gettext('Bulk Migrate') }}</q-item-section></q-item></q-list></q-btn-dropdown>
                  <div v-show="false">
                  <q-btn
                    no-caps
                    outline
                    size="12px"
                    color="primary"
                    class="u-button"
                    icon="play_arrow"
                    :label="gettext('Start')"
                    :disable="!canStart || commandLoading"
                    @click="requestCommand('start')"
                  />
                  <q-btn
                    no-caps
                    outline
                    size="12px"
                    color="primary"
                    class="u-button"
                    :label="gettext('Suspend')"
                    :disable="!canSuspend || commandLoading"
                    @click="requestCommand('suspend')"
                  />
                  <q-btn
                    no-caps
                    outline
                    size="12px"
                    color="primary"
                    class="u-button"
                    :label="gettext('Hibernate')"
                    :disable="!canSuspend || commandLoading"
                    @click="requestCommand('suspend', { todisk: 1 }, gettext('Hibernate'))"
                  />
                  <q-btn
                    no-caps
                    outline
                    size="12px"
                    color="primary"
                    class="u-button"
                    :label="gettext('Resume')"
                    :disable="!canResume || commandLoading"
                    @click="requestCommand('resume')"
                  />
                  <q-btn
                    no-caps
                    outline
                    size="12px"
                    color="primary"
                    class="u-button"
                    icon="power_settings_new"
                    :label="gettext('Shutdown')"
                    :disable="!canShutdown || commandLoading"
                    @click="requestCommand('shutdown')"
                  />
                  <q-btn
                    no-caps
                    outline
                    size="12px"
                    color="red"
                    class="u-button"
                    icon="stop"
                    :label="gettext('Stop')"
                    :disable="!canStop || commandLoading"
                    @click="requestCommand('stop')"
                  />
                  <q-btn
                    no-caps
                    outline
                    size="12px"
                    color="primary"
                    class="u-button"
                    icon="restart_alt"
                    :label="gettext('Reboot')"
                    :disable="!canReboot || commandLoading"
                    @click="requestCommand('reboot')"
                  />
                  <q-btn
                    no-caps
                    outline
                    size="12px"
                    color="primary"
                    class="u-button"
                    icon="restart_alt"
                    :label="gettext('Reset')"
                    :disable="!canStop || commandLoading"
                    @click="requestCommand('reset')"
                  />
                  <q-btn
                    no-caps
                    outline
                    size="12px"
                    color="primary"
                    class="u-button"
                    :label="gettext('Bulk Start')"
                    :disable="!canBulkPower || commandLoading"
                    @click="bulkCommand('start')"
                  />
                  <q-btn
                    no-caps
                    outline
                    size="12px"
                    color="primary"
                    class="u-button"
                    :label="gettext('Bulk Shutdown')"
                    :disable="!canBulkPower || commandLoading"
                    @click="bulkCommand('shutdown')"
                  />
                  <q-btn
                    no-caps
                    outline
                    size="12px"
                    color="negative"
                    class="u-button"
                    :label="gettext('Bulk Stop')"
                    :disable="!canBulkPower || commandLoading"
                    @click="bulkCommand('stop')"
                  />
                  <q-btn
                    no-caps
                    outline
                    size="12px"
                    color="primary"
                    class="u-button"
                    :label="gettext('Bulk Migrate')"
                    :disable="!selectedRows.length || !hasCapability('VM.Migrate')"
                    @click="openBulkMigrate"
                  />
                  <q-btn
                    no-caps
                    outline
                    size="12px"
                    color="primary"
                    class="u-button"
                    :label="gettext('Tags')"
                    :disable="!selectedRows.length"
                    @click="openTags"
                  />
                  <q-btn
                    no-caps
                    outline
                    size="12px"
                    color="primary"
                    class="u-button"
                    icon="terminal"
                    :label="gettext('Console')"
                    :disable="!selectedVm || !canUseConsole"
                    @click="() => openConsole('noVNC')"
                  />
                  </div>
                  <q-btn-dropdown
                    no-caps
                    outline
                    size="12px"
                    color="primary"
                    class="u-button"
                    :label="gettext('More')"
                    :disable="!selectedVm || commandLoading"
                  >
                    <q-list dense>
                      <q-item
                        v-close-popup
                        clickable
                        :disable="!canMigrate"
                        @click="openOperation('migrate')"
                      >
                        <q-item-section>{{ gettext('Migrate') }}</q-item-section>
                      </q-item>
                      <q-item
                        v-close-popup
                        clickable
                        :disable="!canClone"
                        @click="openOperation('clone')"
                      >
                        <q-item-section>{{ gettext('Clone') }}</q-item-section>
                      </q-item>
                      <q-item v-close-popup clickable :disable="!canSnapshot" @click="openSnapshot">
                        <q-item-section>{{ gettext('Take Snapshot') }}</q-item-section>
                      </q-item>
                      <q-item v-close-popup clickable :disable="!canBackup" @click="openBackup">
                        <q-item-section>{{ gettext('Backup now') }}</q-item-section>
                      </q-item>
                      <q-item
                        v-close-popup
                        clickable
                        :disable="!canConvertTemplate"
                        @click="openOperation('template')"
                        ><q-item-section>{{
                          gettext('Convert to template')
                        }}</q-item-section></q-item
                      >
                      <q-separator />
                      <q-item
                        v-close-popup
                        clickable
                        :disable="!canDelete"
                        @click="openOperation('delete')"
                      >
                        <q-item-section class="text-red">{{ gettext('Delete') }}</q-item-section>
                      </q-item>
                    </q-list>
                  </q-btn-dropdown>
                  <q-btn
                    flat
                    dense
                    round
                    color="primary"
                    icon="refresh"
                    :aria-label="gettext('Refresh')"
                    :loading="loading"
                    @click="reload"
                  />
                  <q-space />
                  <q-input
                    v-model="search"
                    borderless
                    dense
                    debounce="300"
                    class="vm-search"
                    :placeholder="gettext('Search')"
                  >
                    <template #append><q-icon name="search" /></template>
                  </q-input>
                  <q-btn-dropdown
                    no-caps
                    flat
                    dense
                    round
                    icon="settings"
                    class="q-ml-sm column-settings-btn"
                    :aria-label="gettext('Columns')"
                    ><q-list dense
                      ><q-item v-for="column in columns" :key="column.name" tag="label"
                        ><q-item-section avatar
                          ><q-checkbox
                            v-model="visibleColumnNames"
                            :val="column.name"
                            dense /></q-item-section
                        ><q-item-section>{{ column.label }}</q-item-section></q-item
                      ></q-list
                    ></q-btn-dropdown
                  >
                </div>
              </template>

              <template #body-cell-status="scope">
                <q-td :props="scope">
                  <q-badge
                    :color="statusColor(scope.row.status)"
                    :label="statusText(scope.row.status)"
                  />
                </q-td>
              </template>
              <template #body-cell-name="scope">
                <q-td :props="scope"
                  ><q-icon :name="scope.row.template ? 'article' : 'desktop_windows'" :color="scope.row.template ? 'grey-7' : 'primary'" size="16px" class="q-mr-xs" /><span>{{ textValue(scope.value) || '-' }}</span></q-td>
              </template>
              <template #body-cell-cpu="scope">
                <q-td :props="scope"><UsageProgress :percent="Number(scope.value)" /></q-td>
              </template>
              <template #body-cell-memory="scope">
                <q-td :props="scope"><UsageProgress :percent="Number(scope.value)" /></q-td>
              </template>
              <template #body-cell-disk="scope">
                <q-td :props="scope"><UsageProgress :percent="Number(scope.value)" /></q-td>
              </template>
            </q-table>
          </section>
        </div>
      </q-card-section>
    </q-card>

    <q-dialog v-model="confirmVisible" persistent transition-show="scale" transition-hide="scale">
      <UWindow :title="gettext('Confirm')" width="420px" :loading="commandLoading">
        <div class="q-pa-md u-size-12">{{ confirmationText }}</div>
        <template #foot>
          <q-btn
            v-close-popup
            no-caps
            flat
            size="12px"
            class="u-button q-mr-sm"
            :disable="commandLoading"
            :label="gettext('Cancel')"
          />
          <q-btn
            no-caps
            flat
            size="12px"
            class="bg-primary text-grey-1 u-button"
            :loading="commandLoading"
            :label="gettext('Confirm')"
            @click="confirmCommand"
          />
        </template>
      </UWindow>
    </q-dialog>

    <VmResourceOperationDialog
      v-model="operationDialogVisible"
      :operation="operation"
      :vm="selectedVm"
      @completed="reload"
      @task="openTask($event.node, $event.upid, $event.title)"
    />
    <CreateVmDialog
      v-model="createDialogVisible"
      @completed="reload"
      @task="openTask($event.node, $event.upid, $event.title)"
    />
    <q-dialog v-model="snapshotVisible" persistent
      ><UWindow :title="gettext('Take Snapshot')" width="520px" :loading="snapshotLoading"
        ><div class="q-pa-md q-gutter-md">
          <q-input v-model="snapshotName" dense square outlined :label="gettext('Name')" /><q-input
            v-model="snapshotDescription"
            dense
            square
            outlined
            type="textarea"
            autogrow
            :label="gettext('Description')"
          /><q-checkbox
            v-model="snapshotIncludeRam"
            dense
            color="primary"
            :label="gettext('Include RAM')"
          />
        </div>
        <template #foot
          ><q-btn
            v-close-popup
            no-caps
            outline
            size="12px"
            class="u-button"
            :label="gettext('Cancel')"
            :disable="snapshotLoading" /><q-btn
            no-caps
            flat
            size="12px"
            class="bg-primary text-grey-1 u-button"
            :disable="!snapshotName.trim()"
            :loading="snapshotLoading"
            :label="gettext('Take Snapshot')"
            @click="createSnapshot" /></template></UWindow
    ></q-dialog>
    <q-dialog v-model="backupVisible" persistent
      ><UWindow :title="gettext('Backup')" width="560px" :loading="backupLoading"
        ><div class="q-pa-md q-gutter-md">
          <q-select
            v-model="backupStorage"
            dense
            outlined
            square
            :options="backupStorages"
            :label="gettext('Storage')"
          /><q-select
            v-model="backupMode"
            dense
            outlined
            square
            emit-value
            map-options
            :options="[
              { label: gettext('Snapshot'), value: 'snapshot' },
              { label: gettext('Suspend'), value: 'suspend' },
              { label: gettext('Stop'), value: 'stop' },
            ]"
            :label="gettext('Mode')"
          /><q-select
            v-model="backupCompression"
            dense
            outlined
            square
            emit-value
            map-options
            :options="[
              { label: 'ZSTD', value: 'zstd' },
              { label: 'LZO', value: 'lzo' },
              { label: 'GZIP', value: 'gzip' },
              { label: gettext('None'), value: '0' },
            ]"
            :label="gettext('Compression')"
          /><q-checkbox
            v-model="backupProtected"
            dense
            color="primary"
            :label="gettext('Protected')"
          />
        </div>
        <template #foot
          ><q-btn
            v-close-popup
            no-caps
            outline
            size="12px"
            class="u-button"
            :label="gettext('Cancel')"
            :disable="backupLoading" /><q-btn
            no-caps
            flat
            size="12px"
            class="bg-primary text-grey-1 u-button"
            :disable="!backupStorage"
            :loading="backupLoading"
            :label="gettext('Backup')"
            @click="backupNow" /></template></UWindow
    ></q-dialog>
    <TaskOutputDialog
      v-model="taskDialogVisible"
      :node="taskNode"
      :upid="taskUpid"
      :title="taskTitle"
    />
    <q-dialog v-model="tagsDialogVisible" persistent
      ><UWindow :title="gettext('Tags')" width="460px" :loading="tagsSaving"
        ><div class="q-pa-md">
          <q-input
            v-model="tagValue"
            dense
            square
            outlined
            :label="gettext('Tags')"
            hint="tag1;tag2"
          />
        </div>
        <template #foot
          ><q-btn
            v-close-popup
            no-caps
            outline
            size="12px"
            class="u-button"
            :label="gettext('Cancel')" /><q-btn
            no-caps
            flat
            size="12px"
            class="bg-primary text-grey-1 u-button"
            :loading="tagsSaving"
            :label="gettext('Save')"
            @click="saveTags" /></template></UWindow
    ></q-dialog>
    <q-dialog v-model="bulkMigrateVisible" persistent
      ><UWindow :title="gettext('Bulk Migrate')" width="460px" :loading="bulkMigrateLoading"
        ><div class="q-pa-md">
          <q-select
            v-model="bulkMigrateTarget"
            dense
            square
            outlined
            emit-value
            map-options
            :label="gettext('Target Node')"
            :options="migrationNodes.map((node) => ({ label: node.node, value: node.node }))"
          />
        </div>
        <template #foot
          ><q-btn
            v-close-popup
            no-caps
            outline
            size="12px"
            class="u-button"
            :label="gettext('Cancel')" /><q-btn
            no-caps
            flat
            size="12px"
            class="bg-primary text-grey-1 u-button"
            :disable="!bulkMigrateTarget"
            :loading="bulkMigrateLoading"
            :label="gettext('Migrate')"
            @click="runBulkMigrate" /></template></UWindow
    ></q-dialog>
  </div>
</template>

<style scoped>
.vm-list-card {
  min-height: calc(100vh - 120px);
}

.vm-list-layout {
  align-items: stretch;
  min-height: calc(100vh - 152px);
}

.vm-resource-tree {
  --vm-resource-tree-width: 220px;
  box-sizing: border-box;
  width: calc(var(--vm-resource-tree-width) + 13px);
  flex: 0 0 calc(var(--vm-resource-tree-width) + 13px);
  max-height: calc(100vh - 152px);
  padding-right: 12px;
  overflow-y: auto;
  overflow-x: hidden;
  border-right: 1px solid #cccccc;
}

.vm-tree-search,
.vm-resource-tree :deep(.q-tree) {
  width: 100%;
}

.vm-tree-title {
  height: 30px;
  padding: 7px 8px;
  background: #f2f5fc;
  border: 1px solid #dfe1e6;
  color: #333333;
  font-size: 12px;
}

.vm-tree-node {
  max-width: var(--vm-resource-tree-width);
  min-width: 0;
  font-size: 12px;
}

.vm-table-panel {
  min-width: 0;
  flex: 1;
  padding-left: 12px;
}

.vm-filter {
  width: 130px;
}

.vm-search {
  width: 210px;
}

:deep(.column-settings-btn .q-btn-dropdown__arrow-container) {
  display: none;
}

:deep(.column-settings-btn .q-btn-dropdown__arrow) {
  display: none;
}

:deep(.q-table__top) {
  padding: 0 0 10px;
}

:deep(.q-table th),
:deep(.q-table td) {
  padding: 0 16px !important;
}

:deep(.q-table thead tr),
:deep(.q-table tbody td) {
  height: 40px;
}

:deep(.q-field__control),
:deep(.q-field__marginal) {
  height: 28px;
}
</style>
