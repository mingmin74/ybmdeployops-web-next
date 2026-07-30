<script setup lang="ts">
import { computed, reactive, watch } from 'vue';
import UWindow from '@/components/UWindow.vue';
import { gettext } from '@/locale';
import { textValue } from '@/utils/pveFormat';
import { useVmHardwareContext } from '../context/vmHardwareContext';

const visible = defineModel<boolean>({ default: false });
const form = reactive({ bus: 'scsi', slot: 0 });
const { config, hasVmCapability, loading, selectedDevice, updateConfig } = useVmHardwareContext();
const target = computed(() => `${form.bus}${Math.max(0, Number(form.slot) || 0)}`);

function firstFreeDeviceSlot(bus: string, limit = 32) {
  for (let slot = 0; slot < limit; slot += 1) {
    if (!config.value[`${bus}${slot}`]) return slot;
  }
  return 0;
}

watch(visible, (isVisible) => {
  if (!isVisible) return;
  form.bus = 'scsi';
  form.slot = firstFreeDeviceSlot(form.bus);
});

async function reattachDisk() {
  const disk = selectedDevice.value;
  if (!hasVmCapability('VM.Config.Disk') || !disk || !/^unused\d+$/.test(disk.key) || config.value[target.value]) return;
  await updateConfig({ [target.value]: textValue(config.value[disk.key]) });
  visible.value = false;
}
</script>

<template>
  <q-dialog v-model="visible" persistent>
    <UWindow :title="gettext('Reassign unused disk')" width="420px" :loading="loading">
      <div class="q-pa-md q-gutter-md">
        <q-select v-model="form.bus" dense square outlined emit-value map-options :options="[{ label: 'SCSI', value: 'scsi' }, { label: 'VirtIO', value: 'virtio' }, { label: 'SATA', value: 'sata' }, { label: 'IDE', value: 'ide' }]" :label="gettext('Bus/Device')" @update:model-value="form.slot = firstFreeDeviceSlot(form.bus)" />
        <q-input v-model.number="form.slot" dense square outlined type="number" min="0" :label="gettext('Device slot')" />
        <div class="text-caption">{{ gettext('Target device') }}: {{ target }}</div>
      </div>
      <template #foot>
        <q-btn v-close-popup no-caps outline size="12px" class="u-button" :label="gettext('Cancel')" />
        <q-btn no-caps flat size="12px" class="bg-primary text-grey-1 u-button" :disable="Boolean(config[target])" :label="gettext('Reassign')" @click="reattachDisk" />
      </template>
    </UWindow>
  </q-dialog>
</template>
