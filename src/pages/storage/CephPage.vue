<script setup lang="ts">
import { ref } from 'vue';
import CephConfigurationPage from './ceph/ConfigurationPage.vue';
import CephCrushRulePage from './ceph/CrushRulePage.vue';
import CephLogsPage from './ceph/LogsPage.vue';
import CephMonitorPage from './ceph/MonitorPage.vue';
import CephStoragePoolsPage from './ceph/StoragePoolsPage.vue';
import CephSummaryPage from './ceph/SummaryPage.vue';
import { gettext } from '@/locale';

const tab = ref('summary');
</script>

<template>
  <div class="q-ma-md bg-white">
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
      <q-tab name="pools" :label="gettext('Storage Pools')" />
      <q-tab name="crush" :label="gettext('Crush Rule')" />
      <q-tab name="config" :label="gettext('Configuration')" />
      <q-tab name="logs" :label="gettext('Logs')" />
    </q-tabs>
    <q-separator />
    <q-tab-panels v-model="tab" animated>
      <q-tab-panel name="summary"><CephSummaryPage /></q-tab-panel>
      <q-tab-panel name="monitor"><CephMonitorPage /></q-tab-panel>
      <q-tab-panel name="pools"><CephStoragePoolsPage /></q-tab-panel>
      <q-tab-panel name="crush"><CephCrushRulePage /></q-tab-panel>
      <q-tab-panel name="config"><CephConfigurationPage /></q-tab-panel>
      <q-tab-panel name="logs"><CephLogsPage /></q-tab-panel>
    </q-tab-panels>
  </div>
</template>
