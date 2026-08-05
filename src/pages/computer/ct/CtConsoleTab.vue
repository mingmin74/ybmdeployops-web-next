<script setup lang="ts">
import { computed } from 'vue';
import { gettext } from '@/locale';

const props = defineProps<{ node: string; vmid: string; name: string }>();
const consoleUrl = computed(() => {
  const params = new URLSearchParams({
    console: 'lxc',
    novnc: '1',
    node: props.node,
    vmid: props.vmid,
    resize: 'scale',
    autoconnect: '1',
    reconnect: '1',
  });
  return `/?${params.toString()}`;
});
</script>

<template>
  <iframe class="ct-console-tab" :src="consoleUrl" :title="`${name} ${gettext('Console')}`" />
</template>

<style scoped>
.ct-console-tab {
  display: block;
  width: 100%;
  height: calc(100vh - 250px);
  min-height: 500px;
  border: 0;
}
</style>
