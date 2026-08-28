<script setup lang="ts">
import type { QTableColumn } from 'quasar';
import { Dialog } from 'quasar';
import { computed, onMounted, reactive, ref, shallowRef } from 'vue';
import {
  deleteCustomCpuType,
  getCpuFlags,
  getCpuModels,
  getCustomCpuType,
  getCustomCpuTypes,
  saveCustomCpuType,
} from '@/api/cpuTypes';
import type { CpuFlag, CpuModel } from '@/api/cpuTypes';
import type { PveRecord } from '@/api/resources';
import UWindow from '@/components/UWindow.vue';
import { gettext } from '@/locale';
import { textValue } from '@/utils/pveFormat';

type CpuFlagRow = CpuFlag & { state: '+' | '-' | '='; unknown?: boolean };
const rows = shallowRef<PveRecord[]>([]);
const selected = ref<PveRecord[]>([]);
const loading = ref(false);
const saving = ref(false);
const submitted = ref(false);
const editorVisible = ref(false);
const editingId = ref<string>();
const form = reactive({
  cputype: '',
  reportedModel: '',
  hvVendorId: '',
  physBits: '',
  hidden: false,
  flags: '',
});
const cpuModels = shallowRef<CpuModel[]>([]);
const baseModelOptions = shallowRef<{ label: string; value: string }[]>([]);
const cpuFlags = shallowRef<CpuFlagRow[]>([]);
const selectorLoading = ref(false);
const columns: QTableColumn<PveRecord>[] = [
  {
    name: 'cputype',
    label: gettext('Name'),
    align: 'left',
    field: (row) => textValue(row.cputype).replace(/^custom-/, ''),
    sortable: true,
  },
  {
    name: 'reported-model',
    label: gettext('Base Model'),
    align: 'left',
    field: (row) => textValue(row['reported-model']),
  },
  {
    name: 'phys-bits',
    label: gettext('Physical Address Bits'),
    align: 'left',
    field: (row) => textValue(row['phys-bits']),
  },
  {
    name: 'hidden',
    label: gettext('Hide Hypervisor'),
    align: 'left',
    field: (row) => (Number(row.hidden) ? gettext('Yes') : gettext('No')),
  },
  {
    name: 'hv-vendor-id',
    label: gettext('Hyper-V Vendor'),
    align: 'left',
    field: (row) => textValue(row['hv-vendor-id']),
  },
  { name: 'flags', label: gettext('Flags'), align: 'left', field: (row) => textValue(row.flags) },
];
const flagColumns: QTableColumn<CpuFlagRow>[] = [
  { name: 'state', label: gettext('Value'), field: 'state', align: 'left' },
  { name: 'name', label: gettext('Flag'), field: 'name', align: 'left' },
  { name: 'description', label: gettext('Description'), field: 'description', align: 'left' },
  {
    name: 'supported-on',
    label: gettext('Supported On'),
    field: (row) => (Array.isArray(row['supported-on']) ? row['supported-on'].join(', ') : ''),
    align: 'left',
  },
];
const configIdValid = computed(() => /^[A-Za-z0-9_][A-Za-z0-9_.-]*$/.test(form.cputype.trim()));
const physBitsValid = computed(
  () =>
    !form.physBits ||
    form.physBits === 'host' ||
    (Number.isInteger(Number(form.physBits)) &&
      Number(form.physBits) >= 8 &&
      Number(form.physBits) <= 64)
);
const canSave = computed(
  () =>
    configIdValid.value &&
    physBitsValid.value &&
    (editingId.value !== undefined || Boolean(form.reportedModel.trim()))
);
function setCpuFlagStates() {
  const states = new Map(
    form.flags
      .split(';')
      .filter(Boolean)
      .map((flag) => [flag.slice(1), flag[0] as '+' | '-'])
  );
  const known = cpuFlags.value
    .filter((flag) => !flag.unknown)
    .map((flag) => ({ ...flag, state: states.get(textValue(flag.name)) || ('=' as const) }));
  const unknown = [...states]
    .filter(([name]) => !known.some((flag) => flag.name === name))
    .map(([name, state]) => ({
      name,
      state,
      unknown: true,
      description: gettext('This flag is not supported by any node in the cluster.'),
    }));
  cpuFlags.value = [...unknown, ...known];
}
function reset(data: PveRecord = {}) {
  submitted.value = false;
  Object.assign(form, {
    cputype: textValue(data.cputype).replace(/^custom-/, ''),
    reportedModel: textValue(data['reported-model']),
    hvVendorId: textValue(data['hv-vendor-id']),
    physBits: textValue(data['phys-bits']),
    hidden: Number(data.hidden) === 1,
    flags: textValue(data.flags),
  });
  setCpuFlagStates();
}
async function reload() {
  loading.value = true;
  try {
    rows.value = (await getCustomCpuTypes()).data || [];
    selected.value = [];
  } finally {
    loading.value = false;
  }
}
function add() {
  editingId.value = undefined;
  reset();
  editorVisible.value = true;
}
async function edit(row?: PveRecord) {
  const target = row || selected.value[0];
  if (!target) return;
  editingId.value = textValue(target.cputype);
  reset((await getCustomCpuType(editingId.value)).data || target);
  editorVisible.value = true;
}
function deleteIfDefault(data: PveRecord, name: string, defaultValue: string | number) {
  if (data[name] === '' || data[name] === defaultValue) {
    if (editingId.value) {
      const deleted = textValue(data.delete);
      data.delete = deleted ? `${deleted},${name}` : name;
    }
    delete data[name];
  }
}
function payload() {
  const data: PveRecord = {
    'reported-model': form.reportedModel.trim(),
    'hv-vendor-id': form.hvVendorId.trim(),
    'phys-bits': form.physBits.trim(),
    hidden: form.hidden ? 1 : 0,
    flags: form.flags.trim(),
  };
  deleteIfDefault(data, 'reported-model', '');
  deleteIfDefault(data, 'hv-vendor-id', '');
  deleteIfDefault(data, 'phys-bits', '');
  deleteIfDefault(data, 'hidden', 0);
  deleteIfDefault(data, 'flags', '');
  return data;
}
async function save() {
  submitted.value = true;
  if (!canSave.value) return;
  saving.value = true;
  try {
    const data = payload();
    await saveCustomCpuType(
      editingId.value,
      editingId.value ? data : { ...data, cputype: form.cputype.trim() }
    );
    editorVisible.value = false;
    await reload();
  } finally {
    saving.value = false;
  }
}
function setCpuFlagState(name: string, state: '+' | '-' | '=') {
  cpuFlags.value = cpuFlags.value.map((flag) => (flag.name === name ? { ...flag, state } : flag));
  form.flags = cpuFlags.value
    .filter((flag) => flag.state !== '=')
    .map((flag) => `${flag.state}${flag.name}`)
    .join(';');
}
function filterBaseModels(value: string, update: (fn: () => void) => void) {
  update(() => {
    const query = value.toLowerCase();
    baseModelOptions.value = cpuModels.value
      .filter(
        (model) =>
          !model.custom && !model.abstract && textValue(model.name).toLowerCase().includes(query)
      )
      .map((model) => ({
        label: textValue(model.displayname || model.name).replace(/^custom-/, ''),
        value: textValue(model.name),
      }));
  });
}
async function loadSelectors() {
  selectorLoading.value = true;
  try {
    const [models, flags] = await Promise.all([getCpuModels(), getCpuFlags()]);
    cpuModels.value = models.data || [];
    cpuFlags.value = (flags.data || []).map((flag) => ({ ...flag, state: '=' }));
    filterBaseModels('', (fn) => fn());
    setCpuFlagStates();
  } finally {
    selectorLoading.value = false;
  }
}
function remove() {
  const row = selected.value[0];
  if (!row) return;
  const id = textValue(row.cputype);
  Dialog.create({
    title: gettext('Confirm'),
    message: gettext("Are you sure you want to remove the custom CPU model '%s'?").replace(
      '%s',
      id.replace(/^custom-/, '')
    ),
    cancel: true,
    persistent: true,
  }).onOk(() => void deleteCustomCpuType(id).then(reload));
}
onMounted(() => {
  void reload();
  void loadSelectors();
});
</script>

