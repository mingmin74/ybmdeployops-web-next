<script setup lang="ts">
import ReplicationTasksPanel from '@/pages/maintenance/components/ReplicationTasksPanel.vue';

defineProps<{ node: string }>();
</script>

<template>
  <ReplicationTasksPanel :node="node" embedded />
</template>
