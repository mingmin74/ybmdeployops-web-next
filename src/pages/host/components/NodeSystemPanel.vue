<script setup lang="ts">
import { shallowRef } from 'vue';
import { gettext } from '@/locale';
import NodeServicesPanel from './NodeServicesPanel.vue';
import NodeSystemDnsPanel from './NodeSystemDnsPanel.vue';
import NodeSystemHostsPanel from './NodeSystemHostsPanel.vue';
import NodeSystemNetworkPanel from './NodeSystemNetworkPanel.vue';
import NodeSystemOptionsPanel from './NodeSystemOptionsPanel.vue';
import NodeSystemTimePanel from './NodeSystemTimePanel.vue';
import SystemLogsPage from '@/pages/maintenance/logs/SystemLogsPage.vue';

const props = defineProps<{ node: string }>();
const splitter = shallowRef(146);
const activeTab = shallowRef('services');
const sections = [
  { name: 'services', label: gettext('Service'), icon: 'settings' },
  { name: 'network', label: gettext('Network'), icon: 'swap_horiz' },
  { name: 'dns', label: 'DNS', icon: 'public' },
  { name: 'hosts', label: gettext('Hosts'), icon: 'computer' },
  { name: 'options', label: gettext('Options'), icon: 'tune' },
  { name: 'time', label: gettext('Time'), icon: 'access_time' },
  { name: 'syslog', label: gettext('System Log'), icon: 'view_list' },
];
</script>

<template>
  <section class="node-system-panel">
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
          class="node-system-tabs"
        >
          <q-tab
            v-for="section in sections"
            :key="section.name"
            :name="section.name"
            :label="section.label"
            :icon="section.icon"
          />
        </q-tabs>
      </template>
      <template #after>
        <q-tab-panels
          v-model="activeTab"
          class="bg-transparent"
        >
          <q-tab-panel
            name="services"
            class="q-pa-none"
          >
            <NodeServicesPanel :node="props.node" />
          </q-tab-panel>
          <q-tab-panel
            name="network"
            class="q-pa-sm"
          >
            <NodeSystemNetworkPanel :node="props.node" />
          </q-tab-panel>
          <q-tab-panel
            name="dns"
            class="q-pa-md"
          >
            <NodeSystemDnsPanel :node="props.node" />
          </q-tab-panel>
          <q-tab-panel
            name="hosts"
            class="q-pa-md"
          >
            <NodeSystemHostsPanel :node="props.node" />
          </q-tab-panel>
          <q-tab-panel
            name="options"
            class="q-pa-md"
          >
            <NodeSystemOptionsPanel :node="props.node" />
          </q-tab-panel>
          <q-tab-panel
            name="time"
            class="q-pa-md"
          >
            <NodeSystemTimePanel :node="props.node" />
          </q-tab-panel>
          <q-tab-panel
            name="syslog"
            class="q-pa-none"
          >
            <SystemLogsPage :node="props.node" :show-node-selector="false" />
          </q-tab-panel>
        </q-tab-panels>
      </template>
    </q-splitter>
  </section>
</template>

<style scoped>
.node-system-panel {
  min-height: calc(100vh - 272px);
  background: #fff;
}
.node-system-panel :deep(.q-splitter__before) {
  background: #f7f9fc;
  border-right: 1px solid #e6ebf2;
}
.node-system-tabs {
  padding: 10px 8px;
}
.node-system-tabs :deep(.q-tab) {
  min-height: 36px;
  justify-content: flex-start;
  margin: 0 0 3px;
  padding: 0 10px 0 9px;
  border-left: 3px solid transparent;
  border-radius: 0 5px 5px 0;
  color: #5e6b7c;
}
.node-system-tabs :deep(.q-tab--active) {
  border-left-color: #1976d2;
  font-weight: 600;
}
.node-system-tabs :deep(.q-tab__label) {
  margin-left: 7px;
  font-size: 13px;
}
.node-system-tabs :deep(.q-tab__icon) {
  width: 14px;
  height: 14px;
  font-size: 14px;
}
.node-system-tabs :deep(.q-tab__indicator) {
  display: none;
}
.node-system-tabs :deep(.q-tab:hover:not(.q-tab--active)) {
  background: #edf1f6;
  color: #334155;
}
</style>
