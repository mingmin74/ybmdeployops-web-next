<script setup lang="ts">
import { computed, shallowRef } from 'vue';
import { gettext } from '@/locale';
import NodeFirewallOptionsPanel from './NodeFirewallOptionsPanel.vue';
import NodeFirewallLogsPanel from './NodeFirewallLogsPanel.vue';
import NodeFirewallRulesPanel from './NodeFirewallRulesPanel.vue';
import FirewallAliasPage from '@/pages/system/firewall/FirewallAliasPage.vue';
import FirewallIpsetPage from '@/pages/system/firewall/FirewallIpsetPage.vue';

const { node } = defineProps<{ node: string }>();

const splitter = shallowRef(146);
const activeTab = shallowRef('options');

const tabs = [
  { name: 'options', label: gettext('Options'), icon: 'tune' },
  { name: 'log', label: gettext('Log'), icon: 'view_list' },
  { name: 'alias', label: gettext('Aliases'), icon: 'label' },
  { name: 'ipset', label: gettext('IPSet'), icon: 'view_module' },
  { name: 'rules', label: gettext('Rules'), icon: 'list' },
];

const basePath = `/nodes/${encodeURIComponent(node || '')}/firewall`;
</script>

<template>
  <section class="node-firewall-panel">
    <q-splitter
      v-model="splitter"
      unit="px"
      :limits="[126, 220]"
    >
      <template #before>
        <q-tabs
          v-model="activeTab"
          vertical
          dense
          inline-label
          align="left"
          active-bg-color="blue-1"
          active-color="primary"
          class="node-firewall-tabs"
        >
          <q-tab
            v-for="tab in tabs"
            :key="tab.name"
            :name="tab.name"
            :label="tab.label"
            :icon="tab.icon"
          />
        </q-tabs>
      </template>
      <template #after>
        <q-tab-panels
          v-model="activeTab"
          class="bg-transparent"
        >
          <q-tab-panel
            name="options"
            class="q-pa-none"
          >
            <NodeFirewallOptionsPanel :node="node" />
          </q-tab-panel>
          <q-tab-panel
            name="log"
            class="q-pa-none"
          >
            <NodeFirewallLogsPanel :node="node" />
          </q-tab-panel>
          <q-tab-panel
            name="alias"
            class="q-pa-md"
          >
            <FirewallAliasPage :base-url="`${basePath}/aliases`" />
          </q-tab-panel>
          <q-tab-panel
            name="ipset"
            class="q-pa-md"
          >
            <FirewallIpsetPage
              :base-url="`${basePath}/ipset`"
              :refs-url="`${basePath}/refs`"
            />
          </q-tab-panel>
          <q-tab-panel
            name="rules"
            class="q-pa-none"
          >
            <NodeFirewallRulesPanel :node="node" />
          </q-tab-panel>
        </q-tab-panels>
      </template>
    </q-splitter>
  </section>
</template>

<style scoped>
.node-firewall-panel {
  min-height: calc(100vh - 272px);
  background: #fff;
}
.node-firewall-panel :deep(.q-splitter__before) {
  background: #f7f9fc;
  border-right: 1px solid #e6ebf2;
}
.node-firewall-tabs {
  padding: 10px 8px;
}
.node-firewall-tabs :deep(.q-tab) {
  min-height: 36px;
  justify-content: flex-start;
  margin: 0 0 3px;
  padding: 0 10px 0 9px;
  border-left: 3px solid transparent;
  border-radius: 0 5px 5px 0;
  color: #5e6b7c;
}
.node-firewall-tabs :deep(.q-tab--active) {
  border-left-color: #1976d2;
  font-weight: 600;
}
.node-firewall-tabs :deep(.q-tab__label) {
  margin-left: 7px;
  font-size: 13px;
}
.node-firewall-tabs :deep(.q-tab__icon) {
  width: 14px;
  height: 14px;
  font-size: 14px;
}
.node-firewall-tabs :deep(.q-tab__indicator) {
  display: none;
}
.node-firewall-tabs :deep(.q-tab:hover:not(.q-tab--active)) {
  background: #edf1f6;
  color: #334155;
}
</style>