<template>
  <div class="q-pa-md bg-white q-ma-md">
    <q-table
      flat
      row-key="cputype"
      selection="single"
      table-header-class="u-table-header"
      :rows="rows"
      :columns="columns"
      :selected="selected"
      :loading="loading"
      :pagination="{ sortBy: 'cputype', descending: false, rowsPerPage: 10 }"
      :rows-per-page-options="[10]"
      :no-data-label="gettext('No custom CPU models configured')"
      @update:selected="selected = [...$event]"
      @row-dblclick="(_, row) => void edit(row)"
    >
      <template #top>
        <div class="row q-gutter-sm">
          <q-btn
            no-caps
            outline
            size="12px"
            color="primary"
            class="u-button"
            :label="gettext('Add')"
            @click="add"
          />
          <q-btn
            no-caps
            outline
            size="12px"
            color="primary"
            class="u-button"
            :disable="selected.length !== 1"
            :label="gettext('Edit')"
            @click="() => void edit()"
          />
          <q-btn
            no-caps
            outline
            size="12px"
            class="u-button"
            :color="selected.length === 1 ? 'red' : 'grey'"
            :disable="selected.length !== 1"
            :label="gettext('Remove')"
            @click="remove"
          />
          <q-space />
          <q-btn
            no-caps
            outline
            size="12px"
            color="primary"
            class="u-button"
            :label="gettext('Reload')"
            @click="reload"
          />
        </div>
      </template>
    </q-table>
  </div>
  <q-dialog
    v-model="editorVisible"
    persistent
  >
    <UWindow
      :title="`${editingId ? gettext('Edit') : gettext('Add')}: ${gettext('CPU Type')}`"
      width="800px"
      :loading="saving"
    >
      <div class="q-pa-sm u-dense">
        <div class="u-border q-pa-md">
          <q-input
            v-model="form.cputype"
            dense
            class="q-field--with-bottom"
            maxlength="40"
            :disable="Boolean(editingId)"
            :label="`${gettext('Name')} *`"
            :error="submitted && !configIdValid"
            :error-message="
              form.cputype.trim()
                ? gettext('Only letters, numbers, underscores, dots and hyphens are allowed')
                : gettext('This field is required')
            "
          />
          <q-select
            v-model="form.reportedModel"
            dense
            class="q-field--with-bottom"
            use-input
            clearable
            emit-value
            map-options
            hide-selected
            :loading="selectorLoading"
            :options="baseModelOptions"
            :label="`${gettext('Base Model')} *`"
            hint="CPU model the rest of the configuration is based on."
            :error="submitted && !editingId && !form.reportedModel.trim()"
            :error-message="gettext('This field is required')"
            @filter="filterBaseModels"
          />
          <q-input
            v-model="form.hvVendorId"
            dense
            maxlength="12"
            class="q-field--with-bottom"
            :label="gettext('Hyper-V Vendor')"
          />
          <div class="q-field--with-bottom cpu-physical-bits">
            <div class="q-field__label q-mb-sm">{{ gettext('Physical Address Bits') }}</div>
            <div class="cpu-physical-bits__options">
              <q-radio
                v-model="form.physBits"
                dense
                val=""
                :label="gettext('Default from QEMU')"
              />
              <q-radio
                v-model="form.physBits"
                dense
                val="host"
                :label="gettext('Inherit from host CPU')"
              />
              <q-radio
                v-model="form.physBits"
                dense
                :val="form.physBits && form.physBits !== 'host' ? form.physBits : '48'"
                :label="gettext('Custom value')"
              />
            </div>
            <q-input
              v-if="form.physBits !== 'host' && form.physBits !== ''"
              v-model="form.physBits"
              dense
              type="number"
              min="8"
              max="64"
              :label="gettext('Custom value')"
              :error="submitted && !physBitsValid"
              :error-message="gettext('Value must be 8-64')"
            />
          </div>
          <q-checkbox
            v-model="form.hidden"
            dense
            class="q-field--with-bottom"
            :label="gettext('Hide Hypervisor')"
          />
          <div class="q-field--with-bottom">
            <div class="q-field__label q-mb-sm">{{ gettext('Extra CPU flags') }}</div>
            <q-table
              flat
              dense
              hide-bottom
              row-key="name"
              class="vm-cpu-flags-table"
              :rows="cpuFlags"
              :columns="flagColumns"
              :loading="selectorLoading"
              :pagination="{ rowsPerPage: 0 }"
            >
              <template #body-cell-state="props">
                <q-td :props="props">
                  <q-btn-toggle
                    :model-value="props.row.state"
                    dense
                    no-caps
                    unelevated
                    toggle-color="primary"
                    :options="[
                      { label: gettext('Off'), value: '-' },
                      { label: gettext('Default'), value: '=' },
                      { label: gettext('On'), value: '+' },
                    ]"
                    @update:model-value="setCpuFlagState(textValue(props.row.name), $event)"
                  />
                </q-td>
              </template>
            </q-table>
          </div>
        </div>
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
          :disable="saving"
          :label="editingId ? gettext('OK') : gettext('Create')"
          @click="save"
        />
      </template>
    </UWindow>
  </q-dialog>
</template>

<style scoped lang="scss">
.vm-cpu-flags-table :deep(.q-table__middle) {
  max-height: 280px;
  overflow-y: auto;
}

.vm-cpu-flags-table :deep(thead tr th) {
  position: sticky;
  top: 0;
  z-index: 1;
  background: #f5f7fa;
}

.cpu-physical-bits__options {
  display: grid;
  gap: 6px;
  margin: 4px 0 8px;
}
</style>
