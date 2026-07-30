<script setup lang="ts">
import { reactive, shallowRef } from 'vue';
import { gettext } from '@/locale';
import { textValue } from '@/utils/pveFormat';
import { useVmHardwareContext } from '../context/vmHardwareContext';
import type { HardwareRow } from '../types';

const { device } = defineProps<{ device: HardwareRow }>();
const { config, canEditRow, updateConfig } = useVmHardwareContext();
const form = reactive({
  machine: textValue(config.value.machine) || 'i440fx',
  scsihw: textValue(config.value.scsihw) || 'virtio-scsi-pci',
});
const advanced = shallowRef(Boolean(config.value.scsihw));

async function save() {
  if (canEditRow(device)) await updateConfig({ ...form });
}
</script>

<template>
  <div class="hardware-special-editor">
    <div class="row q-col-gutter-lg hardware-special-editor__fields">
      <div class="col-12"><q-select v-model="form.machine" dense options-dense emit-value map-options :options="[{ label: 'i440fx', value: 'i440fx' }, { label: 'Q35', value: 'q35' }]" :label="gettext('Machine')" /></div>
      <div v-if="advanced" class="col-12"><q-select v-model="form.scsihw" dense options-dense :options="['virtio-scsi-pci', 'virtio-scsi-single', 'lsi', 'megasas', 'pvscsi']" :label="gettext('SCSI Controller')" /></div>
    </div>
    <div class="hardware-special-editor__footer row items-center justify-between">
      <q-checkbox v-model="advanced" dense color="primary" :label="gettext('Advanced')" />
      <q-btn no-caps size="12px" class="bg-primary text-grey-1 u-button" :label="gettext('Save')" @click="save" />
    </div>
  </div>
</template>

<style scoped lang="scss">
.hardware-special-editor {
  display: flex;
  min-height: 100%;
  flex-direction: column;
}
.hardware-special-editor__fields {
  flex: 1 1 auto;
  align-content: flex-start;
}
.hardware-special-editor__footer {
  min-height: 52px;
  margin: auto -8px -8px;
  padding: 8px 12px;
  border-top: 1px solid #d7dce2;
  background: #f5f7fa;
}
</style>
