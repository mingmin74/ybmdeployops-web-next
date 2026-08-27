<script setup lang="ts">
import { shallowRef } from 'vue';
import { gettext } from '@/locale';
import OverlayClusterLogsTable from './OverlayClusterLogsTable.vue';
import OverlayOperationLogsTable from './OverlayOperationLogsTable.vue';
import OverlaySystemLogsViewer from './OverlaySystemLogsViewer.vue';

const activeTab = shallowRef('operation');
</script>

<template>
  <section class="overlay-logs-panel column no-wrap">
    <q-tabs
      v-model="activeTab"
      dense
      class="overlay-logs-panel__tabs text-grey"
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
      class="overlay-logs-panel__content"
    >
      <q-tab-panel
        name="operation"
        class="q-pa-none"
      >
        <OverlayOperationLogsTable />
      </q-tab-panel>
      <q-tab-panel
        name="system"
        class="q-pa-none"
      >
        <OverlaySystemLogsViewer />
      </q-tab-panel>
      <q-tab-panel
        name="cluster"
        class="q-pa-none"
      >
        <OverlayClusterLogsTable />
      </q-tab-panel>
    </q-tab-panels>
  </section>
</template>

<style scoped>
.overlay-logs-panel {
  height: 100%;
  min-height: 0;
}

.overlay-logs-panel__tabs {
  min-height: 32px;
  padding-right: 40px;
}

.overlay-logs-panel__tabs :deep(.q-tab) {
  min-height: 32px;
  padding: 0 12px;
}

.overlay-logs-panel__content {
  min-height: 0;
  flex: 1 1 0;
}

.overlay-logs-panel__content :deep(.q-panel),
.overlay-logs-panel__content :deep(.q-tab-panel) {
  height: 100%;
}
</style>
