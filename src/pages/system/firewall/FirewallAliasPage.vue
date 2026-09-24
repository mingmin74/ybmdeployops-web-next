<script setup lang="ts">
import type { QTableColumn } from 'quasar';
import { Dialog } from 'quasar';
import { onMounted, reactive, ref, shallowRef } from 'vue';
import UWindow from '@/components/UWindow.vue';
import type { PveRecord } from '@/api/resources';
import {
  createFirewallAliasByBaseUrl,
  deleteFirewallAliasByBaseUrl,
  getFirewallAliasesByBaseUrl,
  updateFirewallAliasByBaseUrl,
} from '@/api/firewall';
import { gettext } from '@/locale';
import { textValue } from '@/utils/pveFormat';

const { baseUrl = '/cluster/firewall/aliases' } = defineProps<{ baseUrl?: string }>();

const loading = ref(false);
const dialog = ref(false);
const editing = ref(false);
const filter = ref('');
const selected = ref<PveRecord[]>([]);
const rows = shallowRef<PveRecord[]>([]);
const form = ref<Record<string, string | number | null | undefined>>({});
const originalName = ref('');
const formErrors = reactive({
  name: '',
  cidr: '',
});

const columns: QTableColumn<PveRecord>[] = [
  {
    name: 'name',
    required: true,
    label: gettext('Name'),
    align: 'left',
    field: (row) => row.name || '-',
    sortable: true,
  },
  {
    name: 'cidr',
    label: gettext('IP/CIDR'),
    align: 'left',
    field: (row) => row.cidr || '-',
    sortable: true,
  },
  {
    name: 'ipversion',
    label: gettext('IP Version'),
    align: 'left',
    field: (row) => row.ipversion || '-',
    sortable: true,
  },
  {
    name: 'comment',
    label: gettext('Comment'),
    align: 'left',
    field: (row) => row.comment || '-',
    sortable: true,
  },
];

async function refreshData() {
  loading.value = true;
  try {
    const response = await getFirewallAliasesByBaseUrl(baseUrl);
    rows.value = response.data || [];
    selected.value = [];
  } finally {
    loading.value = false;
  }
}

function rowClick(_: Event, row: PveRecord) {
  selected.value = selected.value[0] === row ? [] : [row];
}

function openDialog(mode: 'add' | 'edit') {
  editing.value = mode === 'edit';
  form.value = editing.value
    ? Object.fromEntries(
        Object.entries(selected.value[0] || {}).map(([key, value]) => [
          key,
          value == null ? undefined : textValue(value),
        ])
      )
    : {};
  originalName.value = textValue(form.value.name);
  Object.assign(formErrors, { name: '', cidr: '' });
  dialog.value = true;
}

async function submitForm() {
  loading.value = true;
  try {
    if (editing.value) {
      const { name, ...values } = form.value;
      await updateFirewallAliasByBaseUrl(baseUrl, originalName.value, {
        ...values,
        rename: textValue(name),
      });
    } else {
      await createFirewallAliasByBaseUrl(baseUrl, form.value);
    }
    dialog.value = false;
    await refreshData();
  } finally {
    loading.value = false;
  }
}

function isValidIpv4(address: string) {
  const segments = address.split('.');
  return (
    segments.length === 4 &&
    segments.every((segment) => /^\d+$/.test(segment) && Number(segment) >= 0 && Number(segment) <= 255)
  );
}

function isValidIpv6(address: string) {
  if (address.includes(':::') || address.indexOf('::') !== address.lastIndexOf('::')) return false;

  const hasCompression = address.includes('::');
  const segments = address.split(':');
  let groups = 0;

  for (let index = 0; index < segments.length; index += 1) {
    const segment = segments[index];
    if (!segment) continue;
    if (segment.includes('.')) {
      if (index !== segments.length - 1 || !isValidIpv4(segment)) return false;
      groups += 2;
      continue;
    }
    if (!/^[0-9a-fA-F]{1,4}$/.test(segment)) return false;
    groups += 1;
  }

  return hasCompression ? groups < 8 : groups === 8;
}

