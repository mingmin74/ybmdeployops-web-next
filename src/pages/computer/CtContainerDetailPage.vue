<script setup lang="ts">
import { computed, onMounted, onUnmounted, shallowRef } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { getVmConfig, getVmCurrent } from '@/api/overview';
import { runCtPowerCommand, type VmPowerCommand } from '@/api/vm';
import type { PveRecord } from '@/api/resources';
import TaskOutputDialog from '@/components/TaskOutputDialog.vue';
import { gettext } from '@/locale';
import { useSessionStore } from '@/stores/session';
import { textValue } from '@/utils/pveFormat';
import { toChineseStr } from '@/utils/unicode';

type ContainerTab =
  | 'summary'
  | 'console'
  | 'resources'
  | 'network'
  | 'dns'
  | 'options'
  | 'snapshots'
  | 'backup'
  | 'replication'
  | 'tasks'
  | 'monitor'
  | 'firewall'
  | 'permissions';

const route = useRoute();
const router = useRouter();
const session = useSessionStore();
const node = computed(() => String(route.params.node || ''));
const vmid = computed(() => String(route.params.vmid || ''));
const loading = shallowRef(false);
const current = shallowRef<PveRecord>({});
const config = shallowRef<PveRecord>({});
const tab = shallowRef<ContainerTab>('summary');
const refreshTimer = shallowRef<number>();
const taskDialogVisible = shallowRef(false);
const taskNode = shallowRef('');
const taskUpid = shallowRef('');
const taskTitle = shallowRef('');
const powerCommandLoading = shallowRef(false);

const name = computed(() => decodeContainerName(current.value.name || config.value.hostname || config.value.name) || vmid.value);
const status = computed(() => textValue(current.value.status) || 'unknown');
const isTemplate = computed(() => Boolean(config.value.template));
const vmCaps = computed(
  () => (session.caps as unknown as { vms?: Record<string, unknown> }).vms || {},
);
const nodeCaps = computed(
  () => (session.caps as unknown as { nodes?: Record<string, unknown> }).nodes || {},
);
const canViewConsole = computed(() => Boolean(vmCaps.value['VM.Console']) && !isTemplate.value);
const canViewBackup = computed(() => Boolean(vmCaps.value['VM.Backup']));
const canViewSnapshots = computed(
  () =>
    !isTemplate.value &&
    Boolean(
      vmCaps.value['VM.Snapshot'] ||
      vmCaps.value['VM.Snapshot.Rollback'] ||
      vmCaps.value['VM.Audit'],
    ),
);
const canViewMonitor = computed(() => Boolean(nodeCaps.value['Sys.Audit']) && !isTemplate.value);
const canViewFirewall = computed(() => Boolean(vmCaps.value['VM.Audit']));
const canManagePermissions = computed(() => Boolean(vmCaps.value['Permissions.Modify']));
const canPowerManage = computed(() => Boolean(vmCaps.value['VM.PowerMgmt']) && !isTemplate.value);
const canStart = computed(() => canPowerManage.value && status.value === 'stopped');
const canShutdown = computed(() => canPowerManage.value && status.value === 'running');
const canStop = computed(() => canPowerManage.value && status.value !== 'stopped');
const canSuspend = computed(() => canPowerManage.value && status.value === 'running');
const canResume = computed(() => canPowerManage.value && status.value === 'suspended');
const visibleTabs = computed<Array<{ name: ContainerTab; icon: string; label: string }>>(() => [
  { name: 'summary', icon: 'summarize', label: gettext('Summary') },
  ...(canViewConsole.value ? [{ name: 'console' as const, icon: 'terminal', label: gettext('Console') }] : []),
  { name: 'resources', icon: 'memory', label: gettext('Resources') },
  { name: 'network', icon: 'lan', label: gettext('Network') },
  { name: 'dns', icon: 'dns', label: 'DNS' },
  { name: 'options', icon: 'settings', label: gettext('Options') },
  ...(canViewSnapshots.value ? [{ name: 'snapshots' as const, icon: 'camera', label: gettext('Snapshots') }] : []),
  ...(canViewBackup.value ? [{ name: 'backup' as const, icon: 'backup', label: gettext('Backup') }] : []),
  ...(canViewBackup.value ? [{ name: 'replication' as const, icon: 'sync', label: gettext('Replication') }] : []),
  { name: 'tasks', icon: 'history', label: gettext('Task History') },
  ...(canViewMonitor.value ? [{ name: 'monitor' as const, icon: 'monitor', label: gettext('Monitor') }] : []),
  ...(canViewFirewall.value ? [{ name: 'firewall' as const, icon: 'security', label: gettext('Firewall') }] : []),
  ...(canManagePermissions.value ? [{ name: 'permissions' as const, icon: 'manage_accounts', label: gettext('Permissions') }] : []),
]);

