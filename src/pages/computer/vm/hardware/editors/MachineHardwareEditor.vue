<script setup lang="ts">
import { computed, onMounted, reactive, shallowRef, watch } from 'vue';
import { getVmMachineTypes } from '@/api/vm';
import { gettext } from '@/locale';
import { textValue } from '@/utils/pveFormat';
import { useVmHardwareContext } from '../context/vmHardwareContext';
import type { HardwareRow } from '../types';
import {
  getGuestArchitecture,
  parseVmHardwarePropertyString,
  printVmHardwarePropertyString,
} from '../vmHardwareUtils';

const { device } = defineProps<{ device: HardwareRow }>();
const { node, config, canEditRow, updateConfig } = useVmHardwareContext();
const arch = computed(() => getGuestArchitecture(config.value));
const isArm = computed(() => arch.value === 'aarch64');
const isWindows = computed(() => /^win/.test(textValue(config.value.ostype)));

function parseMachine(value: unknown) {
  const result = { machine: '__default__', version: 'latest', viommu: '__default__' };
  const parsed = parseVmHardwarePropertyString(value, 'type');
  if (parsed.type) result.machine = parsed.type;
  if (parsed.viommu) result.viommu = parsed.viommu;
  if (result.machine === 'pc') result.machine = '__default__';
  if (result.machine !== '__default__' && result.machine !== 'q35') {
    result.version = result.machine;
    result.machine = result.version.includes('q35') ? 'q35' : '__default__';
  }
  return result;
}

const form = reactive(parseMachine(config.value.machine));
const rawMachine = textValue(config.value.machine);
if (isWindows.value && (!rawMachine || rawMachine === 'pc')) form.version = 'pc-i440fx-5.1';
if (isWindows.value && rawMachine === 'q35') form.version = 'pc-q35-5.1';
const advanced = shallowRef(
  Boolean(
    config.value.machine &&
    (textValue(config.value.machine).includes(',') || form.version !== 'latest'),
  ),
);
const machineRows = shallowRef<Array<{ id?: string; type?: string; version?: string }>>([]);

function machineRowKind(row: { id?: string; type?: string; version?: string }) {
  const id = textValue(row.id).toLowerCase();
  const type = textValue(row.type).toLowerCase();
  const version = textValue(row.version).toLowerCase();
  const text = `${id} ${type} ${version}`;
  if (type === 'q35' || text.includes('q35')) return 'q35';
  if (type === 'pc' || type === 'i440fx' || text.includes('i440fx')) return 'i440fx';
  return '';
}

function machineRowOption(row: { id?: string; type?: string; version?: string }) {
  const id = textValue(row.id);
  const version = textValue(row.version);
  return {
    label: version || id,
    value: id || version,
  };
}

const machineOptions = computed(() =>
  isArm.value
    ? [{ label: `${gettext('Default')} (virt)`, value: '__default__' }]
    : [
        { label: `${gettext('Default')} (i440fx)`, value: '__default__' },
        { label: 'q35', value: 'q35' },
      ],
);
const versionOptions = computed(() => {
  const type = form.machine === 'q35' ? 'q35' : 'i440fx';
  const matchedRows = machineRows.value.filter((row) => machineRowKind(row) === type);
  const rows = (matchedRows.length ? matchedRows : machineRows.value)
    .map(machineRowOption)
    .filter((row) => row.value);
  const uniqueRows = Array.from(new Map(rows.map((row) => [row.value, row])).values());
  return [
    ...(isWindows.value ? [] : [{ label: gettext('Latest'), value: 'latest' }]),
    ...uniqueRows,
  ];
});
const viommuOptions = computed(() => {
  const base = [{ label: `${gettext('Default')} (${gettext('None')})`, value: '__default__' }];
  return form.machine === 'q35'
    ? [
        ...base,
        { label: 'Intel (AMD Compatible)', value: 'intel' },
        { label: 'VirtIO', value: 'virtio' },
      ]
    : [...base, { label: 'VirtIO', value: 'virtio' }];
});

function buildMachineValue() {
  const machine =
    form.version && form.version !== 'latest'
      ? form.version.trim()
      : form.machine === '__default__'
        ? 'pc'
        : form.machine;
  if (form.machine === '__default__' && form.version === 'latest' && form.viommu === '__default__')
    return '';
  return printVmHardwarePropertyString(
    { type: machine, ...(form.viommu !== '__default__' ? { viommu: form.viommu } : {}) },
    'type',
  );
}

function machineVersionSuffix(value: string) {
  return /^pc-(?:i440fx|q35)-(.+)$/.exec(value)?.[1] || '';
}

function matchingMachineVersion(machine: string, previousVersion: string) {
  const suffix = machineVersionSuffix(previousVersion);
  if (!suffix) return '';
  const prefix = machine === 'q35' ? 'pc-q35-' : 'pc-i440fx-';
  const expected = `${prefix}${suffix}`;
  return versionOptions.value.some((option) => option.value === expected) ? expected : '';
}

async function save() {
  if (!canEditRow(device)) return;
  const machine = buildMachineValue();
  await updateConfig(machine ? { machine } : { delete: 'machine' });
}

watch(
  () => form.machine,
  (machine) => {
    const matchedVersion = matchingMachineVersion(machine, form.version);
    if (matchedVersion) {
      form.version = matchedVersion;
      return;
    }
    if (!versionOptions.value.some((option) => option.value === form.version)) {
      form.version = isWindows.value
        ? machine === 'q35'
          ? 'pc-q35-5.1'
          : 'pc-i440fx-5.1'
        : 'latest';
    }
  },
);

onMounted(async () => {
  machineRows.value = (await getVmMachineTypes(node.value, arch.value)).data || [];
});
</script>

<template>
  <div class="hardware-special-editor">
    <div class="row q-col-gutter-sm hardware-special-editor__fields">
      <div class="col-12">
        <q-select
          v-model="form.machine"
          dense
          options-dense
          emit-value
          map-options
          :options="machineOptions"
          :label="gettext('Machine')"
        />
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
          {{
            gettext(
              'Machine version change may affect hardware layout and settings in the guest OS.',
            )
          }}
        </div>
        <div class="col-12">
          <q-select
            v-model="form.viommu"
            dense
            options-dense
            emit-value
            map-options
            :options="viommuOptions"
            label="vIOMMU"
          />
        </div>
      </template>
    </div>
    <div class="hardware-special-editor__footer row items-center justify-between">
      <q-checkbox v-model="advanced" dense color="primary" :label="gettext('Advanced')" />
      <q-btn
        no-caps
        size="12px"
        class="bg-primary text-grey-1 u-button"
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
