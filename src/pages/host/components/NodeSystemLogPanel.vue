<script setup lang="ts">
import SystemLogsPage from '@/pages/maintenance/logs/SystemLogsPage.vue';

defineProps<{ node: string }>();
</script>

<template>
  <SystemLogsPage :node="node" :show-node-selector="false" />
</template>
