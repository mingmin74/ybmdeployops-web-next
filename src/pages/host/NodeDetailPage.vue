<script setup lang="ts">
import { computed, shallowRef, watch } from 'vue';
import { useQuasar } from 'quasar';
import { useRoute, useRouter } from 'vue-router';
import {
  getNodePackageVersions,
  getNodeSpiceShell,
  getNodes,
  rebootNode,
  shutdownNode,
  type PveNode,
  type PveNodePackageVersion,
} from '@/api/host';
import { gettext } from '@/locale';
import { useSessionStore } from '@/stores/session';
import NodeDetailSkeleton from './components/NodeDetailSkeleton.vue';

const $q = useQuasar();
const route = useRoute();
const router = useRouter();
const session = useSessionStore();
const loading = shallowRef(false);
const actionLoading = shallowRef(false);
const packageVersionsVisible = shallowRef(false);
const packageVersionsLoading = shallowRef(false);
const packageVersions = shallowRef<PveNodePackageVersion[]>([]);
const nodeName = computed(() => String(route.params.node || ''));
const node = shallowRef<PveNode>({ node: '' });
const nodeCaps = computed(
  () => (session.caps as unknown as { nodes?: Record<string, unknown> }).nodes || {}
);
const dcCaps = computed(
  () => (session.caps as unknown as { dc?: Record<string, unknown> }).dc || {}
);
const canAudit = computed(() => Boolean(dcCaps.value['Sys.Audit']));
const canPowerManage = computed(() => Boolean(nodeCaps.value['Sys.PowerMgmt']));
const canConsole = computed(() => Boolean(nodeCaps.value['Sys.Console']));
const canUseNode = computed(() => node.value.status === 'online');

async function loadNode() {
  if (!nodeName.value) return;

  loading.value = true;
  try {
    const response = await getNodes();
    node.value = response.data?.find((item) => item.node === nodeName.value) || {
      node: nodeName.value,
    };
  } finally {
    loading.value = false;
  }
}

function backToList() {
  void router.push({ name: 'host-nodes' });
}

function confirmPower(command: 'reboot' | 'shutdown') {
  if (!canUseNode.value) return;
  const label = command === 'reboot' ? gettext('reboot') : gettext('shutdown');
  $q.dialog({
    title: gettext('Confirm'),
    message: `${gettext('Are you sure you want to')} ${label}: ${node.value.node} ?`,
    cancel: true,
    persistent: true,
  }).onOk(() => {
    void (async () => {
      actionLoading.value = true;
      try {
        if (command === 'reboot') await rebootNode(node.value.node);
        else await shutdownNode(node.value.node);
      } finally {
        actionLoading.value = false;
      }
    })();
  });
}

function openShell(consoleType: 'noVNC' | 'xterm.js') {
  if (!canUseNode.value) return;
  const params = new URLSearchParams({
    console: 'shell',
    node: node.value.node,
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
  void router.push({ name: 'node-shell', query: { node: node.value.node } });
}

async function downloadSpiceShell() {
  if (!canUseNode.value) return;
  actionLoading.value = true;
  try {
    const response = await getNodeSpiceShell(node.value.node, window.location.hostname);
    const content = [
      '[virt-viewer]',
      ...Object.entries(response.data || {}).map(([key, value]) => `${key}=${value}`),
    ].join('\n');
    const url = URL.createObjectURL(new Blob([content], { type: 'application/x-virt-viewer' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${node.value.node}-shell.vv`;
    anchor.click();
    URL.revokeObjectURL(url);
  } finally {
    actionLoading.value = false;
  }
}

async function showPackageVersions() {
  if (!canAudit.value || !node.value.node) return;

  packageVersionsVisible.value = true;
  packageVersionsLoading.value = true;
  packageVersions.value = [];
  try {
    const response = await getNodePackageVersions(node.value.node);
    packageVersions.value = response.data || [];
  } finally {
    packageVersionsLoading.value = false;
  }
}

function packageVersionText(record: PveNodePackageVersion) {
  const version =
    record.CurrentState === 'Installed' && record.OldVersion
      ? record.OldVersion
      : gettext('not correctly installed');
  const running = record.RunningKernel
    ? ` (${gettext('running kernel')}: ${record.RunningKernel})`
    : record.ManagerVersion
      ? ` (${gettext('running version')}: ${record.ManagerVersion})`
      : '';
  return `${record.Package || '-'}: ${version}${running}`;
}

watch(
  nodeName,
  () => {
    void loadNode();
  },
  { immediate: true }
);
</script>

<template>
  <div class="q-ma-md node-detail-page">
    <NodeDetailSkeleton
      :node="node"
      :can-power-manage="canPowerManage"
      :can-audit="canAudit"
      :can-console="canConsole"
      :can-use-node="canUseNode"
      :action-loading="actionLoading"
      @back="backToList"
      @power="confirmPower"
      @package-versions="showPackageVersions"
      @shell="openShell"
      @spice="downloadSpiceShell"
    />
    <q-dialog v-model="packageVersionsVisible" transition-show="scale" transition-hide="scale">
      <q-card class="package-versions-dialog no-shadow no-border-radius">
        <q-card-section class="package-versions-dialog__header">
          <strong>{{ gettext('Package versions') }}</strong>
        </q-card-section>
        <q-separator />
        <q-card-section class="package-versions-dialog__content">
          <q-inner-loading :showing="packageVersionsLoading" color="primary" />
          <pre v-if="!packageVersionsLoading">{{
            packageVersions.map(packageVersionText).join('\n') || gettext('No Data')
          }}</pre>
        </q-card-section>
        <q-separator />
        <q-card-actions align="right">
          <q-btn v-close-popup no-caps flat color="primary" :label="gettext('OK')" />
        </q-card-actions>
      </q-card>
    </q-dialog>
    <q-inner-loading :showing="loading" />
  </div>
</template>

<style scoped>
.node-detail-page {
  position: relative;
}
.package-versions-dialog {
  border: 1px solid #dfe1e6;
  min-width: min(92vw, 620px);
}
.package-versions-dialog__header {
  background: #f2f5fc;
  color: #174f86;
  font-size: 13px;
  padding: 11px 14px;
}
.package-versions-dialog__content {
  min-height: 280px;
  padding: 0;
  position: relative;
}
.package-versions-dialog__content pre {
  color: #344054;
  font: 12px/1.6 Consolas, 'Courier New', monospace;
  margin: 0;
  max-height: 430px;
  min-height: 280px;
  overflow: auto;
  padding: 12px 14px;
  white-space: pre-wrap;
}
</style>
