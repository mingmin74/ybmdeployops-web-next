<script setup lang="ts">
import LogViewer from '@/components/logs/LogViewer.vue';

const { node = '', showNodeSelector = true } = defineProps<{
  node?: string;
  showNodeSelector?: boolean;
}>();
</script>

<template>
  <LogViewer
    source="system"
    :node="node"
    :show-node-selector="showNodeSelector"
  />
</template>
