<script setup lang="ts">
import { computed, shallowRef, watch } from 'vue';
import { useQuasar } from 'quasar';
import { useRoute, useRouter } from 'vue-router';
import { getNodeSpiceShell, getNodes, rebootNode, shutdownNode, type PveNode } from '@/api/host';
import { gettext } from '@/locale';
import { useSessionStore } from '@/stores/session';
import NodeDetailSkeleton from './components/NodeDetailSkeleton.vue';

const $q = useQuasar();
const route = useRoute();
const router = useRouter();
const session = useSessionStore();
const loading = shallowRef(false);
const actionLoading = shallowRef(false);
const nodeName = computed(() => String(route.params.node || ''));
const node = shallowRef<PveNode>({ node: '' });
const nodeCaps = computed(
  () => (session.caps as unknown as { nodes?: Record<string, unknown> }).nodes || {},
);
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
  params.set('xtermjs', '1');
  window.open(
    `?${params.toString()}`,
    '_blank',
    'toolbar=no,location=no,status=no,menubar=no,resizable=yes,width=1024,height=600',
  );
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

watch(
  nodeName,
  () => {
    void loadNode();
  },
  { immediate: true },
);
</script>

<template>
  <div class="q-ma-md node-detail-page">
    <NodeDetailSkeleton
      :node="node"
      :can-power-manage="canPowerManage"
      :can-console="canConsole"
      :can-use-node="canUseNode"
      :action-loading="actionLoading"
      @back="backToList"
      @power="confirmPower"
      @shell="openShell"
      @spice="downloadSpiceShell"
    />
    <q-inner-loading :showing="loading" />
  </div>
</template>

<style scoped>
.node-detail-page {
  position: relative;
}
</style>
