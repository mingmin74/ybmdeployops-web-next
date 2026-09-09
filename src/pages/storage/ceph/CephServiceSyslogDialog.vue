<script setup lang="ts">
import LogViewer from '@/components/logs/LogViewer.vue';
import UWindow from '@/components/UWindow.vue';
import { gettext } from '@/locale';

const visible = defineModel<boolean>('visible', { default: false });
const { node, service } = defineProps<{ node: string; service: string }>();
</script>

<template>
  <q-dialog
    v-model="visible"
    class="ceph-service-syslog-dialog"
    persistent
  >
    <UWindow
      class="ceph-service-syslog-window"
      width="800px"
      :title="`${gettext('Syslog')}: ${service}`"
    >
      <LogViewer
        class="ceph-service-log-viewer"
        source="service"
        :node="node"
        :service="service"
        :show-node-selector="false"
      />
    </UWindow>
  </q-dialog>
</template>

<style scoped>
:deep(.ceph-service-syslog-dialog .q-dialog__inner > .ceph-service-syslog-window) {
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
:deep(.ceph-service-syslog-window > .q-card__section:nth-child(2)) {
  flex: 1 1 auto;
  min-height: 0;
  overflow: hidden;
}
:deep(.ceph-service-syslog-window > .q-card__actions) {
  display: none;
}
:deep(.ceph-service-log-viewer) {
  height: 400px;
  min-height: 0;
  flex-wrap: nowrap;
  overflow: hidden;
}
:deep(.log-box--service) {
  flex: 1 1 auto;
  height: auto;
  min-height: 0;
  overflow: auto;
}
</style>
