<script setup lang="ts">
import type { QTableColumn } from 'quasar';
import { computed, onMounted, ref, shallowRef, watch } from 'vue';
import UWindow from '@/components/UWindow.vue';
import type { PveRecord } from '@/api/resources';
import { getFirewallOptionsByBaseUrl, updateFirewallOptionsByBaseUrl } from '@/api/firewall';
import { gettext } from '@/locale';
import { textValue } from '@/utils/pveFormat';

type FirewallOptionsType = 'dc' | 'node' | 'vm' | 'vnet';
type OptionDefinition = {
  label: string;
  defaultValue: string | number;
  kind: 'boolean' | 'integer' | 'log' | 'policy' | 'rate-limit' | 'text';
  min?: number;
  options?: string[];
};

const { baseUrl = '/cluster/firewall/options', fwtype = 'dc' } = defineProps<{
  baseUrl?: string;
  fwtype?: FirewallOptionsType;
}>();

const definitions: Record<FirewallOptionsType, Record<string, OptionDefinition>> = {
  node: {
    enable: { label: 'Firewall', defaultValue: 1, kind: 'boolean' },
    nosmurfs: { label: 'SMURFS filter', defaultValue: 1, kind: 'boolean' },
    tcpflags: { label: 'TCP flags filter', defaultValue: 0, kind: 'boolean' },
    ndp: { label: 'NDP', defaultValue: 1, kind: 'boolean' },
    nf_conntrack_max: { label: 'nf_conntrack_max', defaultValue: '', kind: 'integer', min: 32768 },
    nf_conntrack_tcp_timeout_established: {
      label: 'nf_conntrack_tcp_timeout_established',
      defaultValue: '',
      kind: 'integer',
      min: 7875,
    },
    log_level_in: { label: 'log_level_in', defaultValue: 'nolog', kind: 'log' },
    log_level_out: { label: 'log_level_out', defaultValue: 'nolog', kind: 'log' },
    log_level_forward: { label: 'log_level_forward', defaultValue: 'nolog', kind: 'log' },
    tcp_flags_log_level: { label: 'tcp_flags_log_level', defaultValue: 'nolog', kind: 'log' },
    smurf_log_level: { label: 'smurf_log_level', defaultValue: 'nolog', kind: 'log' },
    nftables: { label: 'nftables (tech preview)', defaultValue: 0, kind: 'boolean' },
  },
  vm: {
    enable: { label: 'Firewall', defaultValue: 0, kind: 'boolean' },
    dhcp: { label: 'DHCP', defaultValue: 1, kind: 'boolean' },
    ndp: { label: 'NDP', defaultValue: 1, kind: 'boolean' },
    radv: { label: 'Router Advertisement', defaultValue: 0, kind: 'boolean' },
    macfilter: { label: 'MAC filter', defaultValue: 1, kind: 'boolean' },
    ipfilter: { label: 'IP filter', defaultValue: 0, kind: 'boolean' },
    log_level_in: { label: 'log_level_in', defaultValue: 'nolog', kind: 'log' },
    log_level_out: { label: 'log_level_out', defaultValue: 'nolog', kind: 'log' },
    policy_in: {
      label: 'Input Policy', defaultValue: 'DROP', kind: 'policy', options: ['ACCEPT', 'REJECT', 'DROP'],
    },
    policy_out: {
      label: 'Output Policy', defaultValue: 'ACCEPT', kind: 'policy', options: ['ACCEPT', 'REJECT', 'DROP'],
    },
  },
  dc: {
    enable: { label: 'Firewall', defaultValue: 0, kind: 'boolean' },
    ebtables: { label: 'ebtables', defaultValue: 1, kind: 'boolean' },
    log_ratelimit: {
      label: 'Log rate limit',
      defaultValue: 'enable=1,rate1/second,burst=5',
      kind: 'rate-limit',
    },
    policy_in: {
      label: 'Input Policy',
      defaultValue: 'DROP',
      kind: 'policy',
      options: ['ACCEPT', 'REJECT', 'DROP'],
    },
    policy_out: {
      label: 'Output Policy',
      defaultValue: 'ACCEPT',
      kind: 'policy',
      options: ['ACCEPT', 'REJECT', 'DROP'],
    },
    policy_forward: {
      label: 'Forward Policy',
      defaultValue: 'ACCEPT',
      kind: 'policy',
      options: ['ACCEPT', 'DROP'],
    },
  },
  vnet: {
    enable: { label: 'Firewall', defaultValue: 0, kind: 'boolean' },
    log_level_forward: { label: 'log_level_forward', defaultValue: 'nolog', kind: 'log' },
    policy_forward: {
      label: 'Forward Policy',
      defaultValue: 'ACCEPT',
      kind: 'policy',
      options: ['ACCEPT', 'DROP'],
    },
  },
};
const logLevels = ['nolog', 'emerg', 'alert', 'crit', 'err', 'warning', 'notice', 'info', 'debug'];
const loading = shallowRef(false);
const dialog = shallowRef(false);
const rows = shallowRef<PveRecord[]>([]);
const active = ref<PveRecord>({});
const rateLimit = ref({ enable: 1, rate: 1, unit: 'second', burst: 5 });
const optionDefinitions = computed(() => definitions[fwtype]);
const activeDefinition = computed(() => optionDefinitions.value[textValue(active.value.key)]);
const activeValue = computed<string | number | undefined>({
  get() {
    const value = active.value.value;
    return typeof value === 'string' || typeof value === 'number' ? value : undefined;
  },
  set(value) {
    active.value.value = value;
  },
});
function isEmptyValue(value: unknown) {
  return value === '' || value == null;
}
const activeFormValid = computed(() => {
  const definition = activeDefinition.value;
  if (!definition) return false;
  if (definition.kind === 'integer') {
    const value = activeValue.value;
    return isEmptyValue(value) || (Number.isInteger(Number(value)) && Number(value) >= Number(definition.min));
  }
  if (definition.kind === 'rate-limit') {
    return [rateLimit.value.rate, rateLimit.value.burst].every(value => Number.isInteger(value) && value >= 1 && value <= 99);
  }
  return true;
});

