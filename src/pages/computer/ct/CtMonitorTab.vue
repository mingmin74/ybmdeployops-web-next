<script setup lang="ts">
import VmMonitorTab from '@/pages/computer/vm/VmMonitorTab.vue';

defineProps<{ node: string; vmid: string }>();
</script>

<template>
  <VmMonitorTab :node="node" :vmid="vmid" />
</template>
