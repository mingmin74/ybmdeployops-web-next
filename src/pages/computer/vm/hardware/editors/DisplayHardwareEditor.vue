<script setup lang="ts">
import { computed, reactive, shallowRef } from 'vue';
import { gettext } from '@/locale';
import { textValue } from '@/utils/pveFormat';
import { useVmHardwareContext } from '../context/vmHardwareContext';
import type { HardwareRow } from '../types';
import {
  parseVmHardwarePropertyString,
  PVE_QEMU_VGA_DRIVERS,
  printVmHardwarePropertyString,
} from '../vmHardwareUtils';

const { device } = defineProps<{ device: HardwareRow }>();
const { config, canEditRow, updateConfig } = useVmHardwareContext();

function parseVga(value: unknown) {
  const result = { type: '__default__', memory: '', clipboard: '__default__' };
  const parsed = parseVmHardwarePropertyString(value, 'type');
  if (parsed.type) result.type = parsed.type;
  if (parsed.memory) result.memory = parsed.memory;
  if (parsed.clipboard) result.clipboard = parsed.clipboard;
  return result;
}

const parsed = parseVga(config.value.vga);
const form = reactive(parsed);
const advanced = shallowRef(Boolean(parsed.clipboard && parsed.clipboard !== '__default__'));

const displayOptions = computed(() =>
  PVE_QEMU_VGA_DRIVERS.map((option) => ({
    label: option.localize ? gettext(option.label) : option.label,
    value: option.value,
  })),
);
const clipboardOptions = computed(() => [
  { label: gettext('Default'), value: '__default__' },
  { label: 'VNC', value: 'vnc' },
]);
const isNonGui = computed(() => /^(serial\d|none)$/.test(form.type));
const memoryPlaceholder = computed(() => {
  if (form.type === 'cirrus') return '4';
  if (form.type === 'std' || /^qxl\d?$/.test(form.type) || form.type === 'vmware') return '16';
  if (form.type.startsWith('virtio')) return '256';
  if (isNonGui.value) return 'N/A';
  return gettext('Default');
});
const memoryValid = computed(() => {
  if (!form.memory.trim()) return true;
  const value = Number(form.memory);
  return Number.isInteger(value) && value >= 4 && value <= 512;
});
const serialValid = computed(() => {
  if (!/^serial\d$/.test(form.type)) return true;
  return textValue(config.value[form.type]) === 'socket';
});
const canSave = computed(() => memoryValid.value && serialValid.value);

function buildVgaValue() {
  if (form.type === '__default__' && !form.memory.trim() && form.clipboard === '__default__')
    return '';
  return printVmHardwarePropertyString(
    {
      type: form.type === '__default__' ? 'std' : form.type,
      ...(!isNonGui.value && form.memory.trim() ? { memory: form.memory.trim() } : {}),
      ...(!isNonGui.value && form.clipboard !== '__default__' ? { clipboard: form.clipboard } : {}),
    },
    'type',
  );
}

async function save() {
  if (!canEditRow(device) || !canSave.value) return;
  const vga = buildVgaValue();
  await updateConfig(vga ? { vga } : { delete: 'vga' });
}
</script>

<template>
  <div class="hardware-special-editor">
    <div class="row q-col-gutter-sm hardware-special-editor__fields">
      <div class="col-12">
        <q-select
          v-model="form.type"
          dense
          options-dense
          emit-value
          map-options
          :error="!serialValid"
          :error-message="gettext('Serial interface is not correctly configured.')"
          :options="displayOptions"
          :label="gettext('Graphic card')"
        />
      </div>
      <div class="col-12">
        <q-input
          v-model="form.memory"
          dense
          type="number"
          min="4"
          max="512"
          step="4"
          :disable="isNonGui"
          :error="!memoryValid"
          :error-message="`${gettext('The length for this field is')} [4-512]`"
          :label="`${gettext('Memory')} (MiB)`"
          :placeholder="memoryPlaceholder"
        />
      </div>
      <template v-if="advanced">
        <div class="col-12">
          <q-select
            v-model="form.clipboard"
            dense
            options-dense
            emit-value
            map-options
            :disable="isNonGui"
            :options="clipboardOptions"
            :label="gettext('Clipboard')"
          />
        </div>
        <div v-if="form.clipboard === 'vnc' && !isNonGui" class="col-12 hardware-editor-hint">
          {{
            gettext('You cannot use the default SPICE clipboard if the VNC clipboard is selected.')
          }}
          {{ gettext('VNC clipboard requires spice-tools installed in the Guest-VM.') }}
        </div>
        <div v-if="form.clipboard === 'vnc' && !isNonGui" class="col-12 hardware-editor-hint">
          {{
            gettext(
              'You cannot live-migrate while using the VNC clipboard with machine versions older than 10.1.',
            )
          }}
        </div>
        <div v-if="form.clipboard !== 'vnc' && !isNonGui" class="col-12 hardware-editor-hint">
          {{ gettext('This option depends on your display type.') }}
          {{
            gettext(
              'If the display type uses SPICE you are able to use the default SPICE clipboard.',
            )
          }}
        </div>
      </template>
    </div>
    <div class="hardware-special-editor__footer row items-center justify-between">
      <q-checkbox v-model="advanced" dense color="primary" :label="gettext('Advanced')" />
      <q-btn
        no-caps
        size="12px"
        class="bg-primary text-grey-1 u-button"
        :disable="!canSave"
        :label="gettext('Save')"
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
.hardware-editor-hint {
  padding: 8px 10px;
  border: 1px solid #b8d9ff;
  background: #e8f3ff;
  color: #1f5f9f;
  font-size: 12px;
  line-height: 1.5;
}
</style>
