<script setup lang="ts">
import { shallowRef } from 'vue';
import ResourceOverviewPanel from '@/components/ResourceOverviewPanel.vue';
import { gettext } from '@/locale';
import NodeShellPanel from './NodeShellPanel.vue';
import NodeDiskPanel from './NodeDiskPanel.vue';
import NodeFirewallLogsPanel from './NodeFirewallLogsPanel.vue';
import NodeFirewallOptionsPanel from './NodeFirewallOptionsPanel.vue';
import NodeFirewallRulesPanel from './NodeFirewallRulesPanel.vue';
import NodeSystemPanel from './NodeSystemPanel.vue';
import NodeTaskHistoryPanel from './NodeTaskHistoryPanel.vue';

type NodeDetail = {
  node: string;
  status?: string;
};

defineProps<{
  node: NodeDetail;
  canPowerManage: boolean;
  canConsole: boolean;
  canUseNode: boolean;
  actionLoading: boolean;
}>();

defineEmits<{
  back: [];
  power: [command: 'reboot' | 'shutdown'];
  shell: [consoleType: 'noVNC' | 'xterm.js'];
  spice: [];
}>();

const activeTab = shallowRef('overview');
const firewallTab = shallowRef('rules');

const modules = [
  { name: 'overview', label: gettext('Overview'), icon: 'dashboard' },
  { name: 'shell', label: 'Shell', icon: 'terminal' },
  { name: 'system', label: gettext('System'), icon: 'settings' },
  { name: 'firewall', label: gettext('Firewall'), icon: 'security' },
  { name: 'disk', label: gettext('Disk'), icon: 'storage' },
  { name: 'vm', label: gettext('Virtual Machine'), icon: 'computer' },
  { name: 'ct', label: gettext('CT Container'), icon: 'layers' },
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
      <q-tab-panel v-if="activeTab === 'overview'" name="overview" class="q-pa-none">
        <ResourceOverviewPanel mode="host" :node="node.node" hide-node-selector />
      </q-tab-panel>
      <q-tab-panel name="shell" class="q-pa-none"><NodeShellPanel :node="node.node" /></q-tab-panel>
      <q-tab-panel name="system" class="q-pa-none"
        ><NodeSystemPanel :node="node.node"
      /></q-tab-panel>
      <q-tab-panel name="disk" class="q-pa-none"><NodeDiskPanel :node="node.node" /></q-tab-panel>
      <q-tab-panel name="task-history" class="q-pa-md"
        ><NodeTaskHistoryPanel :node="node.node"
      /></q-tab-panel>
      <q-tab-panel name="firewall" class="q-pa-none">
        <q-splitter :model-value="146" unit="px" disable class="node-detail__module-splitter">
          <template #before>
            <q-tabs
              v-model="firewallTab"
              vertical
              dense
              inline-label
              align="left"
              active-bg-color="blue-1"
              active-color="primary"
              class="node-detail__side-tabs"
            >
              <q-tab name="rules" icon="format_list_bulleted" :label="gettext('Rules')" />
              <q-tab name="options" icon="tune" :label="gettext('Options')" />
              <q-tab name="logs" icon="receipt_long" :label="gettext('Logs')" />
            </q-tabs>
          </template>
          <template #after>
            <q-tab-panels v-model="firewallTab" class="bg-white full-height">
              <q-tab-panel name="rules" class="q-pa-none"
                ><NodeFirewallRulesPanel :node="node.node"
              /></q-tab-panel>
              <q-tab-panel name="options" class="q-pa-none"
                ><NodeFirewallOptionsPanel :node="node.node"
              /></q-tab-panel>
              <q-tab-panel name="logs" class="q-pa-none"
                ><NodeFirewallLogsPanel :node="node.node"
              /></q-tab-panel>
            </q-tab-panels>
          </template>
        </q-splitter>
      </q-tab-panel>
      <q-tab-panel
        v-for="module in modules.filter(
          (item) =>
            !['overview', 'shell', 'system', 'firewall', 'disk', 'task-history'].includes(
              item.name,
            ),
        )"
        :key="module.name"
        :name="module.name"
        class="q-pa-md"
      >
        <div class="node-detail__module-title row items-center q-mb-md">
          <q-icon :name="module.icon" color="primary" size="18px" class="q-mr-sm" />
          <span>{{ module.label }}</span>
        </div>
        <div class="node-detail__placeholder row q-col-gutter-md">
          <div class="col-12 col-md-4">
            <q-skeleton type="text" width="42%" /><q-skeleton type="rect" height="74px" />
          </div>
          <div class="col-12 col-md-4">
            <q-skeleton type="text" width="52%" /><q-skeleton type="rect" height="74px" />
          </div>
          <div class="col-12 col-md-4">
            <q-skeleton type="text" width="38%" /><q-skeleton type="rect" height="74px" />
          </div>
        </div>
        <q-skeleton class="q-mt-lg" type="rect" height="180px" />
      </q-tab-panel>
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
.node-detail__module-splitter {
  min-height: calc(100vh - 272px);
}
.node-detail__module-splitter :deep(.q-splitter__before) {
  background: #f7f9fc;
  border-right: 1px solid #e6ebf2;
}
.node-detail__side-tabs {
  padding: 10px 8px;
}
.node-detail__side-tabs :deep(.q-tab) {
  min-height: 36px;
  justify-content: flex-start;
  margin: 0 0 3px;
  padding: 0 10px 0 9px;
  border-left: 3px solid transparent;
  border-radius: 0 5px 5px 0;
  color: #5e6b7c;
}
.node-detail__side-tabs :deep(.q-tab--active) {
  border-left-color: #1976d2;
  font-weight: 600;
}
.node-detail__side-tabs :deep(.q-tab__label) {
  margin-left: 7px;
  font-size: 13px;
}
.node-detail__side-tabs :deep(.q-tab__icon) {
  width: 14px;
  height: 14px;
  font-size: 14px;
}
.node-detail__side-tabs :deep(.q-tab__indicator) {
  display: none;
}
.node-detail__side-tabs :deep(.q-tab:hover:not(.q-tab--active)) {
  background: #edf1f6;
  color: #334155;
}
.node-detail__module-title {
  font-size: 14px;
  color: #333;
}
.node-detail__placeholder :deep(.q-skeleton) {
  border-radius: 0;
}
</style>
