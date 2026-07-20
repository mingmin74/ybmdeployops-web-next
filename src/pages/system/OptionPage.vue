<script setup lang="ts">
import { computed, onMounted, reactive, ref, shallowRef } from 'vue';
import UWindow from '@/components/UWindow.vue';
import { getClusterOptions, getLocalNetworks, updateClusterOptions } from '@/api/clusterOptions';
import type { PveRecord } from '@/api/resources';
import { gettext } from '@/locale';
import { objectToText, textValue } from '@/utils/pveFormat';

type OptionType = 'keyboard' | 'email_from' | 'mac_prefix' | 'migration' | 'ha' | 'bwlimit' | 'max_workers' | 'label';

const loading = ref(false);
const dialogLoading = ref(false);
const dialogVisible = ref(false);
const activeType = ref<OptionType>('keyboard');
const showData = shallowRef<PveRecord>({});
const networks = shallowRef<PveRecord[]>([]);
const form = reactive({
  keyboard: '',
  email_from: '',
  mac_prefix: '',
  migration: '',
  ha: '',
  max_workers: '',
  label: false,
  bwlimit: {
    default: '',
    restore: '',
    migration: '',
    clone: '',
    move: '',
  },
});

const keyboardOptions = [
  { label: gettext('Default'), value: '' },
  { label: 'English (US)', value: 'en-us' },
  { label: 'German', value: 'de' },
  { label: 'French', value: 'fr' },
  { label: 'Japanese', value: 'ja' },
  { label: 'Chinese', value: 'zh' },
];

const haOptions = [
  { label: `${gettext('Default')}(conditional)`, value: '' },
  { label: 'freeze', value: 'freeze' },
  { label: 'failover', value: 'failover' },
  { label: 'migrate', value: 'migrate' },
  { label: 'conditional', value: 'conditional' },
];

const networkOptions = computed(() =>
  networks.value
    .filter((item) => item.cidr)
    .map((item) => ({
      label: `${textValue(item.cidr)}${item.iface ? ` (${textValue(item.iface)})` : ''}`,
      value: textValue(item.cidr),
    })),
);

const rows = computed(() => [
  { label: 'Keyboard Layout', type: 'keyboard', value: keyboardDisplay() },
  { label: 'Email from address', type: 'email_from', value: showData.value.email_from || 'root@$hostname' },
  { label: 'MAC address prefix', type: 'mac_prefix', value: showData.value.mac_prefix || gettext('None') },
  { label: 'Migration Settings', type: 'migration', value: objectToText(showData.value.migration) || gettext('Default') },
  { label: 'HA Settings', type: 'ha', value: objectToText(showData.value.ha) || gettext('Default') },
  { label: 'Bandwidth Limits', type: 'bwlimit', value: formatBwlimit(showData.value.bwlimit) || gettext('None') },
  { label: 'Maximal Workers/bulk-action', type: 'max_workers', value: showData.value.max_workers || '-' },
  { label: `${gettext('VM')}${gettext('Label management')}`, type: 'label', value: showData.value.label ? gettext('Open') : gettext('Close') },
] as { label: string; type: OptionType; value: unknown }[]);

function keyboardDisplay() {
  const keyboard = textValue(showData.value.keyboard);
  const option = keyboardOptions.find((item) => item.value === keyboard);
  return `${option?.label || gettext('Default')}${keyboard ? `(${keyboard})` : ''}`;
}

function formatBwlimit(value: unknown) {
  return textValue(value)
    .split(',')
    .filter(Boolean)
    .map((item) => {
      const [key, raw] = item.split('=');
      const mib = Number(raw) / 1024;
      return `${key}=${Number.isFinite(mib) ? mib.toFixed(2) : raw}Mib/s`;
    })
    .join(',');
}

async function loadOptions() {
  loading.value = true;
  try {
    const response = await getClusterOptions();
    showData.value = { ...(response.data || {}), label: Boolean(Number(response.data?.label || 0)) };
  } finally {
    loading.value = false;
  }
}

