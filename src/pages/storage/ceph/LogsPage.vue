<script setup lang="ts">
import LogViewer from '@/components/logs/LogViewer.vue';

const { node = 'localhost' } = defineProps<{ node?: string }>();
</script>

<template>
  <LogViewer source="ceph" :node="node" :show-node-selector="false" />
</template>
