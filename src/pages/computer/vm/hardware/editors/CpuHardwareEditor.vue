<script setup lang="ts">
import type { QTableColumn } from 'quasar';
import { computed, onMounted, reactive, shallowRef } from 'vue';
import { getVmCpuFlags, getVmCpuModels, type VmCpuFlag } from '@/api/vm';
import { getNodes, type PveRecord } from '@/api/resources';
import SelectTable from '@/components/SelectTable.vue';
import { gettext } from '@/locale';
import { useSessionStore } from '@/stores/session';
import { textValue } from '@/utils/pveFormat';
import { useVmHardwareContext } from '../context/vmHardwareContext';
import type { HardwareRow } from '../types';
import { getGuestArchitecture, isKvmEnabled } from '../vmHardwareUtils';

const { device } = defineProps<{ device: HardwareRow }>();
const { node, config, canEditRow, updateConfig } = useVmHardwareContext();
const session = useSessionStore();
const arch = computed(() => getGuestArchitecture(config.value));
const kvmEnabled = computed(() => isKvmEnabled(config.value));
const cgroupMode = shallowRef(2);
const cpuModels = shallowRef<PveRecord[]>([]);
const cpuFlags = shallowRef<VmCpuFlag[]>([]);
const cpuModelsLoading = shallowRef(false);
const cpuModelColumns: QTableColumn<PveRecord>[] = [
  {
    name: 'displayname',
    label: gettext('Model'),
    field: (row) => textValue(row.displayname),
    align: 'left',
  },
  {
    name: 'vendor',
    label: gettext('Vendor'),
    field: (row) => textValue(row.vendor),
    align: 'left',
  },
];
const cpuFlagColumns: QTableColumn<VmCpuFlag>[] = [
  {
    name: 'state',
    label: gettext('Value'),
    field: () => '',
    align: 'left',
    style: 'width: 190px',
    headerStyle: 'width: 190px',
  },
  {
    name: 'name',
    label: gettext('Flag'),
    field: (row) => textValue(row.name),
    align: 'left',
    style: 'width: 110px',
    headerStyle: 'width: 110px',
  },
  {
    name: 'description',
    label: gettext('Description'),
    field: (row) => textValue(row.description),
    align: 'left',
  },
  {
    name: 'supported-on',
    label: gettext('Supported On'),
    field: (row) => (Array.isArray(row['supported-on']) ? row['supported-on'].join(', ') : ''),
    align: 'left',
    style: 'width: 140px',
    headerStyle: 'width: 140px',
  },
];
const cpuFlagStateOptions = [
  { label: gettext('Off'), value: '-' },
  { label: gettext('Default'), value: '=' },
  { label: gettext('On'), value: '+' },
];

function parseQemuCpu(value: unknown) {
  const raw = textValue(value);
  const result = { cputype: '', flags: '' };
  raw
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
    .forEach((part) => {
      if (part.startsWith('flags=')) result.flags = part.slice(6);
      else if (!part.includes('=') && !result.cputype) result.cputype = part;
      else if (part.startsWith('cputype=')) result.cputype = part.slice(8);
    });
  return result;
}

const initialCpu = parseQemuCpu(config.value.cpu);

const form = reactive({
  sockets: Number(config.value.sockets || 1),
  cores: Number(config.value.cores || 1),
  cpu: initialCpu.cputype,
  originalCpu: initialCpu.cputype,
  cpuFlags: initialCpu.flags,
  args: textValue(config.value.args),
  vcpus: textValue(config.value.vcpus),
  vcpusEdited: Boolean(config.value.vcpus),
  cpulimit: textValue(config.value.cpulimit),
  cpuunits:
    textValue(config.value.cpuunits) && textValue(config.value.cpuunits) !== '100'
      ? textValue(config.value.cpuunits)
      : '',
  affinity: textValue(config.value.affinity),
  numa: Number(config.value.numa || 0) === 1,
});
const advanced = shallowRef(
  Boolean(
    config.value.vcpus ||
    config.value.cpulimit ||
    config.value.cpuunits ||
    config.value.affinity ||
    config.value.numa ||
    initialCpu.flags,
  ),
);
const totalCores = computed(() => Math.max(1, Number(form.sockets || 1) * Number(form.cores || 1)));
const cpuunitsMin = computed(() => (cgroupMode.value === 1 ? 2 : 1));
const cpuunitsMax = computed(() => (cgroupMode.value === 1 ? 262144 : 10000));
const cpuunitsDefault = computed(() => (cgroupMode.value === 1 ? 1024 : 100));
const canEditCpuAffinity = computed(() => session.userid === 'root@pam');
const cpuModelRows = computed<PveRecord[]>(() => {
  const rows = cpuModels.value
    .filter((cpu) => isCpuModelAvailable(textValue(cpu.name)))
    .map((cpu) => ({
      name: textValue(cpu.name),
      displayname: textValue(cpu.displayname) || textValue(cpu.name).replace(/^custom-/, ''),
      vendor: textValue(cpu.name) === 'host' ? 'Host' : textValue(cpu.vendor),
    }));
  if (form.cpu && !rows.some((row) => textValue(row.name) === form.cpu)) {
    rows.push({ name: form.cpu, displayname: form.cpu.replace(/^custom-/, ''), vendor: '' });
  }
  return rows;
});
const customCpuUnavailable = computed(
  () =>
    form.cpu.startsWith('custom-') &&
    !cpuModels.value.some((model) => textValue(model.name) === form.cpu),
);
const visibleCpuFlags = computed(() => (kvmEnabled.value ? cpuFlags.value : []));
const cpuModelDisplayValue = computed(
  () =>
    textValue(cpuModelRows.value.find((row) => textValue(row.name) === form.cpu)?.displayname) ||
    form.cpu ||
    `${gettext('Default')} (${arch.value === 'x86_64' ? 'x86-64-v2-AES' : 'host'})`,
);
const cpuValue = computed(() => {
  const parts = [form.cpu.trim()];
  if (form.cpuFlags.trim()) parts.push(`flags=${form.cpuFlags.trim()}`);
  return parts.filter(Boolean).join(',');
});

