<script setup lang="ts">
import type { QTableColumn } from 'quasar';
import { computed, onMounted, ref, shallowRef, watch } from 'vue';
import UWindow from '@/components/UWindow.vue';
import type { PveRecord } from '@/api/resources';
import { getFirewallOptionsByBaseUrl, updateFirewallOptionsByBaseUrl } from '@/api/firewall';
import { gettext } from '@/locale';
import { textValue } from '@/utils/pveFormat';

type FirewallOptionsType = 'dc' | 'vnet';
type OptionDefinition = {
  label: string;
  defaultValue: string | number;
  kind: 'boolean' | 'log' | 'policy' | 'text';
  options?: string[];
};

const { baseUrl = '/cluster/firewall/options', fwtype = 'dc' } = defineProps<{
  baseUrl?: string;
  fwtype?: FirewallOptionsType;
}>();

const definitions: Record<FirewallOptionsType, Record<string, OptionDefinition>> = {
  dc: {
    enable: { label: 'Firewall', defaultValue: 0, kind: 'boolean' },
    ebtables: { label: 'ebtables', defaultValue: 1, kind: 'boolean' },
    log_ratelimit: {
      label: 'Log rate limit',
      defaultValue: 'enable=1,rate1/second,burst=5',
      kind: 'text',
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
  dialog.value = true;
}
async function submitForm() {
  loading.value = true;
  try {
    await updateFirewallOptionsByBaseUrl(baseUrl, {
      [textValue(active.value.key)]: active.value.value,
    });
    dialog.value = false;
    await refreshData();
  } finally {
    loading.value = false;
  }
}

onMounted(refreshData);
watch(
  () => baseUrl,
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
            :label="gettext('OK')"
            @click="submitForm" /></template></UWindow
    ></q-dialog>
  </div>
</template>
