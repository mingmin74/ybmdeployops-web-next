<script setup lang="ts">
import { shallowRef } from 'vue';
import ProxmoxTaskHistory from '@/components/ProxmoxTaskHistory.vue';
import TaskOutputDialog from '@/components/TaskOutputDialog.vue';

const { node } = defineProps<{ node: string }>();

const taskDialogVisible = shallowRef(false);
const selectedUpid = shallowRef('');
const selectedTitle = shallowRef('');

function onTask(_taskNode: string, upid: string, title: string) {
  selectedUpid.value = upid;
  selectedTitle.value = title;
  taskDialogVisible.value = true;
}
</script>

<template>
  <section class="node-task-history">
    <ProxmoxTaskHistory
      :node="node"
      :show-vmid-filter="true"
      :show-node-column="false"
      :show-download="false"
      :show-search="true"
      @task="onTask"
    />
    <TaskOutputDialog
      v-model="taskDialogVisible"
      :node="node"
      :upid="selectedUpid"
      :title="selectedTitle"
    />
  </section>
</template>

<style scoped>
.node-task-history {
  min-height: 420px;
}
</style>