const columns: QTableColumn<PveRecord>[] = [
  {
    name: 'key',
    label: gettext('Option'),
    align: 'left',
    field: (row) => gettext(textValue(row.label)),
    sortable: false,
  },
  {
    name: 'value',
    label: gettext('Value'),
    align: 'left',
    field: (row) => row.value,
    sortable: false,
  },
];

function displayValue(value: unknown, definition: OptionDefinition) {
  if (definition.kind === 'boolean')
    return Number(value) ? gettext('Enabled') : gettext('Disabled');
  return textValue(value);
}

async function refreshData() {
  loading.value = true;
  try {
    const data = (await getFirewallOptionsByBaseUrl(baseUrl)).data || {};
    rows.value = Object.entries(optionDefinitions.value).map(([key, definition]) => {
      const rawValue = data[key] === undefined ? definition.defaultValue : data[key];
      return {
        key,
        label: definition.label,
        value: rawValue,
        display: displayValue(rawValue, definition),
        isDefault: data[key] === undefined,
      };
    });
  } finally {
    loading.value = false;
  }
}

function openEdit(row: PveRecord) {
  active.value = { ...row };
  if (activeDefinition.value?.kind === 'rate-limit') {
    const properties = Object.fromEntries(textValue(row.value).split(',').map(item => item.split('=')));
    const [rate = '1', unit = 'second'] = String(properties.rate || '1/second').split('/');
    rateLimit.value = {
      enable: Number(properties.enable ?? 1) ? 1 : 0,
      rate: Number(rate) || 1,
      unit: ['second', 'minute', 'hour', 'day'].includes(unit) ? unit : 'second',
      burst: Number(properties.burst) || 5,
    };
  }
  dialog.value = true;
}
async function submitForm() {
  const key = textValue(active.value.key);
  const definition = activeDefinition.value;
  if (!definition || !activeFormValid.value) return;
  const value = definition.kind === 'rate-limit'
    ? `enable=${rateLimit.value.enable},rate=${rateLimit.value.rate}/${rateLimit.value.unit},burst=${rateLimit.value.burst}`
    : active.value.value;
  const data = definition.kind === 'integer' && isEmptyValue(value) ? { delete: key } : { [key]: value };
  loading.value = true;
  try {
    await updateFirewallOptionsByBaseUrl(baseUrl, data);
    dialog.value = false;
    await refreshData();
  } finally {
    loading.value = false;
  }
}

