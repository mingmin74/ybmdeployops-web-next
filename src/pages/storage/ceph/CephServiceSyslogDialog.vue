<script setup lang="ts">
import LogViewer from '@/components/logs/LogViewer.vue';
import UWindow from '@/components/UWindow.vue';
import { gettext } from '@/locale';

const visible = defineModel<boolean>('visible', { default: false });
const { node, service } = defineProps<{ node: string; service: string }>();
</script>

<template>
  <q-dialog v-model="visible" persistent>
    <UWindow width="1000px" :title="`${gettext('Syslog')}: ${service}`">
      <LogViewer source="service" :node="node" :service="service" :show-node-selector="false" />
    </UWindow>
  </q-dialog>
</template>
