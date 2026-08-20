<script setup lang="ts">
import { shallowRef } from 'vue';
import ResourceOverviewPanel from '@/components/ResourceOverviewPanel.vue';
import { gettext } from '@/locale';
import NodeShellPanel from './NodeShellPanel.vue';
import NodeDiskPanel from './NodeDiskPanel.vue';
import NodeSystemPanel from './NodeSystemPanel.vue';
import NodeTaskHistoryPanel from './NodeTaskHistoryPanel.vue';
import NodeFirewallPanel from './NodeFirewallPanel.vue';
import NodeCephPanel from './NodeCephPanel.vue';
import NodeReplicationPanel from './NodeReplicationPanel.vue';
import NodeNotesPanel from './NodeNotesPanel.vue';

type NodeDetail = {
  node: string;
  status?: string;
};

defineProps<{
  node: NodeDetail;
  canPowerManage: boolean;
  canAudit: boolean;
  canConsole: boolean;
  canUseNode: boolean;
  actionLoading: boolean;
}>();

defineEmits<{
  back: [];
  power: [command: 'reboot' | 'shutdown'];
  packageVersions: [];
  shell: [consoleType: 'noVNC' | 'xterm.js'];
  spice: [];
}>();

const activeTab = shallowRef('summary');

const modules = [
  { name: 'summary', label: gettext('Summary'), icon: 'dashboard' },
  { name: 'notes', label: gettext('Notes'), icon: 'sticky_note_2' },
  { name: 'shell', label: 'Shell', icon: 'terminal' },
  { name: 'system', label: gettext('System'), icon: 'settings' },
  { name: 'disks', label: gettext('Disks'), icon: 'storage' },
  { name: 'ceph', label: 'Ceph', icon: 'cloud_queue' },
  { name: 'replication', label: gettext('Replication'), icon: 'cached' },
  { name: 'firewall', label: gettext('Firewall'), icon: 'security' },
  { name: 'task-history', label: gettext('Task History'), icon: 'history' },
];
</script>

<template>
  <section class="node-detail">
    <header class="node-detail__header row items-center no-wrap">
      <q-btn
        flat
        dense
        round
        icon="arrow_back"
        color="primary"
        size="sm"
        class="q-mr-sm"
        :aria-label="gettext('Back')"
        @click="$emit('back')"
      />
      <q-icon name="dns" size="21px" color="primary" class="q-mr-sm" />
      <div class="node-detail__title">
        {{ gettext('Node Details') }}<span class="node-detail__title-name">{{ node.node }}</span>
      </div>
      <q-badge
        class="q-ml-sm"
        :color="node.status === 'online' ? 'green' : node.status === 'offline' ? 'red' : 'grey'"
        :label="node.status || '-'"
      />
      <q-space />
      <div class="row q-gutter-sm no-wrap">
        <q-btn
          v-if="canAudit"
          no-caps
          outline
          dense
          size="12px"
          color="primary"
          class="node-detail__action"
          :label="gettext('Package versions')"
          @click="$emit('packageVersions')"
        />
        <q-btn
          v-if="canPowerManage"
          no-caps
          outline
          dense
          size="12px"
          class="node-detail__action"
          :color="canUseNode ? 'primary' : 'grey'"
          :disable="!canUseNode"
          :loading="actionLoading"
          :label="gettext('Reboot')"
          @click="$emit('power', 'reboot')"
        />
        <q-btn
          v-if="canPowerManage"
          no-caps
          outline
          dense
          size="12px"
          class="node-detail__action"
          :color="canUseNode ? 'red' : 'grey'"
          :disable="!canUseNode"
          :loading="actionLoading"
          :label="gettext('Shutdown')"
          @click="$emit('power', 'shutdown')"
        />
        <q-btn-dropdown
          v-if="canConsole"
          no-caps
          outline
          dense
          size="12px"
          class="node-detail__action"
          :color="canUseNode ? 'primary' : 'grey'"
          :disable="!canUseNode"
          :label="gettext('Console')"
        >
          <q-list dense>
            <q-item v-close-popup clickable @click="$emit('shell', 'noVNC')"
              ><q-item-section>noVNC</q-item-section></q-item
            >
            <q-item v-close-popup clickable @click="$emit('spice')"
              ><q-item-section>SPICE</q-item-section></q-item
            >
            <q-item v-close-popup clickable @click="$emit('shell', 'xterm.js')"
              ><q-item-section>xterm.js</q-item-section></q-item
            >
          </q-list>
        </q-btn-dropdown>
      </div>
    </header>

    <q-tabs
      v-model="activeTab"
      dense
      align="left"
      active-color="primary"
      indicator-color="transparent"
      class="node-detail__tabs text-grey-8"
    >
      <q-tab
        v-for="module in modules"
        :key="module.name"
        :name="module.name"
        :icon="module.icon"
        :label="module.label"
      />
    </q-tabs>

    <q-separator />

    <q-tab-panels v-model="activeTab" class="node-detail__content">
      <q-tab-panel v-if="activeTab === 'summary'" name="summary" class="q-pa-none">
        <ResourceOverviewPanel mode="host" :node="node.node" hide-node-selector />
      </q-tab-panel>
      <q-tab-panel name="notes" class="q-pa-md"><NodeNotesPanel :node="node.node" /></q-tab-panel>
      <q-tab-panel name="shell" class="q-pa-none"><NodeShellPanel :node="node.node" /></q-tab-panel>
      <q-tab-panel name="system" class="q-pa-none">
        <NodeSystemPanel :node="node.node" />
      </q-tab-panel>
      <q-tab-panel name="disks" class="q-pa-none"><NodeDiskPanel :node="node.node" /></q-tab-panel>
      <q-tab-panel name="ceph" class="q-pa-none"><NodeCephPanel :node="node.node" /></q-tab-panel>
      <q-tab-panel name="replication" class="q-pa-none"
        ><NodeReplicationPanel :node="node.node"
      /></q-tab-panel>
      <q-tab-panel name="firewall" class="q-pa-none">
        <NodeFirewallPanel :node="node.node" />
      </q-tab-panel>
      <q-tab-panel name="task-history" class="q-pa-md"
        ><NodeTaskHistoryPanel :node="node.node"
      /></q-tab-panel>
    </q-tab-panels>
  </section>
