<script setup lang="ts">
import { ref } from 'vue';
import CephConfigurationPage from './ceph/ConfigurationPage.vue';
import CephFilesystemPage from './ceph/FilesystemPage.vue';
import CephLogsPage from './ceph/LogsPage.vue';
import CephMonitorPage from './ceph/MonitorPage.vue';
import CephOsdPage from './ceph/OsdPage.vue';
import CephStoragePoolsPage from './ceph/StoragePoolsPage.vue';
import CephSummaryPage from './ceph/SummaryPage.vue';
import { gettext } from '@/locale';

const tab = ref('summary');
const { node = 'localhost' } = defineProps<{ node?: string }>();
</script>

<template>
  <div class="ceph-page q-ma-md bg-white">
    <q-tabs
      v-model="tab"
      dense
      active-color="primary"
      indicator-color="primary"
      align="left"
      class="bg-grey-2 text-grey-8"
    >
      <q-tab name="summary" :label="gettext('Summary')" />
      <q-tab name="monitor" :label="gettext('Monitor')" />
      <q-tab name="osd" label="OSD" />
      <q-tab name="cephfs" label="CephFS" />
      <q-tab name="pools" :label="gettext('Resource Pool')" />
      <q-tab name="config" :label="gettext('Configuration')" />
      <q-tab name="logs" :label="gettext('Logs')" />
    </q-tabs>
    <q-separator />
    <q-tab-panels v-model="tab" animated>
      <q-tab-panel name="summary" class="q-pa-none"><CephSummaryPage /></q-tab-panel>
      <q-tab-panel name="monitor"><CephMonitorPage :node="node" /></q-tab-panel>
      <q-tab-panel name="osd"><CephOsdPage /></q-tab-panel>
      <q-tab-panel name="cephfs"><CephFilesystemPage /></q-tab-panel>
      <q-tab-panel name="pools"><CephStoragePoolsPage /></q-tab-panel>
      <q-tab-panel name="config"><CephConfigurationPage :node="node" /></q-tab-panel>
      <q-tab-panel name="logs"><CephLogsPage :node="node" /></q-tab-panel>
    </q-tab-panels>
  </div>
</template>
