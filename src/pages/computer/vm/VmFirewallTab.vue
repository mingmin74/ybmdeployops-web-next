<script setup lang="ts">
import { computed } from 'vue';
import FirewallResourcePanel from '@/pages/system/firewall/FirewallResourcePanel.vue';

const props = withDefaults(
  defineProps<{ node: string; vmid: string; guestType?: 'qemu' | 'lxc' }>(),
  { guestType: 'qemu' },
);

const basePath = computed(
  () => `/nodes/${encodeURIComponent(props.node)}/${props.guestType}/${encodeURIComponent(props.vmid)}/firewall`,
);
</script>

<template>
  <FirewallResourcePanel :base-path="basePath" firewall-type="vm" show-aliases show-ipset />
</template>
