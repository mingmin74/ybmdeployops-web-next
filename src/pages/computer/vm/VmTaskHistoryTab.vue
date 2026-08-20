<script setup lang="ts">
import ProxmoxTaskHistory from '@/components/ProxmoxTaskHistory.vue';

defineProps<{ node: string; vmid: string }>();
const emit = defineEmits<{ task: [node: string, upid: string, title: string] }>();
function forwardTask(node: string, upid: string, title: string) {
  emit('task', node, upid, title);
}
</script>

<template>
  <div class="vm-task-history-tab q-pa-md">
    <ProxmoxTaskHistory
      :node="node"
      :vmid="vmid"
      :show-node-column="true"
      :show-download="true"
      :show-search="true"
      @task="forwardTask"
    />
  </div>
</template>
