<script setup lang="ts">
import OverviewPage from '@/pages/computer/OverviewPage.vue';

defineProps<{ node: string; vmid: string }>();
</script>

<template>
  <OverviewPage :fixed-node="node" :fixed-vmid="vmid" fixed-resource-type="lxc" hide-vm-selector />
</template>
