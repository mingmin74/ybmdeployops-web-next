<script setup lang="ts">
import { computed, shallowRef, watch } from 'vue';
import { getPciMappings, getUsbMappings } from '@/api/deviceMapping';
import type { PveRecord } from '@/api/resources';
import UWindow from '@/components/UWindow.vue';
import { gettext } from '@/locale';
import { useVmHardwareContext } from '../context/vmHardwareContext';

const visible = defineModel<boolean>({ default: false });
const { kind = 'usb', canUseDeviceMapping = false } = defineProps<{
  kind?: 'usb' | 'pci';
  canUseDeviceMapping?: boolean;
}>();
const devices = shallowRef<PveRecord[]>([]);
const device = shallowRef('');
const pcie = shallowRef(false);
const { loading, nextDeviceKey, node, updateConfig } = useVmHardwareContext();
const options = computed(() =>
  devices.value.map((item) => ({
    label: `${item.id || ''}${item.description ? ` - ${item.description}` : ''}`,
    value: String(item.id || ''),
  })),
);

watch(visible, async (isVisible) => {
  if (!isVisible || !canUseDeviceMapping) return;
  loading.value = true;
  try {
    const response = kind === 'usb' ? await getUsbMappings(node.value) : await getPciMappings(node.value);
    devices.value = response.data || [];
    device.value = '';
    pcie.value = false;
  } finally {
    loading.value = false;
  }
});

async function addMappedDevice() {
  if (!canUseDeviceMapping || !device.value) return;
  const key = kind === 'usb' ? nextDeviceKey('usb') : nextDeviceKey('hostpci');
  const value = `mapping=${device.value}${kind === 'pci' && pcie.value ? ',pcie=1' : ''}`;
  await updateConfig({ [key]: value });
  visible.value = false;
}
</script>

<template>
  <q-dialog v-model="visible" persistent>
    <UWindow :title="gettext(kind === 'usb' ? 'Add Mapped USB Device' : 'Add Mapped PCI Device')" width="500px" :loading="loading">
      <div class="q-pa-md q-gutter-md">
        <q-select
          v-model="device"
          dense
          square
          outlined
          emit-value
          map-options
          :options="options"
          :label="gettext('Mapped Device')"
        />
        <q-checkbox v-if="kind === 'pci'" v-model="pcie" :label="gettext('PCI-Express')" />
      </div>
      <template #foot>
        <q-btn v-close-popup no-caps outline size="12px" class="u-button" :label="gettext('Cancel')" />
        <q-btn
          no-caps
          flat
          size="12px"
          class="bg-primary text-grey-1 u-button"
          :disable="!device"
          :label="gettext('Add')"
          @click="addMappedDevice"
        />
      </template>
    </UWindow>
  </q-dialog>
</template>
