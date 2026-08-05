<script setup lang="ts">
import VmBackupTab from '@/pages/computer/vm/VmBackupTab.vue';

defineProps<{ node: string; vmid: string }>();
const emit = defineEmits<{ task: [node: string, upid: string, title: string] }>();
function forwardTask(node: string, upid: string, title: string) {
  emit('task', node, upid, title);
}
</script>

<template>
  <VmBackupTab :node="node" :vmid="vmid" guest-type="lxc" @task="forwardTask" />
</template>