function statusText(value: string) {
  if (value === 'running') return gettext('Running');
  if (value === 'stopped') return gettext('Stopped');
  if (value === 'paused' || value === 'suspended') return gettext('Suspended');
  return gettext('Unknown');
}

function statusColor(value: string) {
  if (value === 'running') return 'green';
  if (value === 'stopped') return 'red';
  if (value === 'paused' || value === 'suspended') return 'orange';
  return 'grey';
}

function decodeContainerName(value: unknown) {
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
      getVmCurrent(node.value, vmid.value, 'lxc'),
      getVmConfig(node.value, vmid.value, 'lxc'),
    ]);
    current.value = currentResponse.data || {};
    config.value = configResponse.data || {};
  } finally {
    loading.value = false;
  }
}

async function runPowerCommand(command: VmPowerCommand, data?: Record<string, unknown>) {
  if (!node.value || !vmid.value) return;
  powerCommandLoading.value = true;
  try {
    const response = await runCtPowerCommand(node.value, vmid.value, command, data);
    if (response.data) openTask(node.value, response.data, `${name.value}: ${gettext(command)}`);
    await reload();
  } finally {
    powerCommandLoading.value = false;
  }
}

function openTask(taskNodeValue: string, upid: string, title: string) {
  taskNode.value = taskNodeValue;
  taskUpid.value = upid;
  taskTitle.value = title;
  taskDialogVisible.value = true;
}

