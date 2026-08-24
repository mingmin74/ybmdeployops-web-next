<script setup lang="ts">
import type { QTableColumn } from 'quasar';
import { computed, shallowRef, watch } from 'vue';
import { getSdnZoneBridges } from '@/api/sdn';
import type { PveRecord } from '@/api/resources';
import { gettext } from '@/locale';
import { textValue } from '@/utils/pveFormat';

const props = defineProps<{ node: string; zone: string }>();
const loading = shallowRef(false);
const rows = shallowRef<PveRecord[]>([]);
const selected = shallowRef<PveRecord[]>([]);
let requestId = 0;

const bridgeColumns: QTableColumn<PveRecord>[] = [
  { name: 'name', label: gettext('Bridge'), field: 'name', align: 'left', sortable: true },
  {
    name: 'vlan_filtering',
    label: gettext('VLAN-aware'),
    field: (row) => (Number(row.vlan_filtering) === 1 ? gettext('Yes') : gettext('No')),
    align: 'left',
    sortable: true,
  },
];
const portColumns: QTableColumn<PveRecord>[] = [
  { name: 'name', label: gettext('Name'), field: 'name', align: 'left', sortable: true },
  { name: 'vmid', label: gettext('VMID'), field: 'vmid', align: 'left', sortable: true },
  {
    name: 'index',
    label: gettext('Guest Network Device'),
    field: 'index',
    align: 'left',
    sortable: true,
  },
  {
    name: 'primary_vlan',
    label: gettext('Primary VLAN'),
    field: 'primary_vlan',
    align: 'left',
    sortable: true,
  },
  { name: 'vlans', label: gettext('VLANs'), field: 'vlans', align: 'left', sortable: true },
];
const ports = computed(() => {
  const value = selected.value[0]?.ports;
  return Array.isArray(value)
    ? [...(value as PveRecord[])].sort((left, right) =>
        `${textValue(left.vmid)}-${textValue(left.index)}`.localeCompare(
          `${textValue(right.vmid)}-${textValue(right.index)}`
        )
      )
    : [];
});

async function load() {
  if (!props.node || !props.zone) {
    rows.value = [];
    selected.value = [];
    return;
  }
  const currentRequest = ++requestId;
  loading.value = true;
  try {
    const response = await getSdnZoneBridges(props.node, props.zone);
    if (currentRequest !== requestId) return;
    rows.value = [...(response.data || [])].sort((left, right) =>
      textValue(left.name).localeCompare(textValue(right.name))
    );
    selected.value = [];
  } finally {
    if (currentRequest === requestId) loading.value = false;
  }
}

watch(
  () => [props.node, props.zone],
  () => void load(),
  { immediate: true }
);
</script>

<template>
  <div class="row q-col-gutter-md">
    <div class="col-6">
      <q-table
        v-model:selected="selected"
        flat
        row-key="name"
        selection="single"
        table-header-class="u-table-header"
        :rows="rows"
        :columns="bridgeColumns"
        :loading="loading"
        :rows-per-page-options="[0]"
        hide-pagination
        :no-data-label="gettext('no record can be found')"
      >
        <template #top>
          <div class="text-subtitle2">{{ gettext('Bridges') }}</div>
          <q-space />
          <q-btn
            no-caps
            outline
            size="12px"
            color="primary"
            class="u-button"
            :label="gettext('Refresh')"
            @click="load"
          />
        </template>
      </q-table>
    </div>
    <div class="col-6">
      <q-table
        flat
        row-key="index"
        table-header-class="u-table-header"
        :rows="ports"
        :columns="portColumns"
        :rows-per-page-options="[0]"
        hide-pagination
        :no-data-label="gettext('no record can be found')"
      >
        <template #top>
          <div class="text-subtitle2">{{ gettext('Bridge Ports') }}</div>
        </template>
      </q-table>
    </div>
  </div>
</template>
