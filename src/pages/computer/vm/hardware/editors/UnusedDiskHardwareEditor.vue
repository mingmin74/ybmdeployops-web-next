<script setup lang="ts">
import { computed, reactive, watch } from 'vue';
import { gettext } from '@/locale';
import { textValue } from '@/utils/pveFormat';
import { useVmHardwareContext } from '../context/vmHardwareContext';
import type { HardwareRow } from '../types';

const { device } = defineProps<{ device: HardwareRow }>();
const { config, canEditRow, updateConfig } = useVmHardwareContext();

const controllerOptions = [
  { label: 'SCSI', value: 'scsi', limit: 31 },
  { label: 'VirtIO Block', value: 'virtio', limit: 16 },
  { label: 'SATA', value: 'sata', limit: 6 },
  { label: 'IDE', value: 'ide', limit: 4 },
];
const defaultController = controllerOptions[0]!;
const form = reactive({ controller: 'scsi', deviceid: 0 });
const editable = computed(() => canEditRow(device));
const sourceValue = computed(() => textValue(config.value[device.key]));
const controller = computed(
  () => controllerOptions.find((option) => option.value === form.controller) || defaultController,
);
const deviceOptions = computed(() =>
  Array.from({ length: controller.value.limit }, (_, value) => ({
    label: String(value),
    value,
    disable: Boolean(config.value[`${form.controller}${value}`]),
  })),
);
const targetKey = computed(() => `${form.controller}${form.deviceid}`);
const targetFree = computed(() => !config.value[targetKey.value]);
const canSave = computed(() => Boolean(sourceValue.value && targetFree.value));

function selectFirstFreeDevice() {
  const free = deviceOptions.value.find((option) => !option.disable);
  form.deviceid = free?.value ?? 0;
}

watch(
  () => form.controller,
  () => selectFirstFreeDevice(),
  { immediate: true },
);

async function save() {
  if (!editable.value || !canSave.value) return;
  await updateConfig(
    {
      [targetKey.value]: sourceValue.value,
      delete: device.key,
      background_delay: 5,
    },
    'POST',
    gettext('Reattach disk'),
  );
}
</script>

<template>
  <div class="hardware-special-editor" :class="{ 'hardware-special-editor--disabled': !editable }">
    <div class="row q-col-gutter-sm hardware-special-editor__fields">
      <div class="col-12">
        <q-input :model-value="sourceValue" dense disable :label="gettext('Disk image')" />
      </div>
      <div class="col-6">
        <q-select
          v-model="form.controller"
          dense
          options-dense
          emit-value
          map-options
          :options="controllerOptions"
          :label="gettext('Bus/Device')"
        />
      </div>
      <div class="col-6">
        <q-select
          v-model="form.deviceid"
          dense
          options-dense
          emit-value
          map-options
          :options="deviceOptions"
          :label="gettext('Device')"
        />
      </div>
      <div v-if="!targetFree" class="col-12 hardware-editor-error">
        {{ gettext('The selected device slot is already in use.') }}
      </div>
    </div>
    <div class="hardware-special-editor__footer row items-center justify-end">
      <q-btn
        no-caps
        size="12px"
        class="bg-primary text-grey-1 u-button"
        :disable="!editable || !canSave"
        :label="gettext('Reattach')"
        @click="save"
      />
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
.hardware-editor-error {
  padding: 8px 10px;
  border: 1px solid #ef9a9a;
  background: #ffebee;
  color: #b71c1c;
  font-size: 12px;
}
.hardware-special-editor--disabled .hardware-special-editor__fields {
  pointer-events: none;
  opacity: 0.6;
}
</style>
