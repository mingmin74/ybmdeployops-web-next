<script setup lang="ts">
import VmTaskHistoryTab from '@/pages/computer/vm/VmTaskHistoryTab.vue';

defineProps<{ node: string; vmid: string }>();
const emit = defineEmits<{ task: [node: string, upid: string, title: string] }>();
function forwardTask(node: string, upid: string, title: string) { emit('task', node, upid, title); }
</script>

<template>
  <VmTaskHistoryTab :node="node" :vmid="vmid" @task="forwardTask" />
</template>
