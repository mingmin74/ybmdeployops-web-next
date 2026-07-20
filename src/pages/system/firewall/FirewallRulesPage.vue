<script setup lang="ts">
import type { QTableColumn } from 'quasar';
import { Dialog } from 'quasar';
import { onMounted, ref, shallowRef } from 'vue';
import UWindow from '@/components/UWindow.vue';
import type { PveRecord } from '@/api/resources';
import { createFirewallRule, deleteFirewallRule, getFirewallRules, updateFirewallRule } from '@/api/firewall';
import { gettext } from '@/locale';
import { textValue } from '@/utils/pveFormat';

const loading = ref(false);
const dialog = ref(false);
const editing = ref(false);
const filter = ref('');
const selected = ref<PveRecord[]>([]);
const rows = shallowRef<PveRecord[]>([]);
const form = ref<Record<string, string | number | null | undefined>>({});

const columns: QTableColumn<PveRecord>[] = [
  { name: 'enable', label: gettext('Enable'), align: 'left', field: (row) => (row.enable ? gettext('Yes') : gettext('No')), sortable: true },
  { name: 'type', label: gettext('Type'), align: 'left', field: (row) => row.type || '-', sortable: true },
  { name: 'action', label: gettext('Action'), align: 'left', field: (row) => row.action || '-', sortable: true },
  { name: 'macro', label: gettext('Macro'), align: 'left', field: (row) => row.macro || '-', sortable: true },
  { name: 'iface', label: gettext('Interface'), align: 'left', field: (row) => row.iface || '-', sortable: true },
  { name: 'source', label: gettext('Source'), align: 'left', field: (row) => row.source || '-', sortable: true },
  { name: 'dest', label: gettext('Destination'), align: 'left', field: (row) => row.dest || '-', sortable: true },
  { name: 'proto', label: gettext('Protocol'), align: 'left', field: (row) => row.proto || '-', sortable: true },
  { name: 'dport', label: gettext('Dest. port'), align: 'left', field: (row) => row.dport || '-', sortable: true },
  { name: 'sport', label: gettext('Source port'), align: 'left', field: (row) => row.sport || '-', sortable: true },
  { name: 'log', label: gettext('Log level'), align: 'left', field: (row) => row.log || '-', sortable: true },
  { name: 'comment', label: gettext('Comment'), align: 'left', field: (row) => row.comment || '-', sortable: true },
];

async function refreshData() {
  loading.value = true;
  try {
    const response = await getFirewallRules();
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
    ? Object.fromEntries(Object.entries(selected.value[0] || {}).map(([key, value]) => [key, value == null ? undefined : textValue(value)]))
    : { enable: 1, type: 'in', action: 'ACCEPT' };
  dialog.value = true;
}

async function submitForm() {
  loading.value = true;
  try {
    if (editing.value) {
      await updateFirewallRule(textValue(form.value.pos), form.value);
    } else {
      await createFirewallRule(form.value);
    }
    dialog.value = false;
    await refreshData();
  } finally {
    loading.value = false;
  }
}

function removeSelected() {
  const row = selected.value[0];
  if (!row) return;
  Dialog.create({
    title: gettext('Confirm'),
    message: gettext('Are you sure to delete [%s]?').replace('%s', textValue(row.pos)),
    cancel: true,
    persistent: true,
  }).onOk(() => {
    loading.value = true;
    void deleteFirewallRule(textValue(row.pos))
      .then(() => refreshData())
      .finally(() => {
        loading.value = false;
      });
  });
}

onMounted(refreshData);
</script>

<template>
  <div>
    <q-table flat row-key="pos" table-header-class="u-table-header" selection="single" :rows="rows" :columns="columns" :selected="selected" :filter="filter" :pagination="{ page: 1, rowsPerPage: 10 }" :rows-per-page-options="[10]" :loading="loading" :no-data-label="gettext('no record can be found')" @row-click="rowClick" @update:selected="selected = [...$event]">
      <template #top>
        <div class="row q-gutter-sm">
          <q-btn no-caps outline size="12px" color="primary" class="u-button" :label="gettext('Add')" @click="openDialog('add')" />
          <q-btn no-caps outline size="12px" color="primary" class="u-button" :disable="selected.length !== 1" :label="gettext('Edit')" @click="openDialog('edit')" />
          <q-btn no-caps outline size="12px" :color="selected.length !== 1 ? 'grey' : 'red'" class="u-button" :disable="selected.length !== 1" :label="gettext('Remove')" @click="removeSelected" />
          <q-btn no-caps outline size="12px" color="primary" class="u-button" :label="gettext('Refresh')" @click="refreshData" />
        </div>
        <q-space />
        <q-input v-model="filter" borderless dense debounce="300" :placeholder="gettext('Search')"><template #append><q-icon name="search" /></template></q-input>
      </template>
    </q-table>
    <q-dialog v-model="dialog" persistent>
      <UWindow :title="gettext(editing ? 'Edit' : 'Add')" width="620px" :loading="loading">
        <div class="q-pa-md row q-col-gutter-sm">
          <q-select v-model="form.type" class="col-6" square outlined dense :label="gettext('Type')" :options="['in', 'out', 'group']" />
          <q-select v-model="form.action" class="col-6" square outlined dense :label="gettext('Action')" :options="['ACCEPT', 'DROP', 'REJECT']" />
          <q-input v-model="form.macro" class="col-6" square outlined dense :label="gettext('Macro')" />
          <q-input v-model="form.iface" class="col-6" square outlined dense :label="gettext('Interface')" />
          <q-input v-model="form.source" class="col-6" square outlined dense :label="gettext('Source')" />
          <q-input v-model="form.dest" class="col-6" square outlined dense :label="gettext('Destination')" />
          <q-input v-model="form.proto" class="col-4" square outlined dense :label="gettext('Protocol')" />
          <q-input v-model="form.dport" class="col-4" square outlined dense :label="gettext('Dest. port')" />
          <q-input v-model="form.sport" class="col-4" square outlined dense :label="gettext('Source port')" />
          <q-input v-model="form.comment" class="col-12" square outlined dense :label="gettext('Comment')" />
          <q-checkbox v-model="form.enable" class="col-12" :true-value="1" :false-value="0" :label="gettext('Enable')" />
        </div>
        <template #foot>
          <q-btn v-close-popup no-caps flat size="12px" class="u-button" :label="gettext('Cancel')" />
          <q-btn no-caps flat size="12px" class="bg-primary text-grey-1 u-button" :label="gettext('OK')" @click="submitForm" />
        </template>
      </UWindow>
    </q-dialog>
  </div>
</template>
