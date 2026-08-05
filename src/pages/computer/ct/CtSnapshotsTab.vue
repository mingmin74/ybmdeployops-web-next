<script setup lang="ts">
import VmSnapshotsTab from '@/pages/computer/vm/VmSnapshotsTab.vue';

defineProps<{ node: string; vmid: string; running: boolean }>();
const emit = defineEmits<{ task: [node: string, upid: string, title: string] }>();
function forwardTask(node: string, upid: string, title: string) {
  emit('task', node, upid, title);
}
</script>

<template>
  <VmSnapshotsTab
    :node="node"
    :vmid="vmid"
    :running="running"
    guest-type="lxc"
    @task="forwardTask"
  />
</template>
