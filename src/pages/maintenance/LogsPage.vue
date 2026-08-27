<script setup lang="ts">
import { shallowRef } from 'vue';
import { gettext } from '@/locale';
import ClusterLogsPage from './logs/ClusterLogsPage.vue';
import OperationLogsPage from './logs/OperationLogsPage.vue';
import SystemLogsPage from './logs/SystemLogsPage.vue';

const activeTab = shallowRef('operation');
</script>

<template>
  <div class="q-ma-md">
    <q-card class="q-mt-sm no-border-radius no-shadow">
      <q-tabs
        v-model="activeTab"
        class="text-grey"
        active-color="primary"
        indicator-color="primary"
        align="left"
        narrow-indicator
      >
        <q-tab
          no-caps
          name="operation"
          :label="gettext('Operation Logs')"
        />
        <q-tab
          no-caps
          name="system"
          :label="gettext('System Logs')"
        />
        <q-tab
          no-caps
          name="cluster"
          :label="gettext('Cluster Logs')"
        />
      </q-tabs>
      <q-separator />
      <q-tab-panels
        v-model="activeTab"
        animated
      >
        <q-tab-panel name="operation"><OperationLogsPage /></q-tab-panel>
        <q-tab-panel name="system"><SystemLogsPage :show-node-selector="true" /></q-tab-panel>
        <q-tab-panel name="cluster"><ClusterLogsPage /></q-tab-panel>
      </q-tab-panels>
    </q-card>
  </div>
</template>
