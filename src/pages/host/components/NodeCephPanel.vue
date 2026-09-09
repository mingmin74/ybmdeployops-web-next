<script setup lang="ts">
import { shallowRef } from 'vue';
import { gettext } from '@/locale';
import CephConfigurationPage from '@/pages/storage/ceph/ConfigurationPage.vue';
import CephFilesystemPage from '@/pages/storage/ceph/FilesystemPage.vue';
import CephLogsPage from '@/pages/storage/ceph/LogsPage.vue';
import CephMonitorPage from '@/pages/storage/ceph/MonitorPage.vue';
import CephOsdPage from '@/pages/storage/ceph/OsdPage.vue';
import CephStoragePoolsPage from '@/pages/storage/ceph/StoragePoolsPage.vue';
import CephSummaryPage from '@/pages/storage/ceph/SummaryPage.vue';

defineProps<{ node: string }>();

const activeTab = shallowRef('summary');
const tabs = [
  { name: 'summary', label: gettext('Summary'), icon: 'dashboard' },
  { name: 'monitor', label: gettext('Monitor'), icon: 'visibility' },
  { name: 'osd', label: 'OSD', icon: 'storage' },
  { name: 'cephfs', label: 'CephFS', icon: 'folder' },
  { name: 'pools', label: gettext('Resource Pool'), icon: 'dns' },
  { name: 'config', label: gettext('Configuration'), icon: 'settings' },
  { name: 'logs', label: gettext('Logs'), icon: 'view_list' },
];
</script>

<template>
  <q-splitter
    :model-value="146"
    unit="px"
    disable
    class="node-ceph-panel full-height"
  >
    <template #before>
      <q-tabs
        v-model="activeTab"
        align="left"
        vertical
        dense
        inline-label
        active-bg-color="blue-1"
        active-color="primary"
        class="node-ceph-panel__tabs"
      >
        <q-tab
          v-for="tab in tabs"
          :key="tab.name"
          v-bind="tab"
        />
      </q-tabs>
    </template>

    <template #after>
      <q-tab-panels
        v-model="activeTab"
        class="bg-transparent full-height q-pa-md"
      >
        <q-tab-panel name="summary" class="q-pa-none"><CephSummaryPage /></q-tab-panel>
        <q-tab-panel name="monitor" class="q-pa-none"><CephMonitorPage :node="node" /></q-tab-panel>
        <q-tab-panel name="osd" class="q-pa-none"><CephOsdPage :node="node" /></q-tab-panel>
        <q-tab-panel name="cephfs" class="q-pa-none"><CephFilesystemPage /></q-tab-panel>
        <q-tab-panel name="pools" class="q-pa-none"><CephStoragePoolsPage :node="node" /></q-tab-panel>
        <q-tab-panel name="config" class="q-pa-none"><CephConfigurationPage :node="node" /></q-tab-panel>
        <q-tab-panel name="logs" class="q-pa-none"><CephLogsPage :node="node" /></q-tab-panel>
      </q-tab-panels>
    </template>
  </q-splitter>
</template>

<style scoped>
.node-ceph-panel {
  min-height: calc(100vh - 272px);
  background: #fff;
}
.node-ceph-panel :deep(.q-splitter__before) {
  background: #f7f9fc;
  border-right: 1px solid #e6ebf2;
}
.node-ceph-panel__tabs {
  padding: 10px 8px;
}
.node-ceph-panel__tabs :deep(.q-tab) {
  min-height: 36px;
  justify-content: flex-start;
  margin: 0 0 3px;
  padding: 0 10px 0 9px;
  border-left: 3px solid transparent;
  border-radius: 0 5px 5px 0;
  color: #5e6b7c;
}
.node-ceph-panel__tabs :deep(.q-tab--active) {
  border-left-color: #1976d2;
  font-weight: 600;
}
.node-ceph-panel__tabs :deep(.q-tab__label) {
  margin-left: 7px;
  font-size: 13px;
}
.node-ceph-panel__tabs :deep(.q-tab__icon) {
  width: 14px;
  height: 14px;
  font-size: 14px;
}
.node-ceph-panel__tabs :deep(.q-tab__indicator) {
  display: none;
}
.node-ceph-panel__tabs :deep(.q-tab:hover:not(.q-tab--active)) {
  background: #edf1f6;
  color: #334155;
}
</style>
