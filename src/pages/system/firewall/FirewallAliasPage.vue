<script setup lang="ts">
import type { QTableColumn } from 'quasar';
import { Dialog } from 'quasar';
import { onMounted, ref, shallowRef } from 'vue';
import UWindow from '@/components/UWindow.vue';
import type { PveRecord } from '@/api/resources';
import {
  createFirewallAlias,
  deleteFirewallAlias,
  getFirewallAliases,
  updateFirewallAlias,
} from '@/api/firewall';
import { gettext } from '@/locale';
import { textValue } from '@/utils/pveFormat';

const loading = ref(false);
const dialog = ref(false);
const editing = ref(false);
const filter = ref('');
const selected = ref<PveRecord[]>([]);
const rows = shallowRef<PveRecord[]>([]);
const form = ref<Record<string, string | number | null | undefined>>({});
const originalName = ref('');

const columns: QTableColumn<PveRecord>[] = [
  {
    name: 'name',
    required: true,
    label: gettext('Name'),
    align: 'left',
    field: (row) => row.name || '-',
    sortable: true,
  },
  { name: 'cidr', label: 'CIDR', align: 'left', field: (row) => row.cidr || '-', sortable: true },
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
    const response = await getFirewallAliases();
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
        ]),
      )
    : {};
  originalName.value = textValue(form.value.name);
  dialog.value = true;
}

async function submitForm() {
  loading.value = true;
  try {
    if (editing.value) {
      await updateFirewallAlias(originalName.value, form.value);
    } else {
      await createFirewallAlias(form.value);
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
  const name = textValue(row.name);
  Dialog.create({
    title: gettext('Confirm'),
    message: gettext('Are you sure to delete [%s]?').replace('%s', name),
    cancel: true,
    persistent: true,
  }).onOk(() => {
    loading.value = true;
    void deleteFirewallAlias(name)
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
        <q-input v-model="filter" borderless dense debounce="300" :placeholder="gettext('Search')"
          ><template #append><q-icon name="search" /></template
        ></q-input>
      </template>
    </q-table>
    <q-dialog v-model="dialog" persistent>
      <UWindow :title="gettext(editing ? 'Edit' : 'Add')" width="480px" :loading="loading">
        <div class="q-pa-md q-gutter-sm">
          <q-input v-model="form.name" square outlined dense :label="gettext('Name')" />
          <q-input v-model="form.cidr" square outlined dense label="CIDR" />
          <q-input v-model="form.comment" square outlined dense :label="gettext('Comment')" />
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