function openConsole(type: 'noVNC' | 'xterm.js') {
  const params = new URLSearchParams({
    console: 'lxc',
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
      `ct-console-${vmid.value}`,
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

onMounted(() => {
  void reload();
  refreshTimer.value = window.setInterval(() => {
    void reload();
  }, 10_000);
});

onUnmounted(() => {
  if (refreshTimer.value) window.clearInterval(refreshTimer.value);
});
</script>

<template>
  <div class="q-ma-md ct-detail-page">
    <section class="ct-detail">
      <header class="ct-detail__header row items-center no-wrap">
        <q-btn
          flat
          dense
          round
          icon="arrow_back"
          color="primary"
          size="sm"
          class="q-mr-sm"
          :aria-label="gettext('Back')"
          @click="router.push('/computer/ct-container')"
        />
        <q-icon
          :name="isTemplate ? 'article' : 'inventory_2'"
          size="21px"
          color="primary"
          class="q-mr-sm"
        />
        <div class="ct-detail__title">
          <span class="ct-detail__title-name">{{ `${name} · ${vmid}` }}</span>
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
              <q-item v-close-popup clickable :disable="!canStart" @click="runPowerCommand('start')">
                <q-item-section>{{ gettext('Start') }}</q-item-section>
              </q-item>
              <q-item v-close-popup clickable :disable="!canShutdown" @click="runPowerCommand('shutdown')">
                <q-item-section>{{ gettext('Shutdown') }}</q-item-section>
              </q-item>
              <q-item v-close-popup clickable :disable="!canStop" @click="runPowerCommand('stop')">
                <q-item-section class="text-red">{{ gettext('Stop') }}</q-item-section>
              </q-item>
              <q-item v-close-popup clickable :disable="!canShutdown" @click="runPowerCommand('reboot')">
                <q-item-section>{{ gettext('Reboot') }}</q-item-section>
              </q-item>
              <q-item v-close-popup clickable :disable="!canSuspend" @click="runPowerCommand('suspend')">
                <q-item-section>{{ gettext('Suspend') }}</q-item-section>
              </q-item>
              <q-item v-close-popup clickable :disable="!canResume" @click="runPowerCommand('resume')">
                <q-item-section>{{ gettext('Resume') }}</q-item-section>
              </q-item>
            </q-list>
          </q-btn-dropdown>
          <q-btn-dropdown
            no-caps
            outline
            size="12px"
            color="primary"
            class="u-button"
            :label="gettext('Console')"
            :disable="!canViewConsole || powerCommandLoading"
          >
            <q-list dense>
              <q-item v-close-popup clickable @click="openConsole('noVNC')">
                <q-item-section>noVNC</q-item-section>
              </q-item>
              <q-item v-close-popup clickable @click="openConsole('xterm.js')">
                <q-item-section>xterm.js</q-item-section>
              </q-item>
            </q-list>
          </q-btn-dropdown>
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
        </div>
      </header>

      <q-tabs
        v-model="tab"
        dense
        align="left"
        active-color="primary"
        indicator-color="primary"
        class="ct-detail-tabs"
      >
        <q-tab
          v-for="item in visibleTabs"
          :key="item.name"
          :name="item.name"
          :icon="item.icon"
          :label="item.label"
        />
      </q-tabs>
      <q-separator />

      <q-tab-panels v-model="tab" animated>
        <q-tab-panel v-for="item in visibleTabs" :key="item.name" :name="item.name" class="q-pa-none">
          <div class="ct-placeholder">
            <q-icon :name="item.icon" size="32px" color="primary" />
            <div class="ct-placeholder__title">{{ item.label }}</div>
            <div class="ct-placeholder__text">{{ gettext('Coming Soon') }}</div>
          </div>
        </q-tab-panel>
      </q-tab-panels>
    </section>

    <TaskOutputDialog
      v-model="taskDialogVisible"
      :node="taskNode"
      :upid="taskUpid"
      :title="taskTitle"
    />
  </div>
</template>

<style scoped>
.ct-detail {
  min-height: calc(100vh - 154px);
  overflow: hidden;
  background: #fff;
  border: 1px solid #dfe1e6;
  border-radius: 8px;
  box-shadow: 0 2px 10px rgba(34, 51, 84, 0.05);
}

.ct-detail__header {
  min-height: 62px;
  padding: 0 16px;
  background: linear-gradient(90deg, #f8fbff 0%, #fff 44%);
  border-bottom: 1px solid #e5eaf1;
}

.ct-detail__title {
  color: #1f2937;
  font-size: 16px;
  font-weight: 600;
}

.ct-detail__title-name {
  margin-left: 10px;
  color: var(--q-primary);
  font-weight: 500;
}

.ct-detail-tabs {
  padding: 2px 8px 0;
}

.ct-detail-tabs :deep(.q-tabs__arrow) {
  display: none !important;
}

.ct-detail-tabs :deep(.q-tab) {
  min-height: 40px;
  padding: 0 10px;
}

.ct-detail-tabs :deep(.q-tab__content) {
  align-items: center;
}

.ct-detail-tabs :deep(.q-tab__icon) {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
}

.ct-placeholder {
  display: flex;
  min-height: calc(100vh - 260px);
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  color: #6b7280;
}

.ct-placeholder__title {
  color: #1f2937;
  font-size: 15px;
  font-weight: 600;
}

.ct-placeholder__text {
  font-size: 13px;
}
</style>
