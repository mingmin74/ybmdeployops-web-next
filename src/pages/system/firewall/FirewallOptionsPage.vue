<script setup lang="ts">
import type { QTableColumn } from 'quasar';
import { onMounted, ref, shallowRef } from 'vue';
import UWindow from '@/components/UWindow.vue';
import type { PveRecord } from '@/api/resources';
import { getFirewallOptions, updateFirewallOptions } from '@/api/firewall';
import { gettext } from '@/locale';
import { textValue } from '@/utils/pveFormat';

const loading = ref(false);
const dialog = ref(false);
const active = ref<Record<string, string | number | null | undefined>>({});
const rows = shallowRef<PveRecord[]>([]);

const labels: Record<string, string> = {
  enable: 'Firewall',
  ebtables: 'ebtables',
  log_ratelimit: 'Log rate limit',
  policy_in: 'Input Policy',
  policy_out: 'Output Policy',
};

const columns: QTableColumn<PveRecord>[] = [
  {
    name: 'key',
    label: gettext('Option'),
    align: 'left',
    field: (row) => gettext(String(row.label || row.key)),
    sortable: true,
  },
  {
    name: 'value',
    label: gettext('Value'),
    align: 'left',
    field: (row) => row.value ?? '-',
    sortable: true,
  },
];

async function refreshData() {
  loading.value = true;
  try {
    const response = await getFirewallOptions();
    const data = response.data || {};
    rows.value = Object.keys(labels).map((key) => ({ key, label: labels[key], value: data[key] }));
  } finally {
    loading.value = false;
  }
}

function openEdit(row: PveRecord) {
  active.value = Object.fromEntries(
    Object.entries(row).map(([key, value]) => [key, value == null ? undefined : textValue(value)]),
  );
  dialog.value = true;
}

async function submitForm() {
  loading.value = true;
  try {
    await updateFirewallOptions({ [String(active.value.key)]: active.value.value });
    dialog.value = false;
    await refreshData();
  } finally {
    loading.value = false;
  }
}

onMounted(refreshData);
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
      <template #top>
        <q-btn
          no-caps
          outline
          size="12px"
          color="primary"
          class="u-button"
          :label="gettext('Refresh')"
          @click="refreshData"
        />
      </template>
      <template #body-cell-value="scope">
        <q-td :props="scope" class="cursor-pointer" @click="openEdit(scope.row)">{{
          scope.row.value ?? '-'
        }}</q-td>
      </template>
    </q-table>
    <q-dialog v-model="dialog" persistent>
      <UWindow
        :title="`${gettext('Edit')}: ${gettext(String(active.label || active.key))}`"
        width="420px"
        :loading="loading"
      >
        <div class="q-pa-md">
          <q-input v-model="active.value" square outlined dense :label="gettext('Value')" />
        </div>
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
            @click="submitForm"
          />
        </template>
      </UWindow>
    </q-dialog>
  </div>
</template>
