<script setup lang="ts">
import { computed, onMounted, reactive, shallowRef, watch } from 'vue';
import { getVmMachineTypes } from '@/api/vm';
import { gettext } from '@/locale';
import { textValue } from '@/utils/pveFormat';
import { useVmHardwareContext } from '../context/vmHardwareContext';
import type { HardwareRow } from '../types';

const { device } = defineProps<{ device: HardwareRow }>();
const { node, config, canEditRow, updateConfig } = useVmHardwareContext();

function parseMachine(value: unknown) {
  const result = { machine: '__default__', version: 'latest', viommu: '__default__' };
  const raw = textValue(value);
  if (!raw) return result;
  raw.split(',').forEach((part) => {
    const [key, optionValue] = part.split('=', 2);
    if (optionValue === undefined || key === 'type') result.machine = optionValue || key;
    else if (key === 'viommu') result.viommu = optionValue;
  });
  if (result.machine === 'pc') result.machine = '__default__';
  if (result.machine !== '__default__' && result.machine !== 'q35') {
    result.version = result.machine;
    result.machine = result.version.includes('q35') ? 'q35' : '__default__';
  }
  return result;
}

const form = reactive(parseMachine(config.value.machine));
const advanced = shallowRef(Boolean(config.value.machine && (textValue(config.value.machine).includes(',') || form.version !== 'latest')));
const machineRows = shallowRef<Array<{ id?: string; type?: string; version?: string }>>([]);
const machineOptions = computed(() => [
  { label: `${gettext('Default')} (i440fx)`, value: '__default__' },
  { label: 'q35', value: 'q35' },
]);
const versionOptions = computed(() => {
  const type = form.machine === 'q35' ? 'q35' : 'i440fx';
  const rows = machineRows.value
    .filter((row) => textValue(row.type) === type)
    .map((row) => ({
      label: textValue(row.version) || textValue(row.id),
      value: textValue(row.id),
    }))
    .filter((row) => row.value);
  return [{ label: gettext('Latest'), value: 'latest' }, ...rows];
});
const viommuOptions = computed(() => {
  const base = [{ label: `${gettext('Default')} (${gettext('None')})`, value: '__default__' }];
  return form.machine === 'q35'
    ? [...base, { label: 'Intel (AMD Compatible)', value: 'intel' }, { label: 'VirtIO', value: 'virtio' }]
    : [...base, { label: 'VirtIO', value: 'virtio' }];
});

function buildMachineValue() {
  const machine = form.version && form.version !== 'latest'
    ? form.version.trim()
    : form.machine === '__default__'
      ? 'pc'
      : form.machine;
  if (form.machine === '__default__' && form.version === 'latest' && form.viommu === '__default__') return '';
  const parts = [machine];
  if (advanced.value && form.viommu !== '__default__') parts.push(`viommu=${form.viommu}`);
  return parts.join(',');
}

async function save() {
  if (!canEditRow(device)) return;
  const machine = buildMachineValue();
  await updateConfig(machine ? { machine } : { delete: 'machine' });
}

watch(
  () => form.machine,
  () => {
    if (!versionOptions.value.some((option) => option.value === form.version)) form.version = 'latest';
  },
);

onMounted(async () => {
  machineRows.value = await getVmMachineTypes(node.value, textValue(config.value.arch));
});
</script>

<template>
  <div class="hardware-special-editor">
    <div class="row q-col-gutter-sm hardware-special-editor__fields">
      <div class="col-12">
        <q-select v-model="form.machine" dense options-dense emit-value map-options :options="machineOptions" :label="gettext('Machine')" />
      </div>
      <template v-if="advanced">
        <div class="col-12">
          <q-select
            v-model="form.version"
            dense
            options-dense
            emit-value
            map-options
            :options="versionOptions"
            :label="gettext('Version')"
          />
        </div>
        <div class="col-12 hardware-editor-hint">
          {{ gettext('Machine version change may affect hardware layout and settings in the guest OS.') }}
        </div>
        <div class="col-12">
          <q-select v-model="form.viommu" dense options-dense emit-value map-options :options="viommuOptions" label="vIOMMU" />
        </div>
      </template>
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
.hardware-editor-hint {
  padding: 8px 10px;
  border: 1px solid #b8d9ff;
  background: #e8f3ff;
  color: #1f5f9f;
  font-size: 12px;
  line-height: 1.5;
}
</style>