async function loadCpuCapabilities() {
  cpuModelsLoading.value = true;
  try {
    const [modelsResponse, flagsResponse, nodesResponse] = await Promise.all([
      getVmCpuModels(node.value, arch.value),
      getVmCpuFlags(node.value, arch.value),
      getNodes(),
    ]);
    const currentNode = (nodesResponse.data || []).find((item) => item.node === node.value) as
      (PveRecord & { 'cgroup-mode'?: unknown }) | undefined;
    cgroupMode.value = Number(currentNode?.['cgroup-mode'] ?? 2);
    cpuModels.value = (modelsResponse.data || []).sort((left, right) =>
      textValue(left.name).localeCompare(textValue(right.name)),
    );
    cpuFlags.value = (flagsResponse.data || [])
      .map((flag) => (typeof flag === 'string' ? { name: flag } : flag))
      .filter((flag) => Boolean(flag.name))
      .sort((left, right) => textValue(left.name).localeCompare(textValue(right.name)));
  } finally {
    cpuModelsLoading.value = false;
  }
}

function cpuFlagState(name: string) {
  const value = form.cpuFlags.split(';').find((entry) => entry.slice(1) === name);
  return value?.startsWith('+') ? '+' : value?.startsWith('-') ? '-' : '=';
}

function setCpuFlagState(name: string, state: string | number | null) {
  const entries = form.cpuFlags.split(';').filter((entry) => entry && entry.slice(1) !== name);
  if (state === '+' || state === '-') entries.push(`${state}${name}`);
  form.cpuFlags = entries.join(';');
}

function markVcpusEdited() {
  form.vcpusEdited = true;
  const vcpus = Number(form.vcpus);
  if (Number.isFinite(vcpus) && vcpus > totalCores.value) form.vcpus = String(totalCores.value);
  if (form.vcpus === '0') form.vcpus = '';
}

function addDelete(deletedKeys: string[], key: string) {
  if (!deletedKeys.includes(key)) deletedKeys.push(key);
}

function isValidCpuSet(value: string) {
  if (!value.trim()) return true;
  return value.split(',').every((part) => {
    const match = /^(\d+)(?:-(\d+))?$/.exec(part.trim());
    return Boolean(match && (!match[2] || Number(match[1]) <= Number(match[2])));
  });
}

function isCpuModelAvailable(name: string) {
  if (kvmEnabled.value) return true;
  if (arch.value === 'aarch64') return ['max', 'cortex-a53', 'cortex-a57'].includes(name);
  return ['max', 'qemu32', 'qemu64'].includes(name);
}

const affinityValid = computed(() => isValidCpuSet(form.affinity));
const canSave = computed(() => affinityValid.value);

async function save() {
  if (!canEditRow(device) || !canSave.value) return;
  const data = { cores: form.cores, sockets: form.sockets } as Record<string, string | number>;
  const deletedKeys: string[] = [];
  if (cpuValue.value) data.cpu = cpuValue.value;
  else if (config.value.cpu) addDelete(deletedKeys, 'cpu');

  if (form.originalCpu !== 'Hygon' && form.cpu === 'Hygon') {
    data.args = form.args
      ? `${form.args} -cpu EPYC,vendor=AuthenticAMD`
      : '-cpu EPYC,vendor=AuthenticAMD';
  }
  if (form.originalCpu === 'Hygon' && form.cpu !== 'Hygon') {
    if (form.args === '-cpu EPYC,vendor=AuthenticAMD') addDelete(deletedKeys, 'args');
    else data.args = form.args.replace('-cpu EPYC,vendor=AuthenticAMD', '').trim();
  }

  data.numa = form.numa ? 1 : 0;
  if (form.vcpus.trim() && form.vcpusEdited) data.vcpus = form.vcpus.trim();
  else addDelete(deletedKeys, 'vcpus');
  if (Number(form.cpulimit) > 0) data.cpulimit = form.cpulimit.trim();
  else addDelete(deletedKeys, 'cpulimit');
  if (form.affinity.trim()) data.affinity = form.affinity.trim();
  else addDelete(deletedKeys, 'affinity');
  if (form.cpuunits.trim() && Number(form.cpuunits) !== cpuunitsDefault.value)
    data.cpuunits = form.cpuunits.trim();
  else addDelete(deletedKeys, 'cpuunits');
  if (deletedKeys.length) data.delete = deletedKeys.join(',');
  await updateConfig(data);
}

