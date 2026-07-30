<script setup lang="ts">
import type { QTableColumn, QTreeNode } from 'quasar';
import { computed, onMounted, shallowRef, watch } from 'vue';
import {
  getVmResources,
  runCtPowerCommand,
  runVmBackup,
  type VmPowerCommand,
  type VmResource,
} from '@/api/vm';
import { getNodeStorage } from '@/api/storageContent';
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
const defaultVisibleColumns = ['vmid', 'name', 'status', 'node', 'cpu', 'memory', 'disk', 'uptime'];
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
          <aside class="vm-list-tree">
            <div class="vm-list-tree__header">
              <div class="vm-list-title">{{ gettext('Ct Container') }}</div>
              <q-input v-model="treeSearch" dense outlined square clearable debounce="200" :placeholder="gettext('Search')">
                <template #prepend>
                  <q-icon name="search" size="18px" />
                </template>
              </q-input>
            </div>
            <q-separator />
            <q-scroll-area class="vm-list-tree__body">
              <q-tree
                :nodes="filteredTreeNodes"
                node-key="key"
                dense
                no-connectors
                :expanded="treeExpanded"
                :selected="selectedTreeNode"
                selected-color="primary"
                @update:selected="onTreeSelection"
                @update:expanded="treeExpanded = [...$event]"
              >
                <template #default-header="{ node }">
                  <div class="row items-center no-wrap full-width vm-tree-node">
                    <q-icon
                      :name="node.kind === 'node' ? 'dns' : node.kind === 'category' ? 'folder' : 'inventory_2'"
                      size="18px"
                      class="q-mr-sm"
                      :color="node.kind === 'container' ? statusColor(node.status) : 'grey-7'"
                    />
                    <span class="ellipsis">{{ node.label }}</span>
                  </div>
                </template>
              </q-tree>
            </q-scroll-area>
          </aside>

          <q-separator vertical />

          <main class="vm-list-main">
            <q-card-section class="vm-list-toolbar q-pa-none">
              <div class="row items-center q-gutter-sm no-wrap">
                <q-btn-dropdown no-caps outline size="12px" color="primary" class="u-button" :label="`${gettext('Bulk')} ${gettext('Actions')}`" :disable="!selectedRows.length || commandLoading">
                  <q-list dense>
                    <q-item v-close-popup clickable :disable="!canBulkPower" @click="bulkCommand('start')">
                      <q-item-section>{{ gettext('Bulk Start') }}</q-item-section>
                    </q-item>
                    <q-item v-close-popup clickable :disable="!canBulkPower" @click="bulkCommand('shutdown')">
                      <q-item-section>{{ gettext('Bulk Shutdown') }}</q-item-section>
                    </q-item>
                    <q-item v-close-popup clickable :disable="!canBulkPower" @click="bulkCommand('stop')">
                      <q-item-section>{{ gettext('Bulk Stop') }}</q-item-section>
                    </q-item>
                  </q-list>
                </q-btn-dropdown>
                <q-btn no-caps outline size="12px" color="primary" class="u-button" icon="sell" :label="gettext('Edit Tags')" :disable="!selectedRows.length" @click="openTags" />
                <q-space />
                <q-input v-model="search" dense outlined square clearable debounce="250" class="vm-search" :placeholder="gettext('Search')">
                  <template #prepend>
                    <q-icon name="search" size="18px" />
                  </template>
                </q-input>
                <q-btn flat dense round icon="refresh" :loading="loading" @click="reload">
                  <q-tooltip>{{ gettext('Refresh') }}</q-tooltip>
                </q-btn>
                <q-btn-dropdown flat dense round icon="settings" class="column-settings-btn">
                  <q-list dense>
                    <q-item v-for="column in columns" :key="column.name" tag="label" clickable>
                      <q-item-section side>
                        <q-checkbox v-model="visibleColumnNames" :val="column.name" dense />
                      </q-item-section>
                      <q-item-section>{{ column.label }}</q-item-section>
                    </q-item>
                  </q-list>
                </q-btn-dropdown>
              </div>
            </q-card-section>

            <q-table
              v-model:selected="selectedRows"
              v-model:pagination="pagination"
              class="vm-table"
              flat
              dense
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
              <template #body-cell-name="{ row }">
                <q-td>
                  <div class="vm-name-cell">
                    <q-icon name="inventory_2" size="18px" color="primary" />
                    <span class="vm-display-name-text ellipsis">{{ containerDisplayName(row) || '-' }}</span>
                    <q-badge v-if="row.template" outline color="primary" :label="gettext('Template')" />
                  </div>
                </q-td>
              </template>
              <template #body-cell-status="{ row }">
                <q-td>
                  <q-badge :color="statusColor(row.status)" :label="statusText(row.status)" />
                </q-td>
              </template>
              <template #body-cell-cpu="{ row }">
                <q-td>
                  <UsageProgress :value="cpuPercent(row)" />
                </q-td>
              </template>
              <template #body-cell-memory="{ row }">
                <q-td>
                  <UsageProgress :value="usagePercent(row.mem, row.maxmem)" />
                </q-td>
              </template>
              <template #body-cell-disk="{ row }">
                <q-td>
                  <UsageProgress :value="usagePercent(row.disk, row.maxdisk)" />
                </q-td>
              </template>
              <template #top-right>
                <div class="row items-center q-gutter-xs">
                  <q-btn dense flat round icon="play_arrow" color="positive" :disable="!canStart" @click.stop="requestCommand('start')">
                    <q-tooltip>{{ gettext('Start') }}</q-tooltip>
                  </q-btn>
                  <q-btn dense flat round icon="power_settings_new" color="warning" :disable="!canShutdown" @click.stop="requestCommand('shutdown')">
                    <q-tooltip>{{ gettext('Shutdown') }}</q-tooltip>
                  </q-btn>
                  <q-btn dense flat round icon="stop" color="negative" :disable="!canStop" @click.stop="requestCommand('stop')">
                    <q-tooltip>{{ gettext('Stop') }}</q-tooltip>
                  </q-btn>
                  <q-btn dense flat round icon="restart_alt" :disable="!canReboot" @click.stop="requestCommand('reboot')">
                    <q-tooltip>{{ gettext('Reboot') }}</q-tooltip>
                  </q-btn>
                  <q-btn dense flat round icon="pause" :disable="!canSuspend" @click.stop="requestCommand('suspend')">
                    <q-tooltip>{{ gettext('Suspend') }}</q-tooltip>
                  </q-btn>
                  <q-btn dense flat round icon="play_circle" :disable="!canResume" @click.stop="requestCommand('resume')">
                    <q-tooltip>{{ gettext('Resume') }}</q-tooltip>
                  </q-btn>
                  <q-btn dense flat round icon="backup" :disable="!canBackup" @click.stop="openBackup">
                    <q-tooltip>{{ gettext('Backup') }}</q-tooltip>
                  </q-btn>
                </div>
              </template>
            </q-table>
          </main>
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
  </div>
