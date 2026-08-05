<script setup lang="ts">
import VmFirewallTab from '@/pages/computer/vm/VmFirewallTab.vue';

defineProps<{ node: string; vmid: string }>();
</script>

<template>
  <VmFirewallTab :node="node" :vmid="vmid" guest-type="lxc" />
</template>
