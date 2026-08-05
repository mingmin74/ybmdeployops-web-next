<script setup lang="ts">
import ReplicationTasksPanel from '@/pages/maintenance/components/ReplicationTasksPanel.vue';

defineProps<{ node: string; vmid: string }>();
</script>

<template>
  <ReplicationTasksPanel :node="node" :vmid="vmid" guest-type="lxc" embedded />
</template>
