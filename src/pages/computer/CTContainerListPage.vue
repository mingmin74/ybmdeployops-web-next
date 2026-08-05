<script setup lang="ts">
import type { QTableColumn, QTreeNode } from 'quasar';
import { computed, onMounted, shallowRef, watch } from 'vue';
import { useRouter } from 'vue-router';
import {
  getVmResources,
  runCtPowerCommand,
  runVmBackup,
  type VmPowerCommand,
  type VmResource,
} from '@/api/vm';
import { getNodeStorage } from '@/api/storageContent';
import CreateCtDialog from '@/pages/computer/ct/CreateCtDialog.vue';
import UWindow from '@/components/UWindow.vue';
import UsageProgress from '@/components/UsageProgress.vue';
import TaskOutputDialog from '@/components/TaskOutputDialog.vue';
import { gettext } from '@/locale';
import { useSessionStore } from '@/stores/session';
import { usagePercent } from '@/utils/format';
import { textValue } from '@/utils/pveFormat';
import { toChineseStr } from '@/utils/unicode';
import { getVmConfig, updateVmConfig } from '@/api/overview';

type ContainerTreeNode = QTreeNode & {
  kind: 'node' | 'category' | 'container';
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
const taskDialogVisible = shallowRef(false);
const taskNode = shallowRef('');
const taskUpid = shallowRef('');
const taskTitle = shallowRef('');
const tagsDialogVisible = shallowRef(false);
const tagsSaving = shallowRef(false);
const tagValue = shallowRef('');
const backupVisible = shallowRef(false);
const backupLoading = shallowRef(false);
const backupStorages = shallowRef<string[]>([]);
const backupStorage = shallowRef('');
const backupMode = shallowRef<'snapshot' | 'suspend' | 'stop'>('snapshot');
const backupCompression = shallowRef<'zstd' | 'lzo' | 'gzip' | '0'>('zstd');
const backupProtected = shallowRef(false);
const createDialogVisible = shallowRef(false);
const defaultVisibleColumns = ['vmid', 'name', 'status', 'node', 'cpu', 'memory', 'disk', 'uptime'];

const canCreateCt = computed(() => hasCapability('VM.Allocate'));
const visibleColumnNames = shallowRef<string[]>(
  (() => {
    try {
      const saved = JSON.parse(window.localStorage.getItem('ct-container-list-visible-columns') || '[]');
      return Array.isArray(saved) && saved.length
        ? saved.filter((value): value is string => typeof value === 'string')
        : defaultVisibleColumns;
    } catch {
      return defaultVisibleColumns;
    }
  })(),
);

const treeNodes = computed<ContainerTreeNode[]>(() => {
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
      const toContainerNode = (row: VmResource): ContainerTreeNode => ({
        key: containerKey(row),
        label: `${textValue(row.vmid)} (${containerDisplayName(row) || gettext('No Name')})`,
        kind: 'container',
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
          { key: `node:${node}:containers`, label: gettext('Container'), kind: 'category' as const, node, children: sortedRows.filter((row) => !row.template).map(toContainerNode) },
          { key: `node:${node}:templates`, label: gettext('Template'), kind: 'category' as const, node, children: sortedRows.filter((row) => Boolean(row.template)).map(toContainerNode) },
        ],
      };
    });
});