</template>

<style scoped lang="scss">
.node-detail {
  min-height: calc(100vh - 154px);
  overflow: hidden;
  background: #fff;
  border: 1px solid #dfe1e6;
  border-radius: 8px;
  box-shadow: 0 2px 10px rgba(34, 51, 84, 0.05);
}
.node-detail__header {
  min-height: 62px;
  padding: 0 16px;
  background: linear-gradient(90deg, #f8fbff 0%, #fff 44%);
  border-bottom: 1px solid #e5eaf1;
}
.node-detail__title {
  color: #1f2937;
  font-size: 16px;
  font-weight: 600;
}
.node-detail__title-name {
  margin-left: 10px;
  color: var(--q-primary);
  font-weight: 500;
}
.node-detail__action {
  min-height: 28px;
  padding: 0 10px;
}
.node-detail__tabs {
  min-height: 58px;
  padding: 8px 12px;
  background: #f7f9fc;
  border-bottom: 1px solid #e6ebf2;
}
.node-detail__tabs :deep(.q-tabs__content) {
  gap: 6px;
  align-items: center;
}
.node-detail__tabs :deep(.q-tab) {
  min-height: 36px;
  padding: 0 13px;
  border: 1px solid transparent;
  border-radius: 6px;
  color: #5e6b7c;
  transition:
    background-color 0.18s ease,
    border-color 0.18s ease,
    color 0.18s ease;
}
.node-detail__tabs :deep(.q-tab .q-icon) {
  font-size: 18px;
}
.node-detail__tabs :deep(.q-tab__label) {
  margin-left: 5px;
  font-size: 13px;
  letter-spacing: 0;
}
.node-detail__tabs :deep(.q-tab--active) {
  border-color: #bfdcff;
  background: #eaf4ff;
  color: #1976d2;
  font-weight: 600;
  box-shadow: 0 1px 2px rgba(25, 118, 210, 0.08);
}
.node-detail__tabs :deep(.q-tab:not(.q-tab--active):hover) {
  background: #edf1f6;
  color: #334155;
}
.node-detail__tabs :deep(.q-tab__indicator) {
  display: none;
}
.node-detail__content {
  min-height: calc(100vh - 248px);
  background: #fff;
}
</style>
