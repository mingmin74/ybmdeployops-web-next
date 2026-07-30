<script setup lang="ts">
import { shallowRef, watch } from 'vue';
import { resizeVmDisk } from '@/api/vm';
import UWindow from '@/components/UWindow.vue';
import { gettext } from '@/locale';
import { useVmHardwareContext } from '../context/vmHardwareContext';

const visible = defineModel<boolean>({ default: false });
const size = shallowRef('');
const { hasVmCapability, loading, node, notifyUpdated, selectedDevice, vmid } = useVmHardwareContext();

watch(visible, (isVisible) => {
  if (isVisible) size.value = '';
});

async function resizeDisk() {
  const disk = selectedDevice.value;
  if (!hasVmCapability('VM.Config.Disk') || disk?.type !== 'disk' || !size.value) return;
  loading.value = true;
  try {
    await resizeVmDisk(node.value, vmid.value, disk.key, `+${size.value}G`);
    visible.value = false;
    notifyUpdated();
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <q-dialog v-model="visible" persistent>
    <UWindow :title="gettext('Resize disk')" width="420px" :loading="loading">
      <div class="q-pa-md">
        <q-input v-model="size" dense square outlined type="number" min="1" :label="gettext('Increase size (GiB)')" />
      </div>
      <template #foot>
        <q-btn v-close-popup no-caps outline size="12px" class="u-button" :label="gettext('Cancel')" />
        <q-btn no-caps flat size="12px" class="bg-primary text-grey-1 u-button" :label="gettext('Resize disk')" @click="resizeDisk" />
      </template>
    </UWindow>
  </q-dialog>
</template>