onMounted(() => {
  void loadCpuCapabilities();
});
</script>

<template>
  <div class="hardware-special-editor">
    <div class="row q-col-gutter-lg hardware-special-editor__fields">
      <div class="col-6">
        <q-input
          v-model.number="form.sockets"
          dense
          :label="gettext('Sockets')"
          type="number"
          min="1"
        />
      </div>
      <div class="col-6">
        <SelectTable
          v-model="form.cpu"
          row-key="name"
          field-style="standard"
          width="500px"
          :rows="cpuModelRows"
          :columns="cpuModelColumns"
          :display-value="cpuModelDisplayValue"
          :loading="cpuModelsLoading"
          :get-row-value="(row) => textValue(row.name)"
          :label="gettext('Type')"
        />
      </div>
      <div v-if="customCpuUnavailable" class="col-12 hardware-editor-warning">
        {{
          gettext(
            'The current user cannot configure this custom CPU type. If you change it, you may not be able to select it again.',
          )
        }}
      </div>
      <div class="col-6">
        <q-input
          v-model.number="form.cores"
          dense
          :label="gettext('Cores')"
          type="number"
          min="1"
          max="256"
        />
      </div>
      <div class="col-6">
        <q-input :model-value="totalCores" dense disable :label="gettext('Total cores')" />
      </div>
      <template v-if="advanced">
        <div class="col-6">
          <q-input
            v-model="form.vcpus"
            dense
            :label="gettext('VCPUs')"
            type="number"
            min="1"
            :max="totalCores"
            :placeholder="String(totalCores)"
            @update:model-value="markVcpusEdited"
          />
        </div>
        <div class="col-6">
          <q-input
            v-model="form.cpuunits"
            dense
            :label="gettext('CPU units')"
            type="number"
            :min="cpuunitsMin"
            :max="cpuunitsMax"
            :placeholder="String(cpuunitsDefault)"
          />
        </div>
        <div class="col-6">
          <q-input
            v-model="form.cpulimit"
            dense
            :label="gettext('CPU limit')"
            type="number"
            min="0"
            max="128"
          />
        </div>
        <div class="col-6">
          <q-input
            v-model="form.affinity"
            dense
            :label="gettext('CPU Affinity')"
            :placeholder="gettext('All Cores')"
            :disable="!canEditCpuAffinity"
            :error="!affinityValid"
            :error-message="gettext('Use CPU indexes or ranges, for example 0-3,5.')"
          />
        </div>
        <div class="col-6">
          <q-checkbox v-model="form.numa" dense color="primary" :label="gettext('Enable NUMA')" />
        </div>
        <div class="col-12">
          <div class="vm-cpu-flags-label">{{ gettext('Extra CPU Flags') }}:</div>
          <q-table
            flat
            bordered
            dense
            hide-bottom
            row-key="name"
            class="vm-cpu-flags-table"
            table-header-class="u-table-header"
            :rows="visibleCpuFlags"
            :columns="cpuFlagColumns"
            :pagination="{ rowsPerPage: 0 }"
            :loading="cpuModelsLoading"
            :no-data-label="gettext('No CPU flags available')"
          >
            <template #body-cell-state="props">
              <q-td :props="props">
                <q-btn-toggle
                  dense
                  unelevated
                  no-caps
                  toggle-color="primary"
                  color="grey-3"
                  text-color="grey-8"
                  :model-value="cpuFlagState(textValue(props.row.name))"
                  :options="cpuFlagStateOptions"
                  @update:model-value="setCpuFlagState(textValue(props.row.name), $event)"
                />
              </q-td>
            </template>
          </q-table>
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
        :disable="!canSave"
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
.vm-cpu-flags-label {
  margin-bottom: 4px;
  color: #333333;
  font-size: 12px;
}
.vm-cpu-flags-table :deep(.q-table__middle) {
  max-height: 190px;
  overflow-y: auto;
}
.vm-cpu-flags-table :deep(.q-table td) {
  white-space: normal;
}
.vm-cpu-flags-table :deep(.q-btn-toggle .q-btn) {
  font-size: 11px;
}
.hardware-editor-warning {
  padding: 8px 10px;
  border: 1px solid #f0d38a;
  background: #fff8e1;
  color: #7a5713;
  font-size: 12px;
  line-height: 1.5;
}
</style>