</template>

<style scoped>
.vm-list-page {
  min-height: calc(100vh - 86px);
}

.vm-list-card {
  border: 1px solid #e5e7eb;
}

.vm-list-layout {
  min-height: calc(100vh - 132px);
}

.vm-list-tree {
  width: 280px;
  min-width: 280px;
  background: #fff;
}

.vm-list-tree__header {
  padding: 0 12px 12px;
}

.vm-list-title {
  height: 36px;
  line-height: 36px;
  font-size: 16px;
  font-weight: 600;
  color: #1f2937;
}

.vm-list-tree__body {
  height: calc(100vh - 220px);
  padding: 8px 6px;
}

.vm-tree-node {
  min-width: 0;
  font-size: 13px;
}

.vm-list-main {
  min-width: 0;
  flex: 1;
  padding-left: 16px;
}

.vm-list-toolbar {
  margin-bottom: 12px;
}

.vm-search {
  width: 240px;
}

.vm-table {
  height: calc(100vh - 190px);
}

.vm-name-cell {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.vm-display-name-text {
  max-width: 220px;
  color: #2563eb;
  font-weight: 500;
}

.column-settings-btn :deep(.q-btn-dropdown__arrow),
.column-settings-btn :deep(.q-btn-dropdown__arrow-container) {
  display: none;
}

@media (max-width: 900px) {
  .vm-list-layout {
    flex-direction: column;
  }

  .vm-list-tree {
    width: 100%;
    min-width: 0;
  }

  .vm-list-tree__body {
    height: 220px;
  }

  .vm-list-main {
    padding-left: 0;
    padding-top: 12px;
  }

  .vm-search {
    width: 180px;
  }
}
</style>