onMounted(refreshData);
watch(
  [() => baseUrl, () => fwtype],
  () => {
    void refreshData();
  },
);
</script>

<template>
  <div>
    <q-table
      flat
      row-key="key"
      table-header-class="u-table-header"
      :rows="rows"
      :columns="columns"
      :pagination="{ page: 1, rowsPerPage: 10 }"
      :rows-per-page-options="[10]"
      :loading="loading"
      :no-data-label="gettext('no record can be found')"
    >
      <template #top
        ><q-btn
          no-caps
          outline
          size="12px"
          color="primary"
          class="u-button"
          :label="gettext('Refresh')"
          @click="refreshData"
      /></template>
      <template #body-cell-value="scope"
        ><q-td :props="scope" class="cursor-pointer" @click="openEdit(scope.row)"
          >{{ scope.row.display
          }}<span v-if="scope.row.isDefault" class="text-grey-6">
            ({{ gettext('Default') }})</span
          ></q-td
        ></template
      >
    </q-table>
    <q-dialog v-model="dialog" persistent
      ><UWindow
        :title="`${gettext('Edit')}: ${gettext(textValue(active.label))}`"
        width="420px"
        :loading="loading"
        ><div class="q-pa-md">
          <q-option-group
            v-if="activeDefinition?.kind === 'boolean'"
            v-model="activeValue"
            inline
            type="radio"
            color="primary"
            :options="[
              { label: gettext('Enabled'), value: 1 },
              { label: gettext('Disabled'), value: 0 },
            ]"
          />
          <q-select
            v-else-if="activeDefinition?.kind === 'log'"
            v-model="activeValue"
            square
            outlined
            dense
            :label="gettext('Log level')"
            :options="logLevels"
          />
          <q-select
            v-else-if="activeDefinition?.kind === 'policy'"
            v-model="activeValue"
            square
            outlined
            dense
            :label="gettext(activeDefinition.label)"
            :options="activeDefinition.options || []"
          />
          <q-input
            v-else-if="activeDefinition?.kind === 'integer'"
            v-model.number="activeValue"
            square
            outlined
            dense
            clearable
            type="number"
            :label="gettext(activeDefinition.label)"
            :min="activeDefinition.min"
            :rules="[
              value =>
                value === '' ||
                value == null ||
                (Number.isInteger(Number(value)) &&
                  Number(value) >= Number(activeDefinition?.min)) ||
                gettext('Value must be at least %s').replace('%s', String(activeDefinition?.min)),
            ]"
          />
          <div v-else-if="activeDefinition?.kind === 'rate-limit'" class="q-gutter-md">
            <q-checkbox
              v-model="rateLimit.enable"
              :true-value="1"
              :false-value="0"
              :label="gettext('Enable')"
            />
            <div class="row q-col-gutter-sm">
              <q-input
                v-model.number="rateLimit.rate"
                class="col-5"
                square
                outlined
                dense
                type="number"
                :min="1"
                :max="99"
                :label="gettext('Log rate limit')"
              />
              <q-select
                v-model="rateLimit.unit"
                class="col-7"
                square
                outlined
                dense
                :label="gettext('Unit')"
                :options="['second', 'minute', 'hour', 'day']"
              />
            </div>
            <q-input
              v-model.number="rateLimit.burst"
              square
              outlined
              dense
              type="number"
              :min="1"
              :max="99"
              :label="gettext('Log burst limit')"
            />
          </div>
          <q-input v-else v-model="activeValue" square outlined dense :label="gettext('Value')" />
        </div>
        <template #foot
          ><q-btn
            v-close-popup
            no-caps
            flat
            size="12px"
            class="u-button"
            :label="gettext('Cancel')" /><q-btn
            no-caps
            flat
            size="12px"
            class="bg-primary text-grey-1 u-button"
            :disable="!activeFormValid"
            :label="gettext('OK')"
            @click="submitForm" /></template></UWindow
    ></q-dialog>
  </div>
</template>