async function openEdit(type: OptionType) {
  activeType.value = type;
  const data = showData.value;
  form.keyboard = textValue(data.keyboard);
  form.email_from = textValue(data.email_from);
  form.mac_prefix = textValue(data.mac_prefix);
  form.migration = textValue((data.migration as PveRecord | undefined)?.network);
  form.ha = textValue((data.ha as PveRecord | undefined)?.shutdown_policy);
  form.max_workers = textValue(data.max_workers);
  form.label = Boolean(data.label);
  Object.keys(form.bwlimit).forEach((key) => {
    form.bwlimit[key as keyof typeof form.bwlimit] = '';
  });
  textValue(data.bwlimit)
    .split(',')
    .filter(Boolean)
    .forEach((item) => {
      const [key, raw] = item.split('=');
      if (key && key in form.bwlimit) form.bwlimit[key as keyof typeof form.bwlimit] = String(Number(raw) / 1024 || '');
    });
  dialogVisible.value = true;
  if (type === 'migration') {
    dialogLoading.value = true;
    try {
      const response = await getLocalNetworks();
      networks.value = response.data || [];
    } finally {
      dialogLoading.value = false;
    }
  }
}

function buildSubmitData() {
  const data: Record<string, unknown> = {};
  const type = activeType.value;
  if (type === 'ha') {
    data[form.ha ? 'ha' : 'delete'] = form.ha ? `shutdown_policy=${form.ha}` : 'ha';
  } else if (type === 'migration') {
    data[form.migration ? 'migration' : 'delete'] = form.migration ? `network=${form.migration},type=secure` : 'migration';
  } else if (type === 'bwlimit') {
    const values = Object.entries(form.bwlimit)
      .filter(([, value]) => Number(value) > 0)
      .map(([key, value]) => `${key}=${Number(value) * 1024}`);
    data[values.length ? 'bwlimit' : 'delete'] = values.length ? values.join(',') : 'bwlimit';
  } else if (type === 'label') {
    data.label = form.label ? 1 : 0;
  } else {
    const value = form[type];
    data[value ? type : 'delete'] = value || type;
  }
  return data;
}

async function saveOption() {
  dialogLoading.value = true;
  try {
    await updateClusterOptions(buildSubmitData());
    dialogVisible.value = false;
    await loadOptions();
  } finally {
    dialogLoading.value = false;
  }
}

onMounted(() => {
  void loadOptions();
});
</script>

<template>
  <div class="q-ma-md">
    <q-card class="no-border no-border-radius no-shadow">
      <q-card-section>
        <div class="q-gutter-md">
          <div v-for="row in rows" :key="row.type" class="row">
            <div class="col-4 text-grey-10">{{ gettext(row.label) }}:</div>
            <div class="col-auto text-blue-8 cursor-pointer" @click="openEdit(row.type)">
              {{ row.value }}
            </div>
          </div>
        </div>
      </q-card-section>
    </q-card>
    <q-inner-loading :showing="loading" />

    <q-dialog v-model="dialogVisible" persistent transition-show="scale" transition-hide="scale">
      <UWindow :title="`${gettext('Edit')}: ${gettext(activeType)}`" width="420px" :loading="dialogLoading">
        <div class="q-pa-md">
          <q-select
            v-if="activeType === 'keyboard'"
            v-model="form.keyboard"
            dense
            emit-value
            map-options
            options-dense
            :options="keyboardOptions"
            :label="gettext('Keyboard Layout')"
          />
          <q-input v-else-if="activeType === 'email_from'" v-model="form.email_from" dense :label="gettext('Email from address')" />
          <q-input v-else-if="activeType === 'mac_prefix'" v-model="form.mac_prefix" dense :label="gettext('MAC address prefix')" />
          <q-select
            v-else-if="activeType === 'migration'"
            v-model="form.migration"
            dense
            emit-value
            map-options
            options-dense
            clearable
            :options="networkOptions"
            :label="gettext('Network')"
          />
          <q-select
            v-else-if="activeType === 'ha'"
            v-model="form.ha"
            dense
            emit-value
            map-options
            options-dense
            :options="haOptions"
            :label="gettext('Shutdown Policy')"
          />
          <div v-else-if="activeType === 'bwlimit'" class="column q-gutter-sm">
            <q-input v-for="(_, key) in form.bwlimit" :key="key" v-model="form.bwlimit[key]" dense type="number" suffix="Mib/s" :label="gettext(String(key))" />
          </div>
          <div v-else-if="activeType === 'label'" class="text-center">
            {{ gettext('Close') }}
            <q-toggle v-model="form.label" color="primary" :label="gettext('Open')" />
          </div>
          <q-input v-else v-model="form.max_workers" dense type="number" min="1" :label="gettext('Maximal Workers/bulk-action')" />
        </div>
        <template #foot>
          <q-btn no-caps flat size="12px" class="bg-primary text-grey-1 u-button" :label="gettext('OK')" @click="saveOption" />
        </template>
      </UWindow>
    </q-dialog>
  </div>
</template>
