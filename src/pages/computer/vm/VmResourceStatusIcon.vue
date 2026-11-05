<script setup lang="ts">
import { computed } from 'vue';

const props = defineProps<{
  status?: string;
  lock?: string;
  hastate?: string;
  template?: boolean;
}>();

const baseIcon = computed(() => (props.template ? 'article' : 'desktop_windows'));
const baseColor = computed(() => (props.template ? 'grey-7' : 'primary'));

const overlay = computed(() => {
  if (props.template) return undefined;

  // ResourceTree combines status, HA state, and the VM configuration lock.
  if (props.hastate === 'error') return { icon: 'fas fa-circle-xmark', color: '#cc1800' };
  if (props.hastate === 'maintenance') return { icon: 'fas fa-wrench', color: '#3892d4' };
  if (props.hastate === 'pending') return { icon: 'fas fa-triangle-exclamation', color: '#ffcc00' };

  const lock = props.lock || '';
  if (lock === 'backup') return { icon: 'fas fa-floppy-disk', color: '#000' };
  if (lock === 'migrate') return { icon: 'fas fa-rocket', color: '#000' };
  if (lock === 'suspending') return { icon: 'fas fa-download', color: '#cc8e00' };
  if (lock === 'suspended') return { icon: 'fas fa-download', color: '#000' };
  if (lock) return { icon: 'fas fa-lock', color: '#000' };

  if (props.status === 'running') return { icon: 'fas fa-play', color: '#21bf4b' };
  if (props.status === 'paused' || props.status === 'suspended') {
    return { icon: 'fas fa-pause', color: '#cc8e00' };
  }
  if (props.status === 'error' || props.status === 'offline') {
    return { icon: 'fas fa-circle-xmark', color: '#cc1800' };
  }
  if (props.status === 'unknown') return { icon: 'fas fa-circle-question', color: '#888' };
  return undefined;
});
</script>

<template>
  <span
    class="vm-resource-status-icon"
    aria-hidden="true"
  >
    <q-icon
      :name="baseIcon"
      size="16px"
      :color="baseColor"
    />
    <q-icon
      v-if="overlay"
      :name="overlay.icon"
      size="10px"
      class="vm-resource-status-icon__overlay"
      :style="{ color: overlay.color }"
    />
  </span>
</template>

<style scoped>
.vm-resource-status-icon {
  position: relative;
  display: inline-flex;
  width: 20px;
  height: 18px;
  flex: 0 0 20px;
  align-items: center;
  vertical-align: middle;
}
.vm-resource-status-icon__overlay {
  position: absolute;
  right: 0;
  bottom: 0;
  text-shadow: -1px 0 2px #fff;
}
</style>
