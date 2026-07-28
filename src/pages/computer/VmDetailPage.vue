<script setup lang="ts">
import { computed, onMounted, onUnmounted, shallowRef } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { getVmConfig, getVmCurrent } from '@/api/overview';
import { getVmSpiceProxy } from '@/api/vm';
import type { PveRecord } from '@/api/resources';
import UsageProgress from '@/components/UsageProgress.vue';
import TaskOutputDialog from '@/components/TaskOutputDialog.vue';
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
import { gettext } from '@/locale';
import { useSessionStore } from '@/stores/session';
import { usagePercent } from '@/utils/format';
import { textValue } from '@/utils/pveFormat';

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

const name = computed(
  () => textValue(current.value.name) || textValue(config.value.name) || vmid.value,
);
const status = computed(() => textValue(current.value.status) || 'unknown');
const cpuPercent = computed(() => Math.max(0, Math.min(Number(current.value.cpu || 0) * 100, 100)));
const memoryPercent = computed(() => usagePercent(current.value.mem, current.value.maxmem));
const diskPercent = computed(() => usagePercent(current.value.disk, current.value.maxdisk));
const consoleUrl = computed(() => {
  if (!node.value || !vmid.value) return '';
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
const canSpice = computed(() => Boolean(config.value.spice));
const canXterm = computed(() => Boolean(config.value.serial));
const isTemplate = computed(() => Boolean(config.value.template));
const vmCaps = computed(
  () => (session.caps as unknown as { vms?: Record<string, unknown> }).vms || {},
);
const nodeCaps = computed(
  () => (session.caps as unknown as { nodes?: Record<string, unknown> }).nodes || {},
);
const canViewConsole = computed(() => Boolean(vmCaps.value['VM.Console']) && !isTemplate.value);
const canViewMonitor = computed(() => Boolean(nodeCaps.value['Sys.Audit']) && !isTemplate.value);
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
const canViewFirewall = computed(() => Boolean(vmCaps.value['VM.Audit']));
const canManagePermissions = computed(() => Boolean(vmCaps.value['Permissions.Modify']));
const basicRows = computed(() => [
  [gettext('Node'), node.value],
  [gettext('VMID'), vmid.value],
  [gettext('Status'), statusText(status.value)],
  [gettext('Uptime'), formatUptime(current.value.uptime)],
  [gettext('OS Type'), textValue(config.value.ostype) || '-'],
  [gettext('Memory'), `${Number(current.value.mem || 0)} / ${Number(current.value.maxmem || 0)}`],
]);

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

function formatUptime(value: unknown) {
  const seconds = Number(value);
  if (!Number.isFinite(seconds) || seconds <= 0) return '-';
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return `${days}d ${hours}h ${minutes}m`;
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
    void reload();
  }, 10_000);
});

onUnmounted(() => {
  if (refreshTimer.value) window.clearInterval(refreshTimer.value);
});
</script>

<template>
  <div class="q-ma-md vm-detail-page">
    <q-card class="no-shadow no-border-radius">
      <q-card-section class="q-pa-md">
        <div class="row items-center q-gutter-sm vm-detail-toolbar">
          <q-btn
            no-caps
            outline
            size="12px"
            color="primary"
            class="u-button"
            icon="arrow_back"
            :label="gettext('Back')"
            @click="router.push('/computer/list')"
          />
          <q-btn
            no-caps
            outline
            size="12px"
            color="primary"
            class="u-button"
            icon="refresh"
            :label="gettext('Refresh')"
            :loading="loading"
            @click="reload"
          />
          <q-space />
          <span class="text-weight-medium">{{ name }}</span>
          <q-badge :color="statusColor(status)" :label="statusText(status)" />
        </div>
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
            icon="monitoring"
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
          <q-tab-panel name="summary" class="q-pa-md">
            <div class="row q-col-gutter-md">
              <div class="col-12 col-md-6">
                <q-markup-table flat bordered dense
                  ><tbody>
                    <tr v-for="row in basicRows" :key="row[0]">
                      <td>{{ row[0] }}</td>
                      <td>{{ row[1] }}</td>
                    </tr>
                  </tbody></q-markup-table
                >
              </div>
              <div class="col-12 col-md-6">
                <div class="vm-usage-row">
                  <span>{{ gettext('CPU Usage') }}</span
                  ><UsageProgress :percent="cpuPercent" />
                </div>
                <div class="vm-usage-row">
                  <span>{{ gettext('Memory Usage') }}</span
                  ><UsageProgress :percent="memoryPercent" />
                </div>
                <div class="vm-usage-row">
                  <span>{{ gettext('Disk Usage') }}</span
                  ><UsageProgress :percent="diskPercent" />
                </div>
              </div>
            </div>
          </q-tab-panel>
          <q-tab-panel v-if="canViewConsole" name="console" class="q-pa-none"
            ><div class="q-pa-sm row justify-end q-gutter-sm">
              <q-btn
                no-caps
                outline
                size="12px"
                color="primary"
                class="u-button"
                label="noVNC"
                @click="openConsole('noVNC')"
              /><q-btn
                no-caps
                outline
                size="12px"
                color="primary"
                class="u-button"
                label="SPICE"
                :disable="!canSpice"
                @click="downloadSpice"
              /><q-btn
                no-caps
                outline
                size="12px"
                color="primary"
                class="u-button"
                label="xterm.js"
                :disable="!canXterm"
                @click="openConsole('xterm.js')"
              />
            </div>
            <iframe
              v-if="consoleUrl"
              :src="consoleUrl"
              class="vm-console"
              frameborder="0"
              :title="`${name} ${gettext('Console')}`"
          /></q-tab-panel>
          <q-tab-panel name="hardware" class="q-pa-md"
            ><VmHardwareTab :node="node" :vmid="vmid" :config="config" @updated="reload"
          /></q-tab-panel>
          <q-tab-panel name="options" class="q-pa-none"
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
      </q-card-section>
    </q-card>
    <TaskOutputDialog
      v-model="taskDialogVisible"
      :node="taskNode"
      :upid="taskUpid"
      :title="taskTitle"
    />
  </div>
</template>

<style scoped>
.vm-detail-toolbar {
  min-height: 30px;
  font-size: 13px;
}
.vm-detail-tabs {
  margin-top: 12px;
}
.vm-usage-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 42px;
  padding: 0 8px;
  border-bottom: 1px solid #eeeeee;
  font-size: 12px;
}
.vm-console {
  width: 100%;
  height: calc(100vh - 250px);
  min-height: 500px;
  border: 0;
}
</style>
