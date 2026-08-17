<script setup lang="ts">
import { computed, onMounted, ref, shallowRef, watch } from 'vue';
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
const rows = shallowRef<PveRecord[]>([]);
const active = ref<PveRecord>({});
const rateLimit = ref({ enable: 1, rate: 1, unit: 'second', burst: 5 });
const optionDefinitions = computed(() => definitions[fwtype]);

function optionIcon(key: string, value?: unknown) {
  if (key === 'enable')
    return Number(value) ? 'mdi/toggle-switch' : 'mdi/toggle-switch-off-outline';
  if (key === 'nftables' || key === 'ebtables') return 'mdi-lan-connect';
  if (key === 'nosmurfs' || key === 'tcpflags') return 'mdi-shield-alert';
  if (key.startsWith('policy_')) return 'mdi-shield-check-outline';
  if (key.startsWith('log_level_') || key.endsWith('_log_level')) return 'mdi-format-list-text';
  if (key === 'log_ratelimit') return 'mdi-speedometer';
  if (key.startsWith('nf_conntrack')) return 'mdi-sync';
  if (['dhcp', 'ndp', 'radv', 'macfilter', 'ipfilter'].includes(key)) return 'mdi-router-network';
  return 'mdi-cog-outline';
}
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
    return (
      isEmptyValue(value) ||
      (Number.isInteger(Number(value)) && Number(value) >= Number(definition.min))
    );
  }
  if (definition.kind === 'rate-limit') {
    return [rateLimit.value.rate, rateLimit.value.burst].every(
      (value) => Number.isInteger(value) && value >= 1 && value <= 99
    );
  }
  return true;
});

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

async function submitForm() {
  const key = textValue(active.value.key);
  const definition = activeDefinition.value;
  if (!definition || !activeFormValid.value) return;
  const value =
    definition.kind === 'rate-limit'
      ? `enable=${rateLimit.value.enable},rate=${rateLimit.value.rate}/${rateLimit.value.unit},burst=${rateLimit.value.burst}`
      : active.value.value;
  const data =
    definition.kind === 'integer' && isEmptyValue(value) ? { delete: key } : { [key]: value };
  loading.value = true;
  try {
    await updateFirewallOptionsByBaseUrl(baseUrl, data);
    await refreshData();
  } finally {
    loading.value = false;
  }
}

function openEdit(row: PveRecord) {
  active.value = { ...row };
  if (activeDefinition.value?.kind === 'rate-limit') {
    const properties = Object.fromEntries(
      textValue(row.value)
        .split(',')
        .map((item) => item.split('='))
    );
    const [rate = '1', unit = 'second'] = String(properties.rate || '1/second').split('/');
    rateLimit.value = {
      enable: Number(properties.enable ?? 1) ? 1 : 0,
      rate: Number(rate) || 1,
      unit: ['second', 'minute', 'hour', 'day'].includes(unit) ? unit : 'second',
      burst: Number(properties.burst) || 5,
    };
  }
}

onMounted(refreshData);
watch([() => baseUrl, () => fwtype], () => {
  void refreshData();
});
watch(
  rows,
  (nextRows) => {
    if (nextRows.length === 0) return;
    const key = active.value.key;
    const current = key ? nextRows.find((row) => row.key === key) : nextRows[0];
    openEdit(current || nextRows[0]);
  },
  { immediate: true }
);
</script>

