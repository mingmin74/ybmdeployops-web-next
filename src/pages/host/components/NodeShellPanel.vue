<script setup lang="ts">
import { computed } from 'vue';

const { node } = defineProps<{ node: string }>();

const shellUrl = computed(() => {
  if (!node) return '';
  const params = new URLSearchParams({ console: 'shell', node, xtermjs: '1', vmid: '0' });
  return `/?${params.toString()}`;
});
</script>

<template>
  <div class="node-shell-panel">
    <iframe
      v-if="shellUrl"
      :src="shellUrl"
      frameborder="0"
      scrolling="no"
      :title="`${node} shell`"
    />
  </div>
</template>

<style scoped>
.node-shell-panel {
  height: calc(100vh - 260px);
  min-height: 480px;
}
.node-shell-panel iframe {
  width: 100%;
  height: 100%;
  border: 0;
}
</style>