function isValidIpOrCidr(value: string) {
  const [address, prefix, ...rest] = value.split('/');
  if (!address || rest.length) return false;

  const isIpv4 = isValidIpv4(address);
  const isIp = isIpv4 || isValidIpv6(address);
  if (!isIp) return false;
  if (prefix === undefined) return true;
  if (!/^\d+$/.test(prefix)) return false;

  const prefixLength = Number(prefix);
  return prefixLength >= 0 && prefixLength <= (isIpv4 ? 32 : 128);
}

async function validateAndSubmit() {
  const name = textValue(form.value.name).trim();
  const cidr = textValue(form.value.cidr).trim();
  form.value.name = name;
  form.value.cidr = cidr;
  Object.assign(formErrors, {
    name: name ? '' : gettext('This field is required'),
    cidr: !cidr
      ? gettext('This field is required')
      : isValidIpOrCidr(cidr)
      ? ''
      : gettext('IP 地址或 CIDR 网络格式不正确'),
  });
  if (formErrors.name || formErrors.cidr) return;
  await submitForm();
}

function removeSelected() {
  const row = selected.value[0];
  if (!row) return;
  const name = textValue(row.name);
  Dialog.create({
    title: gettext('Confirm'),
    message: gettext('Are you sure to delete [%s]?').replace('%s', name),
    cancel: true,
    persistent: true,
  }).onOk(() => {
    loading.value = true;
    void deleteFirewallAliasByBaseUrl(baseUrl, name, row.digest)
      .then(refreshData)
      .finally(() => {
        loading.value = false;
      });
  });
}

onMounted(refreshData);
</script>

<template>
  <div>
    <q-table
      flat
      row-key="name"
      table-header-class="u-table-header"
      selection="single"
      :rows="rows"
      :columns="columns"
      :selected="selected"
      :filter="filter"
      :pagination="{ page: 1, rowsPerPage: 10 }"
      :rows-per-page-options="[10]"
      :loading="loading"
      :no-data-label="gettext('no record can be found')"
      @row-click="rowClick"
      @update:selected="selected = [...$event]"
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
            @click="openDialog('add')"
          />
          <q-btn
            no-caps
            outline
            size="12px"
            color="primary"
            class="u-button"
            :disable="selected.length !== 1"
            :label="gettext('Edit')"
            @click="openDialog('edit')"
          />
          <q-btn
            no-caps
            outline
            size="12px"
            :color="selected.length !== 1 ? 'grey' : 'red'"
            class="u-button"
            :disable="selected.length !== 1"
            :label="gettext('Remove')"
            @click="removeSelected"
          />
          <q-btn
            no-caps
            outline
            size="12px"
            color="primary"
            class="u-button"
            :label="gettext('Refresh')"
            @click="refreshData"
          />
        </div>
        <q-space />
        <q-input
          v-model="filter"
          borderless
          dense
          debounce="300"
          :placeholder="gettext('Search')"
        >
          <template #append><q-icon name="search" /></template>
        </q-input>
      </template>
    </q-table>
    <q-dialog
      v-model="dialog"
      persistent
      transition-show="scale"
      transition-hide="scale"
    >
      <UWindow
        :title="gettext(editing ? 'Edit' : 'Add')"
        width="480px"
        :loading="loading"
      >
        <q-form
          class="u-border q-ma-sm q-pa-md u-dense"
          @submit.prevent="validateAndSubmit"
        >
          <q-input
            v-model="form.name"
            dense
            class="q-field--with-bottom"
            :label="`${gettext('Name')} *`"
            :error="Boolean(formErrors.name)"
            :error-message="formErrors.name"
            @update:model-value="formErrors.name = ''"
          />
          <q-input
            v-model="form.cidr"
            dense
            class="q-field--with-bottom"
            :label="`${gettext('IP/CIDR')} *`"
            :error="Boolean(formErrors.cidr)"
            :error-message="formErrors.cidr"
            @update:model-value="formErrors.cidr = ''"
          />
          <q-input
            v-model="form.comment"
            dense
            class="q-field--with-bottom"
            :label="gettext('Comment')"
          />
        </q-form>
        <template #foot>
          <q-btn
            v-close-popup
            no-caps
            flat
            size="12px"
            class="u-button"
            :label="gettext('Cancel')"
          />
          <q-btn
            no-caps
            flat
            size="12px"
            class="bg-primary text-grey-1 u-button"
            :label="gettext('OK')"
            @click="validateAndSubmit"
          />
        </template>
      </UWindow>
    </q-dialog>
  </div>
</template>
