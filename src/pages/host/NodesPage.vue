<script setup lang="ts">
import type { QTableColumn } from 'quasar';
import { useQuasar } from 'quasar';
import { computed, onBeforeUnmount, onMounted, shallowRef } from 'vue';
import { useRouter } from 'vue-router';
import { getNodeSpiceShell, getNodes, rebootNode, shutdownNode } from '@/api/host';
import type { PveNode } from '@/api/resources';
import UsageProgress from '@/components/UsageProgress.vue';
import { gettext } from '@/locale';
import { useSessionStore } from '@/stores/session';
import { usagePercent } from '@/utils/format';

type NodeRow = PveNode & { id?: string; maxcpu?: number; uptime?: number };

const $q = useQuasar();
const router = useRouter();
const session = useSessionStore();
const loading = shallowRef(false);
const actionLoading = shallowRef(false);
const filter = shallowRef('');
const selected = shallowRef<NodeRow[]>([]);
const nodes = shallowRef<NodeRow[]>([]);
let refreshTimer: number | undefined;

const selectedNode = computed(() => selected.value[0]);
const dcCaps = computed(() => (session.caps as unknown as { dc?: Record<string, unknown> }).dc || {});
const nodeCaps = computed(() => (session.caps as unknown as { nodes?: Record<string, unknown> }).nodes || {});
const canAudit = computed(() => Boolean(dcCaps.value['Sys.Audit']));
const canPowerManage = computed(() => Boolean(nodeCaps.value['Sys.PowerMgmt']));
const canConsole = computed(() => Boolean(nodeCaps.value['Sys.Console']));
const canUseSelectedNode = computed(() => selectedNode.value?.status === 'online');
const nodeColumns: QTableColumn<NodeRow>[] = [
  { name: 'node', required: true, label: gettext('Name'), field: 'node', align: 'left', sortable: true },
  { name: 'status', label: gettext('Status'), field: 'status', align: 'left', sortable: true },
  { name: 'disk', label: gettext('Local Disk Usage'), field: (row) => usagePercent(row.disk, row.maxdisk), align: 'left' },
  { name: 'memory', label: gettext('Memory Usage'), field: (row) => usagePercent(row.mem, row.maxmem), align: 'left' },
  { name: 'cpu', label: gettext('CPU Usage'), field: (row) => `${(Number(row.cpu || 0) * 100).toFixed(2)}%`, align: 'left' },
  { name: 'uptime', label: gettext('Uptime'), field: (row) => formatUptime(row.uptime), align: 'left' },
];

function formatUptime(value: unknown) {
  const seconds = Number(value);
  if (!seconds) return '-';
  return `${Math.floor(seconds / 86400)}d ${Math.floor((seconds % 86400) / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
}

async function loadNodes() {
  loading.value = true;
  try {
    const response = await getNodes();
    nodes.value = [...(response.data || [])].sort((left, right) => left.node.localeCompare(right.node));
    const currentName = selectedNode.value?.node;
    selected.value = currentName ? nodes.value.filter((node) => node.node === currentName) : [];
  } finally {
    loading.value = false;
  }
}

function openNodeDetail() {
  const node = selectedNode.value;
  if (!node) return;
  selected.value = [node];
  void router.push({ name: 'host-node-detail', params: { node: node.node } });
}

function selectTableNode(_event: Event, row: NodeRow) {
  selected.value = selectedNode.value?.node === row.node ? [] : [row];
}

function confirmPower(command: 'reboot' | 'shutdown') {
  const node = selectedNode.value;
  if (!node || node.status === 'offline') return;
  const label = command === 'reboot' ? gettext('reboot') : gettext('shutdown');
  $q.dialog({ title: gettext('Confirm'), message: `${gettext('Are you sure you want to')} ${label}: ${node.node} ?`, cancel: true, persistent: true }).onOk(() => { void (async () => {
    actionLoading.value = true;
    try {
      if (command === 'reboot') await rebootNode(node.node);
      else await shutdownNode(node.node);
    } finally {
      actionLoading.value = false;
    }
  })(); });
}

function openShell(consoleType: 'noVNC' | 'xterm.js') {
  const node = selectedNode.value;
  if (!node || node.status === 'offline') return;

  const params = new URLSearchParams({
    console: 'shell',
    node: node.node,
    vmid: '0',
    vmname: '',
    cmd: '',
  });

  if (consoleType === 'noVNC') {
    params.set('novnc', '1');
    params.set('resize', '2ff');
    window.open(`?${params.toString()}`, '_blank', 'innerWidth=745,innerheight=427');
    return;
  }

  params.set('xtermjs', '1');
  window.open(`?${params.toString()}`, '_blank', 'toolbar=no,location=no,status=no,menubar=no,resizable=yes,width=1024,height=600');
}

async function downloadSpiceShell() {
  const node = selectedNode.value;
  if (!node || node.status === 'offline') return;

  actionLoading.value = true;
  try {
    const response = await getNodeSpiceShell(node.node, window.location.hostname);
    const content = ['[virt-viewer]', ...Object.entries(response.data || {}).map(([key, value]) => `${key}=${value}`)].join('\n');
    const url = URL.createObjectURL(new Blob([content], { type: 'application/x-virt-viewer' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${node.node}-shell.vv`;
    anchor.click();
    URL.revokeObjectURL(url);
  } finally {
    actionLoading.value = false;
  }
}

