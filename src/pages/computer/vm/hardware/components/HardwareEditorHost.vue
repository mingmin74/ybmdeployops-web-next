<script setup lang="ts">
import { computed } from 'vue';
import CpuHardwareEditor from '../editors/CpuHardwareEditor.vue';
import MemoryHardwareEditor from '../editors/MemoryHardwareEditor.vue';
import BiosHardwareEditor from '../editors/BiosHardwareEditor.vue';
import SystemHardwareEditor from '../editors/SystemHardwareEditor.vue';
import DisplayHardwareEditor from '../editors/DisplayHardwareEditor.vue';
import MachineHardwareEditor from '../editors/MachineHardwareEditor.vue';
import ScsiControllerHardwareEditor from '../editors/ScsiControllerHardwareEditor.vue';
import DiskHardwareEditor from '../editors/DiskHardwareEditor.vue';
import CdromHardwareEditor from '../editors/CdromHardwareEditor.vue';
import NetworkHardwareEditor from '../editors/NetworkHardwareEditor.vue';
import { useVmHardwareContext } from '../context/vmHardwareContext';

const { selectedDevice } = useVmHardwareContext();
const activeEditor = computed(() => {
  const editors = {
    cpu: CpuHardwareEditor,
    memory: MemoryHardwareEditor,
    bios: BiosHardwareEditor,
    system: SystemHardwareEditor,
    display: DisplayHardwareEditor,
    machine: MachineHardwareEditor,
    'scsi-controller': ScsiControllerHardwareEditor,
    disk: DiskHardwareEditor,
    cdrom: CdromHardwareEditor,
    network: NetworkHardwareEditor,
  };
  const type = selectedDevice.value?.type;
  return type ? editors[type as keyof typeof editors] : undefined;
});
</script>

<template>
  <div class="hardware-editor-host">
    <component
      :is="activeEditor"
      v-if="activeEditor && selectedDevice"
      :key="selectedDevice.key"
      :device="selectedDevice"
    />
    <slot v-else />
  </div>
</template>

<style scoped lang="scss">
.hardware-editor-host {
  display: flex;
  flex: 1 1 auto;
  min-height: 0;
  flex-direction: column;
}

.hardware-editor-host :deep(.hardware-special-editor) {
  flex: 1 1 auto;
}
</style>
