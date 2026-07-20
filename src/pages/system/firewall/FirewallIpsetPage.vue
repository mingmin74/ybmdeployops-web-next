<script setup lang="ts">
import type { QTableColumn } from 'quasar';
import { Dialog } from 'quasar';
import { onMounted, ref, shallowRef, watch } from 'vue';
import UWindow from '@/components/UWindow.vue';
import type { PveRecord } from '@/api/resources';
import {
  createFirewallIpset,
  createFirewallIpsetEntry,
  deleteFirewallIpset,
  deleteFirewallIpsetEntry,
  getFirewallIpsetEntries,
  getFirewallIpsets,
} from '@/api/firewall';
import { gettext } from '@/locale';
import { textValue } from '@/utils/pveFormat';

const loading = ref(false);
const entryLoading = ref(false);
const selectedIpset = ref<PveRecord[]>([]);
const selectedEntry = ref<PveRecord[]>([]);
const ipsets = shallowRef<PveRecord[]>([]);
const entries = shallowRef<PveRecord[]>([]);
const ipsetDialog = ref(false);
const entryDialog = ref(false);
const ipsetForm = ref<Record<string, string | number | null | undefined>>({});
const entryForm = ref<Record<string, string | number | null | undefined>>({});

const ipsetColumns: QTableColumn<PveRecord>[] = [
  { name: 'name', required: true, label: gettext('Name'), align: 'left', field: (row) => row.name || '-', sortable: true },
  { name: 'comment', label: gettext('Comment'), align: 'left', field: (row) => row.comment || '-', sortable: true },
];

const entryColumns: QTableColumn<PveRecord>[] = [
  { name: 'cidr', required: true, label: 'CIDR', align: 'left', field: (row) => row.cidr || row.name || '-', sortable: true },
  { name: 'nomatch', label: gettext('Match'), align: 'left', field: (row) => (row.nomatch ? gettext('No') : gettext('Yes')), sortable: true },
  { name: 'comment', label: gettext('Comment'), align: 'left', field: (row) => row.comment || '-', sortable: true },
];

async function refreshIpsets() {
  loading.value = true;
  try {
    const response = await getFirewallIpsets();
    ipsets.value = response.data || [];
    selectedIpset.value = ipsets.value[0] ? [ipsets.value[0]] : [];
  } finally {
    loading.value = false;
  }
}

async function refreshEntries() {
  const name = textValue(selectedIpset.value[0]?.name);
  if (!name) {
    entries.value = [];
    return;
  }
  entryLoading.value = true;
  try {
    const response = await getFirewallIpsetEntries(name);
    entries.value = response.data || [];
    selectedEntry.value = [];
  } finally {
    entryLoading.value = false;
  }
}

function removeIpset() {
  const name = textValue(selectedIpset.value[0]?.name);
  if (!name) return;
  Dialog.create({ title: gettext('Confirm'), message: gettext('Are you sure to delete [%s]?').replace('%s', name), cancel: true, persistent: true }).onOk(() => {
    loading.value = true;
    void deleteFirewallIpset(name).then(refreshIpsets).finally(() => {
      loading.value = false;
    });
  });
}

function removeEntry() {
  const name = textValue(selectedIpset.value[0]?.name);
  const cidr = textValue(selectedEntry.value[0]?.cidr || selectedEntry.value[0]?.name);
  if (!name || !cidr) return;
  Dialog.create({ title: gettext('Confirm'), message: gettext('Are you sure to delete [%s]?').replace('%s', cidr), cancel: true, persistent: true }).onOk(() => {
    entryLoading.value = true;
    void deleteFirewallIpsetEntry(name, cidr).then(refreshEntries).finally(() => {
      entryLoading.value = false;
    });
  });
}

async function submitIpset() {
  loading.value = true;
  try {
    await createFirewallIpset(ipsetForm.value);
    ipsetDialog.value = false;
    await refreshIpsets();
  } finally {
    loading.value = false;
  }
}