const filteredTreeNodes = computed(() => {
  const keyword = treeSearch.value.trim().toLocaleLowerCase();
  if (!keyword) return treeNodes.value;
  const filterNodes = (nodes: ContainerTreeNode[]): ContainerTreeNode[] => nodes.flatMap((node) => {
    const children = filterNodes((node.children || []) as ContainerTreeNode[]);
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
  selectedTreeNode.value.endsWith(':containers') ? 'containers' : selectedTreeNode.value.endsWith(':templates') ? 'templates' : '',
);

const selectedContainer = computed(() => selectedRows.value[0]);
const isStopped = computed(() => selectedContainer.value?.status === 'stopped');
const isSuspended = computed(() =>
  ['paused', 'suspended'].includes(String(selectedContainer.value?.status || '')),
);
const isTemplate = computed(() => Boolean(selectedContainer.value?.template));
const canPowerManage = computed(() => hasCapability('VM.PowerMgmt'));
const canStart = computed(
  () => Boolean(selectedContainer.value) && canPowerManage.value && isStopped.value && !isTemplate.value,
);
const canStop = computed(
  () => Boolean(selectedContainer.value) && canPowerManage.value && !isStopped.value,
);
const canShutdown = computed(
  () =>
    Boolean(selectedContainer.value) &&
    canPowerManage.value &&
    selectedContainer.value?.status === 'running' &&
    !isTemplate.value,
);
const canReboot = computed(
  () =>
    Boolean(selectedContainer.value) &&
    canPowerManage.value &&
    selectedContainer.value?.status === 'running' &&
    !isTemplate.value,
);
const canSuspend = computed(
  () =>
    Boolean(selectedContainer.value) &&
    canPowerManage.value &&
    selectedContainer.value?.status === 'running' &&
    !isTemplate.value,
);
const canResume = computed(
  () => Boolean(selectedContainer.value) && canPowerManage.value && isSuspended.value && !isTemplate.value,
);
const canBackup = computed(
  () => Boolean(selectedContainer.value) && hasCapability('VM.Backup') && !isTemplate.value,
);
const pendingCommandLabel = computed(
  () => pendingCommandTitle.value || commandLabel(pendingCommand.value),
);
const confirmationText = computed(() => {
  const vm = selectedContainer.value;
  if (!vm || !pendingCommand.value) return '';
  return `${gettext('Are you sure you want to')} ${pendingCommandLabel.value}: ${containerDisplayName(vm) || vm.vmid} ?`;
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
    field: (row) => containerDisplayName(row) || '-',
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
  { name: 'node', label: gettext('Node'), field: 'node', align: 'left', sortable: true },
  {
    name: 'cpu',
    label: gettext('CPU usage'),
    field: (row) => cpuPercent(row),
    align: 'left',
    sortable: true,
  },
  {
    name: 'memory',
    label: gettext('Memory usage'),
    field: (row) => usagePercent(row.mem, row.maxmem),
    align: 'left',
    sortable: true,
  },
  {
    name: 'disk',
    label: gettext('Disk usage'),
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
    window.localStorage.setItem('ct-container-list-visible-columns', JSON.stringify(value));
  },
  { deep: true },
);

function containerKey(row: VmResource) {
  return `ct:${row.node || ''}:${row.vmid}`;
}

function decodeContainerName(name: unknown) {
  const value = textValue(name);
  if (!value) return '';
  try {
    return toChineseStr(value);
  } catch {
    return value;
  }
}

function mergeContainerDisplayName(vm: VmResource): VmResource {
  const rawName = textValue(vm.rawName || vm.name);
  const decodedName = decodeContainerName(rawName);
  const displayName = textValue(vm.displayName || vm.description || decodedName || rawName);
  return {
    ...vm,
    rawName,
    name: decodedName || rawName,
    description: displayName,
    displayName,
  };
}

function containerDisplayName(vm: VmResource) {
  return textValue(vm.displayName || vm.description || vm.name || vm.rawName);
}

function cpuPercent(row: VmResource) {
  const value = Number(row.cpu || 0);
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, value * 100));
}

function statusText(status: unknown) {
  const value = textValue(status);
  if (value === 'running') return gettext('Running');
  if (value === 'stopped') return gettext('Stopped');
  if (value === 'paused' || value === 'suspended') return gettext('Suspended');
  return value || gettext('Unknown');
}

function statusColor(status: unknown) {
  const value = textValue(status);
  if (value === 'running') return 'positive';
  if (value === 'stopped') return 'grey-7';
  if (value === 'paused' || value === 'suspended') return 'warning';
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
  const total = Number(value || 0);
  if (!Number.isFinite(total) || total <= 0) return '-';
  const days = Math.floor(total / 86400);
  const hours = Math.floor((total % 86400) / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  if (days) return `${days}d ${hours}h`;
  if (hours) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

function onTreeSelection(key: string) {
  selectedTreeNode.value = selectedTreeNode.value === key ? '' : key;
}

function openDetail(row: VmResource) {
  if (!row.node || row.vmid === undefined || row.vmid === null) return;
  void router.push({
    name: 'computer-ct-container-detail',
    params: { node: row.node, vmid: String(row.vmid) },
  });
}

function openTreeContainer(node: ContainerTreeNode) {
  if (node.kind !== 'container' || !node.node || !node.vmid) return;
  void router.push({
    name: 'computer-ct-container-detail',
    params: { node: node.node, vmid: node.vmid },
  });
}

function toggleRowSelection(_event: Event, row: VmResource) {
  const isSelected = selectedRows.value.some((selected) => selected.id === row.id);
  selectedRows.value = isSelected
    ? selectedRows.value.filter((selected) => selected.id !== row.id)
    : [...selectedRows.value, row];
}

function requestCommand(command: VmPowerCommand, data?: Record<string, unknown>, title = '') {
  if (!selectedContainer.value) return;
  pendingCommand.value = command;
  pendingCommandData.value = data;
  pendingCommandTitle.value = title;
  confirmVisible.value = true;
}

async function confirmCommand() {
  const vm = selectedContainer.value;
  const command = pendingCommand.value;
  if (!vm?.node || !vm.vmid || !command) return;

  commandLoading.value = true;
  try {
    const taskCommandLabel = pendingCommandLabel.value || commandLabel(command);
    const response = await runCtPowerCommand(vm.node, vm.vmid, command, pendingCommandData.value);
    confirmVisible.value = false;
    pendingCommand.value = undefined;
    pendingCommandData.value = undefined;
    await reload();
    if (response.data)
      openTask(vm.node, response.data, `${containerDisplayName(vm) || vm.vmid}: ${taskCommandLabel}`);
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
    const responses = await Promise.all(
      targets.map((row) => runCtPowerCommand(String(row.node), row.vmid, command)),
    );
    await reload();
    const task = responses.find((response) => response.data);
    if (task?.data) openTask(
      String(targets[0]?.node || ''),
      task.data,
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

function openCreateDialog() {
  createDialogVisible.value = true;
}

async function saveTags() {
  const targets = selectedRows.value.filter((row) => row.node && row.vmid && !row.template);
  if (!targets.length) return;
  tagsSaving.value = true;
  try {
    await Promise.all(
      targets.map(async (row) => {
        const config = await getVmConfig(String(row.node), row.vmid, 'lxc');
        await updateVmConfig(String(row.node), row.vmid, {
          ...(config.data?.digest ? { digest: config.data.digest } : {}),
          tags: tagValue.value.trim(),
        }, 'lxc');
      }),
    );
    tagsDialogVisible.value = false;
    await reload();
  } finally {
    tagsSaving.value = false;
  }
}

async function openBackup() {
  const vm = selectedContainer.value;
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
  const vm = selectedContainer.value;
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
    if (response.data)
      openTask(String(vm.node), response.data, `${containerDisplayName(vm) || vm.vmid}: ${gettext('Backup')}`);
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

async function reload() {
  loading.value = true;
  try {
    const response = await getVmResources();
    resources.value = (response.data || []).filter((row) => row.type === 'lxc').map(mergeContainerDisplayName);
    treeExpanded.value = resources.value.flatMap((row) => {
      const node = textValue(row.node) || gettext('Unknown');
      return [`node:${node}`, `node:${node}:containers`, `node:${node}:templates`];
    });
    selectedRows.value = selectedRows.value
      .map((selected) => resources.value.find((row) => containerKey(row) === containerKey(selected)))
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
            <q-input v-model="treeSearch" dense outlined square clearable debounce="200" class="vm-tree-search" :placeholder="gettext('Search')">
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
              <template #default-header="{ node }">
                  <div class="row items-center no-wrap vm-tree-node">
                    <q-icon
                      :name="node.kind === 'node' ? 'dns' : node.kind === 'category' ? 'folder' : 'inventory_2'"
                      size="16px"
                      class="q-mr-xs"
                      :color="node.kind === 'container' ? statusColor(node.status) : 'grey-7'"
                    />
                    <button
                      v-if="node.kind === 'container'"
                      type="button"
                      class="vm-tree-node__link ellipsis"
                      @click.stop="openTreeContainer(node)"
                    >
                      {{ node.label }}
                    </button>
                    <span v-else class="ellipsis">{{ node.label }}</span>
                  </div>
              </template>
            </q-tree>
          </aside>

          <section class="vm-table-panel">
            <q-table
              v-model:selected="selectedRows"
              v-model:pagination="pagination"
              class="vm-table"
              flat
              table-header-class="u-table-header"
              hide-selected-banner
              row-key="id"
              selection="multiple"
              :rows="filteredRows"
              :columns="columns"
              :visible-columns="visibleColumnNames"
              :loading="loading"
              :rows-per-page-options="[10, 20, 50, 0]"
              binary-state-sort
              @row-click="toggleRowSelection"
            >
              <template #top>
                <div class="full-width row items-center q-gutter-sm">
                  <q-btn v-if="canCreateCt" no-caps outline size="12px" color="primary" class="u-button" :label="gettext('Create')" :disable="!canCreateCt" @click="openCreateDialog" />
                  <q-btn-dropdown no-caps outline size="12px" color="primary" class="u-button" :label="gettext('Power')" :disable="!selectedContainer || commandLoading">
                    <q-list dense>
                      <q-item v-close-popup clickable :disable="!canStart" @click="requestCommand('start')"><q-item-section>{{ gettext('Start') }}</q-item-section></q-item>
                      <q-item v-close-popup clickable :disable="!canShutdown" @click="requestCommand('shutdown')"><q-item-section>{{ gettext('Shutdown') }}</q-item-section></q-item>
                      <q-item v-close-popup clickable :disable="!canStop" @click="requestCommand('stop')"><q-item-section class="text-red">{{ gettext('Stop') }}</q-item-section></q-item>
                      <q-item v-close-popup clickable :disable="!canReboot" @click="requestCommand('reboot')"><q-item-section>{{ gettext('Reboot') }}</q-item-section></q-item>
                      <q-item v-close-popup clickable :disable="!canSuspend" @click="requestCommand('suspend')"><q-item-section>{{ gettext('Suspend') }}</q-item-section></q-item>
                      <q-item v-close-popup clickable :disable="!canResume" @click="requestCommand('resume')"><q-item-section>{{ gettext('Resume') }}</q-item-section></q-item>
                    </q-list>
                  </q-btn-dropdown>
                  <q-btn-dropdown no-caps outline size="12px" color="primary" class="u-button" :label="`${gettext('Bulk')} ${gettext('Actions')}`" :disable="!selectedRows.length || commandLoading">
                    <q-list dense>
                      <q-item v-close-popup clickable :disable="!canBulkPower" @click="bulkCommand('start')"><q-item-section>{{ gettext('Bulk Start') }}</q-item-section></q-item>
                      <q-item v-close-popup clickable :disable="!canBulkPower" @click="bulkCommand('shutdown')"><q-item-section>{{ gettext('Bulk Shutdown') }}</q-item-section></q-item>
                      <q-item v-close-popup clickable :disable="!canBulkPower" @click="bulkCommand('stop')"><q-item-section>{{ gettext('Bulk Stop') }}</q-item-section></q-item>
                    </q-list>
                  </q-btn-dropdown>
                  <q-btn-dropdown no-caps outline size="12px" color="primary" class="u-button" :label="gettext('More')" :disable="!selectedContainer || commandLoading">
                    <q-list dense>
                      <q-item v-close-popup clickable :disable="!selectedRows.length" @click="openTags"><q-item-section>{{ gettext('Edit Tags') }}</q-item-section></q-item>
                      <q-item v-close-popup clickable :disable="!canBackup" @click="openBackup"><q-item-section>{{ gettext('Backup now') }}</q-item-section></q-item>
                    </q-list>
                  </q-btn-dropdown>
                  <q-btn flat dense round color="primary" icon="refresh" :aria-label="gettext('Refresh')" :loading="loading" @click="reload" />
                  <q-space />
                  <q-input v-model="search" borderless dense debounce="300" class="vm-search" :placeholder="gettext('Search')">
                    <template #append><q-icon name="search" /></template>
                  </q-input>
                  <q-btn-dropdown no-caps flat dense round icon="settings" class="q-ml-sm column-settings-btn" :aria-label="gettext('Columns')">
                    <q-list dense>
                      <q-item v-for="column in columns" :key="column.name" tag="label">
                        <q-item-section avatar><q-checkbox v-model="visibleColumnNames" :val="column.name" dense /></q-item-section>
                        <q-item-section>{{ column.label }}</q-item-section>
                      </q-item>
                    </q-list>
                  </q-btn-dropdown>
                </div>
              </template>
              <template #body-cell-name="scope">
                <q-td :props="scope">
                  <div class="vm-name-cell">
                    <q-icon name="inventory_2" size="18px" color="primary" />
                    <button
                      type="button"
                      class="vm-display-name-text ellipsis"
                      @click.stop="openDetail(scope.row)"
                    >
                      {{ containerDisplayName(scope.row) || '-' }}
                    </button>
                    <q-badge v-if="scope.row.template" outline color="primary" :label="gettext('Template')" />
                  </div>
                </q-td>
              </template>
              <template #body-cell-status="scope">
                <q-td :props="scope">
                  <q-badge :color="statusColor(scope.row.status)" :label="statusText(scope.row.status)" />
                </q-td>
              </template>
              <template #body-cell-cpu="scope">
                <q-td :props="scope">
                  <UsageProgress :percent="cpuPercent(scope.row)" />
                </q-td>
              </template>
              <template #body-cell-memory="scope">
                <q-td :props="scope">
                  <UsageProgress :percent="usagePercent(scope.row.mem, scope.row.maxmem)" />
                </q-td>
              </template>
              <template #body-cell-disk="scope">
                <q-td :props="scope">
                  <UsageProgress :percent="usagePercent(scope.row.disk, scope.row.maxdisk)" />
                </q-td>
              </template>
            </q-table>
          </section>
        </div>
      </q-card-section>
    </q-card>

    <q-dialog v-model="confirmVisible" persistent>
      <UWindow :title="pendingCommandLabel" width="420px" :loading="commandLoading">
        <div class="q-pa-md">
          <div class="text-body2">{{ confirmationText }}</div>
        </div>
        <template #footer>
          <q-btn flat :label="gettext('Cancel')" v-close-popup :disable="commandLoading" />
          <q-btn color="primary" :label="gettext('Confirm')" :loading="commandLoading" @click="confirmCommand" />
        </template>
      </UWindow>
    </q-dialog>

    <q-dialog v-model="tagsDialogVisible">
      <UWindow :title="gettext('Edit Tags')" width="420px" :loading="tagsSaving">
        <div class="q-pa-md">
          <q-input v-model="tagValue" dense outlined square :label="gettext('Tags')" />
        </div>
        <template #footer>
          <q-btn flat :label="gettext('Cancel')" v-close-popup :disable="tagsSaving" />
          <q-btn color="primary" :label="gettext('Save')" :loading="tagsSaving" @click="saveTags" />
        </template>
      </UWindow>
    </q-dialog>

    <q-dialog v-model="backupVisible">
      <UWindow :title="gettext('Backup')" width="520px" :loading="backupLoading">
        <div class="q-pa-md q-gutter-md">
          <q-select v-model="backupStorage" dense outlined square emit-value map-options :label="gettext('Storage')" :options="backupStorages" />
          <q-select v-model="backupMode" dense outlined square emit-value map-options :label="gettext('Mode')" :options="[
            { label: gettext('Snapshot'), value: 'snapshot' },
            { label: gettext('Suspend'), value: 'suspend' },
            { label: gettext('Stop'), value: 'stop' },
          ]" />
          <q-select v-model="backupCompression" dense outlined square emit-value map-options :label="gettext('Compression')" :options="['zstd', 'lzo', 'gzip', '0']" />
          <q-checkbox v-model="backupProtected" dense :label="gettext('Protected')" />
        </div>
        <template #footer>
          <q-btn flat :label="gettext('Cancel')" v-close-popup :disable="backupLoading" />
          <q-btn color="primary" :label="gettext('Backup')" :disable="!backupStorage" :loading="backupLoading" @click="backupNow" />
        </template>
      </UWindow>
    </q-dialog>

    <TaskOutputDialog
      v-model="taskDialogVisible"
      :node="taskNode"
      :upid="taskUpid"
      :title="taskTitle"
    />
    <CreateCtDialog
      v-model="createDialogVisible"
      @completed="reload"
      @task="openTask($event.node, $event.upid, $event.title)"
    />
  </div>
</template>

<style scoped>
.vm-list-page {
  min-height: calc(100vh - 120px);
}

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

.vm-tree-node {
  max-width: var(--vm-resource-tree-width);
  min-width: 0;
  font-size: 12px;
}

.vm-tree-node__link {
  min-width: 0;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--q-primary);
  cursor: pointer;
  font: inherit;
  text-align: left;
}

.vm-table-panel {
  min-width: 0;
  flex: 1;
  padding-left: 12px;
}

.vm-search {
  width: 210px;
}

.vm-table {
  height: auto;
}

.vm-name-cell {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.vm-display-name-text {
  max-width: 220px;
  padding: 0;
  border: 0;
  background: transparent;
  color: #2563eb;
  cursor: pointer;
  font: inherit;
  font-weight: 500;
  text-align: left;
}

.column-settings-btn :deep(.q-btn-dropdown__arrow),
.column-settings-btn :deep(.q-btn-dropdown__arrow-container) {
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
