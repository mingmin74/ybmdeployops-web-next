<script setup lang="ts">
import type { QTableColumn } from 'quasar';
import { Dialog } from 'quasar';
import { onMounted, ref, shallowRef } from 'vue';
import type { PveRecord } from '@/api/resources';
import { deleteSdnZone, getSdnZones } from '@/api/sdn';
import { gettext } from '@/locale';
import { textValue } from '@/utils/pveFormat';

const loading = ref(false);
const filter = ref('');
const selected = ref<PveRecord[]>([]);
const rows = shallowRef<PveRecord[]>([]);

const columns: QTableColumn<PveRecord>[] = [
  {
    name: 'zone',
    required: true,
    label: gettext('Zone'),
    align: 'left',
    field: (row) => row.zone || '-',
    sortable: true,
  },
  {
    name: 'type',
    label: gettext('Type'),
    align: 'left',
    field: (row) => row.type || '-',
    sortable: true,
  },
  {
    name: 'mtu',
    label: gettext('MTU'),
    align: 'left',
    field: (row) => row.mtu || '-',
    sortable: true,
  },
  { name: 'ipam', label: 'IPAM', align: 'left', field: (row) => row.ipam || '-', sortable: true },
  { name: 'dns', label: 'DNS', align: 'left', field: (row) => row.dns || '-', sortable: true },
  {
    name: 'nodes',
    label: gettext('Nodes'),
    align: 'left',
    field: (row) => row.nodes || '-',
    sortable: true,
  },
  {
    name: 'state',
    label: gettext('Status'),
    align: 'left',
    field: (row) => row.state || '-',
    sortable: true,
  },
];

async function refreshData() {
  loading.value = true;
  try {
    const response = await getSdnZones();
    rows.value = response.data || [];
    selected.value = [];
  } finally {
    loading.value = false;
  }
}

function removeSelected() {
  const zone = textValue(selected.value[0]?.zone);
  if (!zone) return;
  Dialog.create({
    title: gettext('Confirm'),
    message: gettext('Are you sure to delete [%s]?').replace('%s', zone),
    cancel: true,
    persistent: true,
  }).onOk(() => {
    loading.value = true;
    void deleteSdnZone(zone)
      .then(refreshData)
      .finally(() => {
        loading.value = false;
      });
  });
}

onMounted(refreshData);
</script>

<template>
  <div class="q-ma-md bg-white">
    <q-table
      flat
      row-key="zone"
      table-header-class="u-table-header"
      selection="single"
      :rows="rows"
      :columns="columns"
      :selected="selected"
      :filter="filter"
      :loading="loading"
      :pagination="{ page: 1, rowsPerPage: 10 }"
      :rows-per-page-options="[10]"
      :no-data-label="gettext('no record can be found')"
      @update:selected="selected = [...$event]"
    >
      <template #top
        ><div class="row q-gutter-sm">
          <q-btn
            no-caps
            outline
            size="12px"
            color="primary"
            class="u-button"
            :label="gettext('Refresh')"
            @click="refreshData"
          /><q-btn
            no-caps
            outline
            size="12px"
            :color="selected.length !== 1 ? 'grey' : 'red'"
            class="u-button"
            :disable="selected.length !== 1"
            :label="gettext('Remove')"
            @click="removeSelected"
          />
        </div>
        <q-space /><q-input
          v-model="filter"
          borderless
          dense
          debounce="300"
          :placeholder="gettext('Search')"
          ><template #append><q-icon name="search" /></template></q-input
      ></template>
    </q-table>
  </div>
</template>
