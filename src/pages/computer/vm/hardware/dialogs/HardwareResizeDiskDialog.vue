<script setup lang="ts">
import { computed, shallowRef, watch } from 'vue';
import { resizeVmDisk } from '@/api/vm';
import UWindow from '@/components/UWindow.vue';
import { gettext } from '@/locale';
import { textValue } from '@/utils/pveFormat';
import { useVmHardwareContext } from '../context/vmHardwareContext';

const visible = defineModel<boolean>({ default: false });
const size = shallowRef('');
const { canResizeDisk, loading, node, notifyTask, notifyUpdated, selectedDevice, vmid } =
  useVmHardwareContext();
const sizeError = computed(() => {
  const value = size.value.trim();
  if (!value) return gettext('A size increment is required');
  if (!/^\d+(?:\.\d{1,3})?$/.test(value)) return gettext('Enter a value with up to 3 decimal places');
  const numeric = Number(value);
  return numeric >= 0 && numeric <= 128 * 1024
    ? ''
    : gettext('Enter a value between 0 and 131072 GiB');
});
const canSubmit = computed(() => canResizeDisk.value && !sizeError.value);

watch(visible, (isVisible) => {
  if (isVisible) size.value = '0';
});

async function resizeDisk() {
  const disk = selectedDevice.value;
  if (!canSubmit.value || disk?.type !== 'disk') return;
  loading.value = true;
  try {
    const response = await resizeVmDisk(node.value, vmid.value, disk.key, `+${size.value}G`);
    visible.value = false;
    notifyUpdated();
    const upid = textValue((response as { data?: unknown }).data ?? response);
    if (upid.startsWith('UPID:')) notifyTask(upid, gettext('Resize disk'));
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <q-dialog v-model="visible" persistent>
    <UWindow :title="gettext('Resize disk')" width="420px" :loading="loading">
      <div class="q-pa-md">
        <q-input
          v-model="size"
          dense
          square
          outlined
          type="number"
          min="0"
          max="131072"
          step="0.001"
          :error="Boolean(sizeError)"
          :error-message="sizeError"
          :label="gettext('Increase size (GiB)')"
        />
      </div>
      <template #foot>
        <q-btn
          v-close-popup
          no-caps
          outline
          size="12px"
          class="u-button"
          :label="gettext('Cancel')"
        />
        <q-btn
          no-caps
          flat
          size="12px"
          class="bg-primary text-grey-1 u-button"
          :disable="!canSubmit"
          :label="gettext('Resize disk')"
          @click="resizeDisk"
        />
      </template>
    </UWindow>
  </q-dialog>
</template>