async function submitEntry() {
  const name = textValue(selectedIpset.value[0]?.name);
  if (!name) return;
  entryLoading.value = true;
  try {
    await createFirewallIpsetEntry(name, entryForm.value);
    entryDialog.value = false;
    await refreshEntries();
  } finally {
    entryLoading.value = false;
  }
}

watch(selectedIpset, refreshEntries);
onMounted(refreshIpsets);
</script>

<template>
  <div class="row q-col-gutter-md">
    <div class="col-4">
      <q-table flat row-key="name" table-header-class="u-table-header" selection="single" :rows="ipsets" :columns="ipsetColumns" :selected="selectedIpset" :loading="loading" :pagination="{ page: 1, rowsPerPage: 10 }" :rows-per-page-options="[10]" @update:selected="selectedIpset = [...$event]">
        <template #top>
          <div class="row q-gutter-sm">
            <q-btn no-caps outline size="12px" color="primary" class="u-button" :label="gettext('Add')" @click="ipsetForm = {}; ipsetDialog = true" />
            <q-btn no-caps outline size="12px" :color="selectedIpset.length !== 1 ? 'grey' : 'red'" class="u-button" :disable="selectedIpset.length !== 1" :label="gettext('Remove')" @click="removeIpset" />
            <q-btn no-caps outline size="12px" color="primary" class="u-button" :label="gettext('Refresh')" @click="refreshIpsets" />
          </div>
        </template>
      </q-table>
    </div>
    <div class="col-8">
      <q-table flat row-key="cidr" table-header-class="u-table-header" selection="single" :rows="entries" :columns="entryColumns" :selected="selectedEntry" :loading="entryLoading" :pagination="{ page: 1, rowsPerPage: 10 }" :rows-per-page-options="[10]" @update:selected="selectedEntry = [...$event]">
        <template #top>
          <div class="row q-gutter-sm">
            <q-btn no-caps outline size="12px" color="primary" class="u-button" :disable="selectedIpset.length !== 1" :label="gettext('Add')" @click="entryForm = {}; entryDialog = true" />
            <q-btn no-caps outline size="12px" :color="selectedEntry.length !== 1 ? 'grey' : 'red'" class="u-button" :disable="selectedEntry.length !== 1" :label="gettext('Remove')" @click="removeEntry" />
          </div>
        </template>
      </q-table>
    </div>
    <q-dialog v-model="ipsetDialog" persistent>
      <UWindow :title="gettext('Add')" width="420px" :loading="loading">
        <div class="q-pa-md q-gutter-sm"><q-input v-model="ipsetForm.name" square outlined dense :label="gettext('Name')" /><q-input v-model="ipsetForm.comment" square outlined dense :label="gettext('Comment')" /></div>
        <template #foot><q-btn v-close-popup no-caps flat size="12px" class="u-button" :label="gettext('Cancel')" /><q-btn no-caps flat size="12px" class="bg-primary text-grey-1 u-button" :label="gettext('OK')" @click="submitIpset" /></template>
      </UWindow>
    </q-dialog>
    <q-dialog v-model="entryDialog" persistent>
      <UWindow :title="gettext('Add')" width="420px" :loading="entryLoading">
        <div class="q-pa-md q-gutter-sm"><q-input v-model="entryForm.cidr" square outlined dense label="CIDR" /><q-checkbox v-model="entryForm.nomatch" :true-value="1" :false-value="0" :label="gettext('No Match')" /><q-input v-model="entryForm.comment" square outlined dense :label="gettext('Comment')" /></div>
        <template #foot><q-btn v-close-popup no-caps flat size="12px" class="u-button" :label="gettext('Cancel')" /><q-btn no-caps flat size="12px" class="bg-primary text-grey-1 u-button" :label="gettext('OK')" @click="submitEntry" /></template>
      </UWindow>
    </q-dialog>
  </div>
</template>
