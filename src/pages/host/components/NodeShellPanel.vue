<script setup lang="ts">
import { computed } from 'vue';

const { node, enabled = true } = defineProps<{ node: string; enabled?: boolean }>();

const shellUrl = computed(() => {
  if (!node || !enabled) return '';
  // Mirrors PVE.noVncConsole: shell console, node, vmid 0, xterm.js and default scaling.
  const params = new URLSearchParams({
    console: 'shell',
    vmid: '0',
    node,
    resize: 'scale',
    xtermjs: '1',
  });
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