<template>
  <div class="vm-config-legacy">
    <div class="row items-stretch">
      <div class="col-7 hardware-list-column">
        <div class="u-border q-pa-sm hardware-scroll hardware-list-panel">
          <div
            v-for="row in rows"
            :key="String(row.key)"
            class="cursor-pointer q-px-sm row hardware-list-row"
            :class="{ 'bg-blue-2': active?.key === row.key }"
            @click="openEdit(row)"
          >
            <div class="col-4 text-grey-10 hardware-list-label">
              <q-icon
                :name="optionIcon(String(row.key), row.value)"
                size="16px"
                class="q-mr-xs hardware-list-icon"
              />
              {{ gettext(textValue(row.label)) }}:
            </div>
            <div class="col-8 text-grey-8 hardware-list-value">
              {{ row.display }}
              <span
                v-if="row.isDefault"
                class="text-grey-6"
              >
                ({{ gettext('Default') }})
              </span>
            </div>
          </div>
          <q-inner-loading :showing="loading">
            <q-spinner color="primary" />
          </q-inner-loading>
        </div>
      </div>
      <div class="col-5 hardware-edit-column">
        <div class="u-border hardware-editor">
          <div
            v-if="active"
            class="q-pa-sm hardware-editor__content"
          >
            <div class="row items-center no-wrap editor-titlebar">
              <div class="editor-title text-grey-10">{{ gettext(textValue(active.label)) }}</div>
            </div>
            <div class="u-dense">
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
                options-dense
                :label="gettext('Log level')"
                :options="logLevels"
              />
              <q-select
                v-else-if="activeDefinition?.kind === 'policy'"
                v-model="activeValue"
                options-dense
                :label="gettext(activeDefinition.label)"
                :options="activeDefinition.options || []"
              />
              <q-input
                v-else-if="activeDefinition?.kind === 'integer'"
                v-model.number="activeValue"
                clearable
                type="number"
                :label="gettext(activeDefinition.label)"
                :min="activeDefinition.min"
                :rules="[
                  (value) =>
                    value === '' ||
                    value == null ||
                    (Number.isInteger(Number(value)) &&
                      Number(value) >= Number(activeDefinition?.min)) ||
                    gettext('Value must be at least %s').replace(
                      '%s',
                      String(activeDefinition?.min)
                    ),
                ]"
              />
              <div
                v-else-if="activeDefinition?.kind === 'rate-limit'"
                class="q-gutter-md"
              >
                <q-checkbox
                  v-model="rateLimit.enable"
                  dense
                  right-label
                  color="primary"
                  :true-value="1"
                  :false-value="0"
                  :label="gettext('Enable')"
                />
                <div class="row q-col-gutter-sm">
                  <q-input
                    v-model.number="rateLimit.rate"
                    class="col-5"
                    type="number"
                    :min="1"
                    :max="99"
                    :label="gettext('Log rate limit')"
                  />
                  <q-select
                    v-model="rateLimit.unit"
                    class="col-7"
                    options-dense
                    :label="gettext('Unit')"
                    :options="['second', 'minute', 'hour', 'day']"
                  />
                </div>
                <q-input
                  v-model.number="rateLimit.burst"
                  type="number"
                  :min="1"
                  :max="99"
                  :label="gettext('Log burst limit')"
                />
              </div>
              <q-input
                v-else
                v-model="activeValue"
                :label="gettext('Value')"
              />
            </div>
          </div>
          <div
            v-if="active"
            class="hardware-editor__footer row items-center justify-end"
          >
            <q-btn
              no-caps
              size="12px"
              class="bg-primary text-grey-1 u-button"
              :disable="!activeFormValid"
              :label="gettext('OK')"
              :loading="loading"
              @click="submitForm"
            />
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.vm-config-legacy {
  padding: 8px;
  font-size: 13px;
}
.hardware-scroll {
  flex: 1 1 auto;
  height: 100%;
  font-size: 13px;
  background: #fff;
}
.hardware-list-panel {
  border-right: 0;
}
.hardware-list-row {
  min-height: 30px;
  align-items: center;
  border-bottom: 1px solid #eef0f3;
  transition: background-color 150ms ease-out;
}
.hardware-list-label {
  align-self: flex-start;
  padding-top: 6px;
}
.hardware-list-value {
  min-width: 0;
  padding-top: 6px;
  padding-bottom: 6px;
  line-height: 18px;
  overflow-wrap: anywhere;
  word-break: break-word;
  white-space: normal;
}
.hardware-list-row:last-child {
  border-bottom: 0;
}
.hardware-list-row:hover {
  background: #f4f8fc;
}
.hardware-list-row.bg-blue-2 {
  background: #e6f1fb !important;
}
.hardware-list-row.bg-blue-2 :deep(.text-grey-10),
.hardware-list-row.bg-blue-2 :deep(.text-grey-8) {
  color: #1f4f78 !important;
}
.hardware-list-column {
  display: flex;
  overflow: hidden;
  align-self: stretch;
}
.hardware-edit-column {
  display: flex;
  align-self: stretch;
  background: #fff;
}
.hardware-editor {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  min-height: 100%;
  border-left: 1px solid #d7dce2;
  background: #fff;
}
.hardware-editor__content {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  min-height: 0;
}
.hardware-editor__footer {
  flex: 0 0 auto;
  min-height: 52px;
  margin-top: auto;
  padding: 8px 12px;
  border-top: 1px solid #d7dce2;
  background: #f5f7fa;
}
.editor-titlebar {
  min-height: 38px;
  margin: -4px -4px 10px;
  padding: 4px 8px;
  background: #f5f7fa;
  border-bottom: 1px solid #d7dce2;
}
.editor-title {
  font-weight: 600;
  color: #334155;
}
.hardware-editor :deep(.q-field) {
  margin-bottom: 4px;
}
.hardware-editor :deep(.q-checkbox) {
  min-height: 30px;
}
@media (prefers-reduced-motion: reduce) {
  .hardware-list-row {
    transition: none;
  }
}
</style>