function openNodeAction(action: 'network' | 'setting' | 'firewall' | 'taskHistory' | 'subscription' | 'packageversion' | 'systemreport') {
  const node = selectedNode.value;
  if (!node || node.status === 'offline') return;

  $q.notify({
    type: 'info',
    message: `${gettext('Node')} ${node.node}: ${gettext(action)}`,
  });
}

onMounted(() => { void loadNodes(); refreshTimer = window.setInterval(() => void loadNodes(), 3000); });
onBeforeUnmount(() => { if (refreshTimer) window.clearInterval(refreshTimer); });
</script>

<template>
  <div class="q-ma-md nodes-page">
    <div class="nodes-surface">
      <q-table flat row-key="node" table-header-class="u-table-header" selection="single" hide-selected-banner :rows="nodes" :columns="nodeColumns" :selected="selected" :filter="filter" :loading="loading" :pagination="{ page: 1, rowsPerPage: 10 }" :rows-per-page-options="[10]" :no-data-label="gettext('no record can be found')" @row-click="selectTableNode" @update:selected="selected = [...$event]">
            <template #top>
              <div class="row q-gutter-sm">
                <q-btn no-caps outline size="12px" class="u-button" :color="selectedNode ? 'primary' : 'grey'" :disable="!selectedNode" :label="gettext('Node Details')" @click="openNodeDetail" />
                <q-btn v-if="canPowerManage" no-caps outline size="12px" class="u-button" :color="canUseSelectedNode ? 'primary' : 'grey'" :disable="!canUseSelectedNode" :loading="actionLoading" :label="gettext('Reboot')" @click="confirmPower('reboot')" />
                <q-btn v-if="canPowerManage" no-caps outline size="12px" class="u-button" :color="canUseSelectedNode ? 'red' : 'grey'" :disable="!canUseSelectedNode" :loading="actionLoading" :label="gettext('Shutdown')" @click="confirmPower('shutdown')" />
                <q-btn-dropdown v-if="canConsole" no-caps outline size="12px" class="u-button" :color="canUseSelectedNode ? 'primary' : 'grey'" :disable="!canUseSelectedNode" :label="gettext('Console')">
                  <q-list>
                    <q-item v-close-popup dense clickable @click="openShell('noVNC')"><q-item-section><q-item-label>noVNC</q-item-label></q-item-section></q-item>
                    <q-item v-close-popup dense clickable @click="downloadSpiceShell"><q-item-section><q-item-label>SPICE</q-item-label></q-item-section></q-item>
                    <q-item v-close-popup dense clickable @click="openShell('xterm.js')"><q-item-section><q-item-label>xterm.js</q-item-label></q-item-section></q-item>
                  </q-list>
                </q-btn-dropdown>
                <q-btn-dropdown no-caps outline size="12px" class="u-button" :color="canUseSelectedNode ? 'primary' : 'grey'" :disable="!canUseSelectedNode" :label="`${gettext('More')} ${gettext('Actions')}`">
                  <q-list>
                    <q-item v-if="canAudit" v-close-popup dense clickable @click="openNodeAction('network')"><q-item-section>{{ gettext('Network') }}</q-item-section></q-item>
                    <q-item v-if="canAudit" v-close-popup dense clickable @click="openNodeAction('setting')"><q-item-section>{{ gettext('Setting') }}</q-item-section></q-item>
                    <q-item v-if="canAudit" v-close-popup dense clickable @click="openNodeAction('firewall')"><q-item-section>{{ gettext('Firewall') }}</q-item-section></q-item>
                    <q-item v-close-popup dense clickable @click="openNodeAction('taskHistory')"><q-item-section>{{ gettext('Task History') }}</q-item-section></q-item>
                    <q-item v-close-popup dense clickable @click="openNodeAction('subscription')"><q-item-section>{{ gettext('Subscription') }}</q-item-section></q-item>
                    <q-item v-close-popup dense clickable @click="openNodeAction('packageversion')"><q-item-section>{{ gettext('PackageVersion') }}</q-item-section></q-item>
                    <q-item v-close-popup dense clickable @click="openNodeAction('systemreport')"><q-item-section>{{ gettext('SystemReport') }}</q-item-section></q-item>
                  </q-list>
                </q-btn-dropdown>
                <q-btn no-caps outline size="12px" color="primary" class="u-button" :loading="loading" :label="gettext('Refresh')" @click="loadNodes" />
              </div>
              <q-space />
              <q-input v-model="filter" borderless dense debounce="300" :placeholder="gettext('Search')"><template #append><q-icon name="search" /></template></q-input>
            </template>
            <template #body-cell-status="props"><q-td :props="props"><q-badge :color="props.value === 'online' ? 'green' : props.value === 'offline' ? 'red' : 'grey'" :label="props.value || '-'" /></q-td></template>
            <template #body-cell-disk="props"><q-td :props="props"><UsageProgress :percent="props.value" /></q-td></template>
            <template #body-cell-memory="props"><q-td :props="props"><UsageProgress :percent="props.value" /></q-td></template>
      </q-table>
    </div>
  </div>
</template>

<style scoped lang="scss">
.nodes-page { min-height: calc(100vh - 130px); }
.nodes-surface { min-height: calc(100vh - 130px); padding: 12px; background: #fff; }
</style>
