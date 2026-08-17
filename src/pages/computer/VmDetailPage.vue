<script setup lang="ts">
import { computed, onMounted, onUnmounted, shallowRef, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { createVmSnapshot, getVmConfig, getVmCurrent } from '@/api/overview';
import { getVmBackupDefaults, getVmSpiceProxy, runVmBackup, runVmPowerCommand, type VmPowerCommand, type VmResource } from '@/api/vm';
import type { PveRecord } from '@/api/resources';
import { getTaskLogs } from '@/api/maintenance';
import { getNodeStorage } from '@/api/storageContent';
import UWindow from '@/components/UWindow.vue';
import TaskOutputDialog from '@/components/TaskOutputDialog.vue';
import OverviewPage from '@/pages/computer/OverviewPage.vue';
import VmHardwareTab from '@/pages/computer/vm/VmHardwareTab.vue';
import VmOptionsTab from '@/pages/computer/vm/VmOptionsTab.vue';
import VmSnapshotsTab from '@/pages/computer/vm/VmSnapshotsTab.vue';
import VmBackupTab from '@/pages/computer/vm/VmBackupTab.vue';
import ReplicationTasksPanel from '@/pages/maintenance/components/ReplicationTasksPanel.vue';
import VmTaskHistoryTab from '@/pages/computer/vm/VmTaskHistoryTab.vue';
import VmMonitorTab from '@/pages/computer/vm/VmMonitorTab.vue';
import VmFirewallTab from '@/pages/computer/vm/VmFirewallTab.vue';
import VmPermissionsTab from '@/pages/computer/vm/VmPermissionsTab.vue';
import VmCloudInitTab from '@/pages/computer/vm/VmCloudInitTab.vue';
import VmResourceOperationDialog from '@/pages/computer/vm/VmResourceOperationDialog.vue';
import { gettext } from '@/locale';
import { useSessionStore } from '@/stores/session';
import { textValue } from '@/utils/pveFormat';
import { toChineseStr } from '@/utils/unicode';

const route = useRoute();
const router = useRouter();
const session = useSessionStore();
const node = computed(() => String(route.params.node || ''));
const vmid = computed(() => String(route.params.vmid || ''));
const loading = shallowRef(false);
const current = shallowRef<PveRecord>({});
const config = shallowRef<PveRecord>({});
const tab = shallowRef<
  | 'summary'
  | 'console'
  | 'hardware'
  | 'options'
  | 'cloudinit'
  | 'snapshots'
  | 'backup'
  | 'replication'
  | 'tasks'
  | 'monitor'
  | 'firewall'
  | 'permissions'
>('summary');
const refreshTimer = shallowRef<number>();
const taskDialogVisible = shallowRef(false);
const taskNode = shallowRef('');
const taskUpid = shallowRef('');
const taskTitle = shallowRef('');
const powerCommandLoading = shallowRef(false);
const confirmVisible = shallowRef(false);
const pendingCommand = shallowRef<VmPowerCommand>();
const stopVisible = shallowRef(false);
const stopOverruleAvailable = shallowRef(false);
const stopOverruleDisabled = shallowRef(false);
const stopOverruleShutdown = shallowRef(false);
const snapshotVisible = shallowRef(false);
const snapshotLoading = shallowRef(false);
const snapshotName = shallowRef('');
const snapshotDescription = shallowRef('');
const snapshotIncludeRam = shallowRef(false);
const snapshotGuestAgentEnabled = shallowRef(false);
const backupVisible = shallowRef(false);
const backupLoading = shallowRef(false);
const backupStorages = shallowRef<string[]>([]);
const backupStorageTypes = shallowRef<Record<string, string>>({});
const backupStorage = shallowRef('');
const backupMode = shallowRef<'snapshot' | 'suspend' | 'stop'>('snapshot');
const backupCompression = shallowRef<'zstd' | 'lzo' | 'gzip' | '0'>('zstd');
const backupProtected = shallowRef(false);
const backupNotificationMode = shallowRef<'notification-system' | 'legacy-sendmail'>('notification-system');
const backupMailto = shallowRef('');
const backupNotesTemplate = shallowRef('');
const backupPruneEnabled = shallowRef(false);
const backupRetention = shallowRef<Array<{ key: string; value: string }>>([]);
const operationDialogVisible = shallowRef(false);
const operation = shallowRef<'migrate' | 'clone' | 'delete' | 'template'>();
const consoleKey = shallowRef(0);
const configIdPattern = /^[a-z][a-z0-9_-]+$/i;

const name = computed(() => decodeVmName(current.value.name || config.value.name) || vmid.value);
const status = computed(() => textValue(current.value.status) || 'unknown');
const consoleUrl = computed(() => {
  if (tab.value !== 'console' || !node.value || !vmid.value) return '';
  const params = new URLSearchParams({
    console: 'kvm',
    novnc: '1',
    vmid: vmid.value,
    node: node.value,
    resize: 'scale',
    autoconnect: '1',
    reconnect: '1',
  });
  return `/?${params.toString()}`;
});
const qmpStatus = computed(() => textValue(current.value.qmpstatus));
const lock = computed(() => textValue(current.value.lock));
const canSpice = computed(() => Boolean(current.value.spice));
const canXterm = computed(() => Boolean(current.value.serial));
const isTemplate = computed(() => Boolean(current.value.template || config.value.template));
const vmCaps = computed(
  () => (session.caps as unknown as { vms?: Record<string, unknown> }).vms || {},
);
const nodeCaps = computed(
  () => (session.caps as unknown as { nodes?: Record<string, unknown> }).nodes || {},
);
const canViewConsole = computed(() => Boolean(vmCaps.value['VM.Console']) && !isTemplate.value);
const canViewMonitor = computed(() => Boolean(nodeCaps.value['Sys.Audit']) && !isTemplate.value);
const canViewBackup = computed(() => Boolean(vmCaps.value['VM.Backup']));
const canSnapshotAction = computed(() => Boolean(vmCaps.value['VM.Snapshot']) && !isTemplate.value);
const canBackupAction = computed(() => Boolean(vmCaps.value['VM.Backup']));
const backupPruneAvailable = computed(() => backupRetention.value.length > 0);
const canViewSnapshots = computed(
  () =>
    !isTemplate.value &&
    Boolean(
      vmCaps.value['VM.Snapshot'] ||
      vmCaps.value['VM.Snapshot.Rollback'] ||
      vmCaps.value['VM.Audit'],
    ),
);
const canViewFirewall = computed(() => Boolean(vmCaps.value['VM.Audit']));
const canManagePermissions = computed(() => Boolean(vmCaps.value['Permissions.Modify']));
const canPowerManage = computed(() => Boolean(vmCaps.value['VM.PowerMgmt']) && !isTemplate.value);
const resumeState = computed(
  () =>
    ['prelaunch', 'paused', 'suspended'].includes(qmpStatus.value) || lock.value === 'suspended',
);
const guestRunning = computed(
  () => status.value === 'running' && !['shutdown', 'prelaunch'].includes(qmpStatus.value),
);
const canStart = computed(() => canPowerManage.value && !resumeState.value && !guestRunning.value);
const canShutdown = computed(() => canPowerManage.value && status.value === 'running');
const canStop = computed(() => canPowerManage.value && status.value !== 'stopped');
const canSuspend = computed(() => canPowerManage.value && status.value === 'running');
const canResume = computed(() => canPowerManage.value && resumeState.value);
const canMigrate = computed(() => Boolean(vmCaps.value['VM.Migrate']) && !isTemplate.value);
const canClone = computed(() => Boolean(vmCaps.value['VM.Clone']));
const canDelete = computed(() => Boolean(vmCaps.value['VM.Allocate']));
const canConvertTemplate = computed(
  () => Boolean(vmCaps.value['VM.Allocate']) && !isTemplate.value,
);
const detailVm = computed<VmResource>(() => ({
  id: `qemu/${vmid.value}`,
  type: 'qemu',
  node: node.value,
  vmid: vmid.value,
  name: name.value,
  status: status.value,
  template: isTemplate.value ? 1 : 0,
}));
function statusText(value: string) {
  if (value === 'running') return gettext('Running');
  if (value === 'stopped') return gettext('Stopped');
  return gettext('Unknown');
}

function statusColor(value: string) {
  if (value === 'running') return 'green';
  if (value === 'stopped') return 'red';
  return 'grey';
}

function decodeVmName(value: unknown) {
  const rawName = textValue(value);
  if (!rawName) return '';
  try {
    return toChineseStr(rawName);
  } catch {
    return rawName;
  }
}

async function reload() {
  if (!node.value || !vmid.value) return;
  loading.value = true;
  try {
    const [currentResponse, configResponse] = await Promise.all([
      getVmCurrent(node.value, vmid.value),
      getVmConfig(node.value, vmid.value),
    ]);
    current.value = currentResponse.data || {};
    config.value = configResponse.data || {};
  } finally {
    loading.value = false;
  }
}

async function reloadCurrent() {
  if (!node.value || !vmid.value) return;
  const response = await getVmCurrent(node.value, vmid.value);
  current.value = response.data || {};
}

async function runPowerCommand(command: VmPowerCommand, data?: Record<string, unknown>) {
  if (!node.value || !vmid.value) return;
  powerCommandLoading.value = true;
  try {
    const response = await runVmPowerCommand(node.value, vmid.value, command, data);
    if (response.data) openTask(node.value, response.data, `${name.value}: ${gettext(command)}`);
    await reload();
  } finally {
    powerCommandLoading.value = false;
  }
}

function commandLabel(command?: VmPowerCommand) {
  if (command === 'suspend') return gettext('Pause');
  return command ? gettext(command.charAt(0).toUpperCase() + command.slice(1)) : '';
}

function guestAgentEnabled(agent: unknown) {
  const value = textValue(agent).trim();
  if (!value) return false;
  const enabled = value.split(',').find((part) => part.trim().startsWith('enabled='));
  const raw = enabled ? enabled.split('=', 2)[1] : value.split(',', 1)[0];
  return ['1', 'yes', 'true', 'on'].includes(String(raw).trim().toLowerCase());
}

function parseBackupRetention(value: unknown) {
  const entries = Object.fromEntries(textValue(value).split(',').map((part) => part.trim().split('=', 2)).filter(([key, item]) => Boolean(key) && item !== undefined));
  if (entries['keep-all'] === '1') return [];
  return ['keep-last', 'keep-hourly', 'keep-daily', 'keep-weekly', 'keep-monthly', 'keep-yearly']
    .filter((key) => entries[key] !== undefined && entries[key] !== '' && entries[key] !== '0')
    .map((key) => ({ key, value: entries[key] }));
}

function requestCommand(command: VmPowerCommand) {
  pendingCommand.value = command;
  confirmVisible.value = true;
}

async function confirmCommand() {
  if (!pendingCommand.value) return;
  await runPowerCommand(pendingCommand.value);
  confirmVisible.value = false;
}

async function openStop() {
  stopOverruleAvailable.value = false;
  stopOverruleDisabled.value = false;
  stopOverruleShutdown.value = false;
  const haState = textValue(current.value.hastate);
  const haEnabled = Boolean(haState && haState !== 'unmanaged');
  const canManageNode = Boolean(nodeCaps.value['Sys.Modify']);
  const tasks = await getTaskLogs().catch(() => null);
  const activeShutdown = Boolean(tasks?.data?.some((task) => String(task.id) === vmid.value && task.status === undefined && task.type === 'qmshutdown' && (canManageNode || task.user === session.userid)));
  stopOverruleAvailable.value = canManageNode || activeShutdown;
  stopOverruleDisabled.value = haEnabled;
  stopOverruleShutdown.value = !haEnabled && activeShutdown;
  stopVisible.value = true;
}

async function confirmStop() {
  await runPowerCommand('stop', stopOverruleAvailable.value && !stopOverruleDisabled.value && stopOverruleShutdown.value ? { 'overrule-shutdown': 1 } : undefined);
  stopVisible.value = false;
}

function openSnapshot() {
  snapshotName.value = `snapshot-${new Date().toISOString().slice(0, 16).replace(/[-T:]/g, '')}`;
  snapshotDescription.value = '';
  snapshotIncludeRam.value = status.value === 'running';
  snapshotGuestAgentEnabled.value = status.value === 'running' && guestAgentEnabled(config.value.agent);
  snapshotVisible.value = true;
}

async function createSnapshot() {
  const snapname = snapshotName.value.trim();
  if (!node.value || !vmid.value || !configIdPattern.test(snapname)) return;
  snapshotLoading.value = true;
  try {
    const response = await createVmSnapshot(node.value, vmid.value, { snapname, ...(snapshotDescription.value.trim() ? { description: snapshotDescription.value.trim() } : {}), ...(status.value === 'running' && snapshotIncludeRam.value ? { vmstate: 1 } : {}) });
    snapshotVisible.value = false;
    if (response.data) openTask(node.value, response.data, gettext('Take Snapshot'));
  } finally { snapshotLoading.value = false; }
}

async function applyBackupDefaults(storage: string) {
  backupMode.value = 'snapshot'; backupCompression.value = 'zstd'; backupProtected.value = false; backupNotificationMode.value = 'notification-system'; backupMailto.value = ''; backupNotesTemplate.value = ''; backupPruneEnabled.value = false; backupRetention.value = [];
  if (!storage || !node.value) return;
  const response = await getVmBackupDefaults(node.value, storage);
  const defaults = response.data || {};
  if (['snapshot', 'suspend', 'stop'].includes(textValue(defaults.mode))) backupMode.value = defaults.mode as typeof backupMode.value;
  backupMailto.value = textValue(defaults.mailto);
  const notificationMode = textValue(defaults['notification-mode']);
  backupNotificationMode.value = notificationMode === 'legacy-sendmail' || (notificationMode === 'auto' && backupMailto.value) ? 'legacy-sendmail' : 'notification-system';
  backupNotesTemplate.value = textValue(defaults['notes-template']);
  backupRetention.value = parseBackupRetention(defaults['prune-backups']);
}

async function openBackup() {
  if (!node.value) return;
  backupLoading.value = true;
  try {
    const response = await getNodeStorage(node.value, 'backup');
    backupStorages.value = (response.data || []).map((item) => textValue(item.storage)).filter(Boolean);
    backupStorageTypes.value = Object.fromEntries((response.data || []).map((item) => [textValue(item.storage), textValue(item.type)]));
    backupStorage.value = backupStorages.value[0] || '';
    await applyBackupDefaults(backupStorage.value);
    backupVisible.value = true;
  } finally { backupLoading.value = false; }
}

async function backupNow() {
  if (!node.value || !vmid.value || !backupStorage.value) return;
  backupLoading.value = true;
  try {
    const response = await runVmBackup(node.value, vmid.value, { storage: backupStorage.value, mode: backupMode.value, compress: backupCompression.value, protected: backupProtected.value ? 1 : 0, 'notification-mode': backupNotificationMode.value, ...(backupMailto.value.trim() ? { mailto: backupMailto.value.trim() } : {}), ...(backupNotesTemplate.value.trim() ? { 'notes-template': backupNotesTemplate.value.trim() } : {}), remove: backupPruneAvailable.value && backupPruneEnabled.value ? 1 : 0 });
    backupVisible.value = false;
    if (response.data) openTask(node.value, response.data, gettext('Backup'));
  } finally { backupLoading.value = false; }
}

function openOperation(nextOperation: 'migrate' | 'clone' | 'delete' | 'template') {
  operation.value = nextOperation;
  operationDialogVisible.value = true;
}

function openTask(taskNodeValue: string, upid: string, title: string) {
  taskNode.value = taskNodeValue;
  taskUpid.value = upid;
  taskTitle.value = title;
  taskDialogVisible.value = true;
}

function openConsole(type: 'noVNC' | 'xterm.js') {
  const params = new URLSearchParams({
    console: 'kvm',
    node: node.value,
    vmid: vmid.value,
    vmname: name.value,
    cmd: '',
  });
  if (type === 'noVNC') {
    params.set('novnc', '1');
    params.set('resize', 'scale');
    params.set('autoconnect', '1');
    params.set('reconnect', '1');
    window.open(
      `/?${params.toString()}`,
      `vm-console-${vmid.value}`,
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

function openDefaultConsole() {
  openConsole('noVNC');
}

async function downloadSpice() {
  loading.value = true;
  try {
    const response = await getVmSpiceProxy(node.value, vmid.value, window.location.hostname);
    const content = [
      '[virt-viewer]',
      ...Object.entries(response.data || {}).map(([key, value]) => `${key}=${value}`),
    ].join('\n');
    const url = URL.createObjectURL(new Blob([content], { type: 'application/x-virt-viewer' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${name.value}.vv`;
    anchor.click();
    URL.revokeObjectURL(url);
  } finally {
    loading.value = false;
  }
}

onMounted(() => {
  void reload();
  refreshTimer.value = window.setInterval(() => {
    void reloadCurrent();
  }, 1_000);
});

watch(qmpStatus, (nextStatus, previousStatus) => {
  if (['prelaunch', 'stopped', 'suspended'].includes(previousStatus) && nextStatus === 'running') {
    consoleKey.value += 1;
  }
});

onUnmounted(() => {
  if (refreshTimer.value) window.clearInterval(refreshTimer.value);
});
</script>

<template>
  <div class="q-ma-md vm-detail-page">
    <section class="vm-detail">
      <header class="vm-detail__header row items-center no-wrap">
        <q-btn
          flat
          dense
          round
          icon="arrow_back"
          color="primary"
          size="sm"
          class="q-mr-sm"
          :aria-label="gettext('Back')"
          @click="router.push('/computer/list')"
        />
        <q-icon
          :name="isTemplate ? 'article' : 'desktop_windows'"
          size="21px"
          color="primary"
          class="q-mr-sm"
        />
        <div class="vm-detail__title">
          <span class="vm-detail__title-name">{{ `${name} · ${vmid}` }}</span>
        </div>
        <q-badge class="q-ml-sm" :color="statusColor(status)" :label="statusText(status)" />
        <q-space />
        <div class="row q-gutter-sm no-wrap">
          <q-btn-dropdown
            no-caps
            outline
            size="12px"
            color="primary"
            class="u-button"
            :label="gettext('Power')"
            :disable="!canPowerManage || powerCommandLoading"
          >
            <q-list dense>
              <q-item
                v-if="!resumeState"
                v-close-popup
                clickable
                :disable="!canStart"
                @click="requestCommand('start')"
                ><q-item-section>{{ gettext('Start') }}</q-item-section></q-item
              >
              <q-item
                v-close-popup
                clickable
                :disable="!canShutdown"
                @click="requestCommand('shutdown')"
                ><q-item-section>{{ gettext('Shutdown') }}</q-item-section></q-item
              >
              <q-item v-close-popup clickable :disable="!canStop" @click="openStop"
                ><q-item-section class="text-red">{{ gettext('Stop') }}</q-item-section></q-item
              >
              <q-item
                v-close-popup
                clickable
                :disable="!canShutdown"
                @click="requestCommand('reboot')"
                ><q-item-section>{{ gettext('Reboot') }}</q-item-section></q-item
              >
              <q-item
                v-close-popup
                clickable
                :disable="!canSuspend"
                @click="requestCommand('suspend')"
                ><q-item-section>{{ gettext('Pause') }}</q-item-section></q-item
              >
              <q-item
                v-close-popup
                clickable
                :disable="!canSuspend"
                @click="runPowerCommand('suspend', { todisk: 1 })"
                ><q-item-section>{{ gettext('Hibernate') }}</q-item-section></q-item
              >
              <q-item
                v-close-popup
                clickable
                :disable="!canResume"
                @click="requestCommand('resume')"
                ><q-item-section>{{ gettext('Resume') }}</q-item-section></q-item
              >
              <q-item v-close-popup clickable :disable="!canStop" @click="requestCommand('reset')"
                ><q-item-section>{{ gettext('Reset') }}</q-item-section></q-item
              >
            </q-list>
          </q-btn-dropdown>
          <q-btn-dropdown
            split
            no-caps
            outline
            size="12px"
            color="primary"
            class="u-button"
            :label="gettext('Console')"
            :disable="!canViewConsole || powerCommandLoading"
            @click="openDefaultConsole"
          >
            <q-list dense>
              <q-item v-close-popup clickable @click="openConsole('noVNC')"
                ><q-item-section>noVNC</q-item-section></q-item
              >
              <q-item v-close-popup clickable :disable="!canSpice" @click="downloadSpice"
                ><q-item-section>SPICE</q-item-section></q-item
              >
              <q-item v-close-popup clickable :disable="!canXterm" @click="openConsole('xterm.js')"
                ><q-item-section>xterm.js</q-item-section></q-item
              >
            </q-list>
          </q-btn-dropdown>
          <q-btn-dropdown
            no-caps
            outline
            size="12px"
            color="primary"
            class="u-button"
            :label="gettext('More')"
          >
            <q-list dense>
              <q-item
                v-close-popup
                clickable
                :disable="!canMigrate"
                @click="openOperation('migrate')"
                ><q-item-section>{{ gettext('Migrate') }}</q-item-section></q-item
              >
              <q-item v-close-popup clickable :disable="!canClone" @click="openOperation('clone')"
                ><q-item-section>{{ gettext('Clone') }}</q-item-section></q-item
              >
              <q-item
                v-close-popup
                clickable
                :disable="!canSnapshotAction"
                @click="openSnapshot"
                ><q-item-section>{{ gettext('Take Snapshot') }}</q-item-section></q-item
              >
              <q-item v-close-popup clickable :disable="!canBackupAction" @click="openBackup"
                ><q-item-section>{{ gettext('Backup now') }}</q-item-section></q-item
              >
              <q-item
                v-close-popup
                clickable
                :disable="!canConvertTemplate"
                @click="openOperation('template')"
                ><q-item-section>{{ gettext('Convert to template') }}</q-item-section></q-item
              >
              <q-separator />
              <q-item v-close-popup clickable :disable="!canDelete" @click="openOperation('delete')"
                ><q-item-section class="text-red">{{ gettext('Delete') }}</q-item-section></q-item
              >
            </q-list>
          </q-btn-dropdown>
        </div>
        <q-btn
          flat
          dense
          round
          icon="refresh"
          color="primary"
          size="sm"
          :aria-label="gettext('Refresh')"
          :loading="loading"
          @click="reload"
        />
      </header>
      <q-tabs
        v-model="tab"
        dense
        align="left"
        active-color="primary"
        indicator-color="primary"
        class="vm-detail-tabs"
      >
        <q-tab name="summary" icon="summarize" :label="gettext('Summary')" />
        <q-tab v-if="canViewConsole" name="console" icon="terminal" :label="gettext('Console')" />
        <q-tab name="hardware" icon="memory" :label="gettext('Hardware')" />
        <q-tab name="options" icon="settings" :label="gettext('Options')" />
        <q-tab name="cloudinit" icon="cloud" :label="gettext('Cloud-Init')" />
        <q-tab
          v-if="canViewSnapshots"
          name="snapshots"
          icon="camera"
          :label="gettext('Snapshots')"
        />
        <q-tab v-if="canViewBackup" name="backup" icon="backup" :label="gettext('Backup')" />
        <q-tab
          v-if="canViewBackup"
          name="replication"
          icon="sync"
          :label="gettext('Replication')"
        />
        <q-tab name="tasks" icon="history" :label="gettext('Task History')" />
        <q-tab
          v-if="canViewMonitor"
          name="monitor"
          icon="monitor"
          class="vm-detail-tabs__monitor"
          :label="gettext('Monitor')"
        />
        <q-tab
          v-if="canViewFirewall"
          name="firewall"
          icon="security"
          :label="gettext('Firewall')"
        />
        <q-tab
          v-if="canManagePermissions"
          name="permissions"
          icon="manage_accounts"
          :label="gettext('Permissions')"
        />
      </q-tabs>
      <q-separator />
      <q-tab-panels v-model="tab" animated>
        <q-tab-panel name="summary" class="q-pa-none">
          <OverviewPage
            :fixed-node="node"
            :fixed-vmid="vmid"
            :current-status="current"
            :template="isTemplate"
            hide-vm-selector
          />
        </q-tab-panel>
        <q-tab-panel v-if="canViewConsole" name="console" class="q-pa-none">
          <iframe
            v-if="consoleUrl"
            :key="consoleKey"
            :src="consoleUrl"
            class="vm-console"
            frameborder="0"
            :title="`${name} ${gettext('Console')}`"
          />
        </q-tab-panel>
        <q-tab-panel name="hardware" class="q-pa-none vm-config-tab-panel"
          ><VmHardwareTab
            :node="node"
            :vmid="vmid"
            :config="config"
            :running="status === 'running'"
            @updated="reload"
            @task="openTask"
        /></q-tab-panel>
        <q-tab-panel name="options" class="q-pa-none vm-config-tab-panel"
          ><VmOptionsTab :node="node" :vmid="vmid" :config="config" @updated="reload"
        /></q-tab-panel>
        <q-tab-panel name="cloudinit" class="q-pa-none"
          ><VmCloudInitTab :node="node" :vmid="vmid" :config="config" @updated="reload"
        /></q-tab-panel>
        <q-tab-panel v-if="canViewSnapshots" name="snapshots" class="q-pa-none"
          ><VmSnapshotsTab
            :node="node"
            :vmid="vmid"
            :running="status === 'running'"
            @task="openTask"
        /></q-tab-panel>
        <q-tab-panel v-if="canViewBackup" name="backup" class="q-pa-none"
          ><VmBackupTab :node="node" :vmid="vmid" @task="openTask"
        /></q-tab-panel>
        <q-tab-panel v-if="canViewBackup" name="replication" class="q-pa-none"
          ><ReplicationTasksPanel :node="node" :vmid="vmid" embedded
        /></q-tab-panel>
        <q-tab-panel name="tasks" class="q-pa-none"
          ><VmTaskHistoryTab :node="node" :vmid="vmid" @task="openTask"
        /></q-tab-panel>
        <q-tab-panel v-if="canViewMonitor" name="monitor" class="q-pa-none"
          ><VmMonitorTab :node="node" :vmid="vmid"
        /></q-tab-panel>
        <q-tab-panel v-if="canViewFirewall" name="firewall" class="q-pa-none"
          ><VmFirewallTab :node="node" :vmid="vmid"
        /></q-tab-panel>
        <q-tab-panel v-if="canManagePermissions" name="permissions" class="q-pa-none"
          ><VmPermissionsTab :vmid="vmid"
        /></q-tab-panel>
      </q-tab-panels>
    </section>
    <q-dialog v-model="confirmVisible" persistent>
      <UWindow :title="gettext('Confirm')" width="420px" :loading="powerCommandLoading">
        <div class="q-pa-md">{{ `${gettext('Are you sure you want to')} ${commandLabel(pendingCommand)}: ${name} ?` }}</div>
        <template #foot><q-btn v-close-popup no-caps flat size="12px" class="u-button" :label="gettext('Cancel')" /><q-btn no-caps flat size="12px" class="bg-primary text-grey-1 u-button" :loading="powerCommandLoading" :label="commandLabel(pendingCommand)" @click="confirmCommand" /></template>
      </UWindow>
    </q-dialog>
    <q-dialog v-model="stopVisible" persistent>
      <UWindow :title="gettext('Confirm')" width="420px" :loading="powerCommandLoading">
        <div class="q-pa-md q-gutter-md"><div>{{ `${gettext('Are you sure you want to')} ${gettext('Stop')}: ${name} ?` }}</div><q-checkbox v-if="stopOverruleAvailable" v-model="stopOverruleShutdown" dense color="primary" :disable="stopOverruleDisabled" :label="gettext('Overrule active shutdown tasks')" /></div>
        <template #foot><q-btn v-close-popup no-caps flat size="12px" class="u-button" :label="gettext('Cancel')" /><q-btn no-caps flat size="12px" class="bg-primary text-grey-1 u-button" :loading="powerCommandLoading" :label="gettext('Stop')" @click="confirmStop" /></template>
      </UWindow>
    </q-dialog>
    <q-dialog v-model="snapshotVisible" persistent>
      <UWindow :title="gettext('Take Snapshot')" width="520px" :loading="snapshotLoading">
        <div class="q-pa-md q-gutter-md"><q-input v-model="snapshotName" dense square outlined :label="gettext('Name')" /><q-input v-model="snapshotDescription" dense square outlined type="textarea" autogrow :label="gettext('Description')" /><q-checkbox v-if="status === 'running'" v-model="snapshotIncludeRam" dense color="primary" :label="gettext('Include RAM')" /><div v-if="status === 'running' && !snapshotIncludeRam && !snapshotGuestAgentEnabled" class="text-warning text-caption">{{ gettext('It is recommended to either include the RAM or use the QEMU Guest Agent when taking a snapshot of a running VM to avoid inconsistencies.') }}</div></div>
        <template #foot><q-btn v-close-popup no-caps outline size="12px" class="u-button" :label="gettext('Cancel')" /><q-btn no-caps flat size="12px" class="bg-primary text-grey-1 u-button" :disable="!configIdPattern.test(snapshotName.trim())" :loading="snapshotLoading" :label="gettext('Take Snapshot')" @click="createSnapshot" /></template>
      </UWindow>
    </q-dialog>
    <q-dialog v-model="backupVisible" persistent>
      <UWindow :title="gettext('Backup')" width="560px" :loading="backupLoading">
        <div class="q-pa-md q-gutter-md"><q-select v-model="backupStorage" dense square outlined :options="backupStorages" :label="gettext('Storage')" @update:model-value="applyBackupDefaults(backupStorage)" /><q-select v-model="backupMode" dense square outlined emit-value map-options :options="[{ label: gettext('Snapshot'), value: 'snapshot' }, { label: gettext('Pause'), value: 'suspend' }, { label: gettext('Stop'), value: 'stop' }]" :label="gettext('Mode')" /><q-select v-model="backupCompression" dense square outlined emit-value map-options :disable="backupStorageTypes[backupStorage] === 'pbs'" :options="[{ label: 'ZSTD', value: 'zstd' }, { label: 'LZO', value: 'lzo' }, { label: 'GZIP', value: 'gzip' }, { label: gettext('None'), value: '0' }]" :label="gettext('Compression')" /><q-checkbox v-model="backupProtected" dense color="primary" :label="gettext('Protected')" /><q-select v-model="backupNotificationMode" dense square outlined emit-value map-options :options="[{ label: gettext('Notification System'), value: 'notification-system' }, { label: gettext('Legacy sendmail'), value: 'legacy-sendmail' }]" :label="gettext('Notification')" /><q-input v-model="backupMailto" dense square outlined :label="gettext('Send email to')" /><q-checkbox v-if="backupPruneAvailable" v-model="backupPruneEnabled" dense color="primary" :label="gettext('Prune')" /><div v-if="backupPruneAvailable" class="text-caption text-grey-7"><div v-for="entry in backupRetention" :key="entry.key">{{ `${entry.key}: ${entry.value}` }}</div></div><q-input v-model="backupNotesTemplate" dense square outlined type="textarea" autogrow :label="gettext('Notes')" /></div>
        <template #foot><q-btn v-close-popup no-caps outline size="12px" class="u-button" :label="gettext('Cancel')" /><q-btn no-caps flat size="12px" class="bg-primary text-grey-1 u-button" :disable="!backupStorage" :loading="backupLoading" :label="gettext('Backup')" @click="backupNow" /></template>
      </UWindow>
    </q-dialog>
    <VmResourceOperationDialog
      v-model="operationDialogVisible"
      :operation="operation"
      :vm="detailVm"
      @completed="reload"
      @task="({ node: taskNodeValue, upid, title }) => openTask(taskNodeValue, upid, title)"
    />
    <TaskOutputDialog
      v-model="taskDialogVisible"
      :node="taskNode"
      :upid="taskUpid"
      :title="taskTitle"
      @finished="reload"
    />
  </div>
</template>

<style scoped>
.vm-detail {
  min-height: calc(100vh - 154px);
  overflow: hidden;
  background: #fff;
  border: 1px solid #dfe1e6;
  border-radius: 8px;
  box-shadow: 0 2px 10px rgba(34, 51, 84, 0.05);
}
.vm-detail__header {
  min-height: 62px;
  padding: 0 16px;
  background: linear-gradient(90deg, #f8fbff 0%, #fff 44%);
  border-bottom: 1px solid #e5eaf1;
}
.vm-detail__title {
  color: #1f2937;
  font-size: 16px;
  font-weight: 600;
}
.vm-detail__title-name {
  margin-left: 10px;
  color: var(--q-primary);
  font-weight: 500;
}
.vm-detail-tabs {
  padding: 2px 8px 0;
}
.vm-detail-tabs :deep(.q-tabs__arrow) {
  display: none !important;
}
.vm-detail-tabs :deep(.q-tab) {
  padding: 0 10px;
  min-height: 40px;
}
.vm-detail-tabs :deep(.q-tab__content) {
  align-items: center;
}
.vm-detail-tabs :deep(.q-tab__icon) {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
}
.vm-console {
  width: 100%;
  height: calc(100vh - 250px);
  min-height: 500px;
  border: 0;
}
</style>
