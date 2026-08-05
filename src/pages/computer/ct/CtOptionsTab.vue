<script setup lang="ts">
import type { PveRecord } from '@/api/resources';
import VmOptionsTab from '@/pages/computer/vm/VmOptionsTab.vue';

defineProps<{ node: string; vmid: string; config: PveRecord }>();
const emit = defineEmits<{ updated: [] }>();
</script>

<template>
  <VmOptionsTab
    :node="node"
    :vmid="vmid"
    :config="config"
    guest-type="lxc"
    @updated="emit('updated')"
  />
</template>
