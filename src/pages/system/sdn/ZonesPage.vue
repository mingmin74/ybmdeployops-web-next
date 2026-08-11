<script setup lang="ts">
import type { Component } from 'vue';
import { computed, onMounted, ref, shallowRef } from 'vue';
import { Dialog } from 'quasar';
import type { QTableColumn } from 'quasar';
import type { PveRecord } from '@/api/resources';
import { deleteSdnZone, getSdnZones } from '@/api/sdn';
import { gettext } from '@/locale';
import { textValue } from '@/utils/pveFormat';
import ZoneEditor, { type SdnZoneType } from './zones/ZoneEditor.vue';

defineOptions({ name: 'CtZonesPage' });

const loading = ref(false);
const filter = ref('');
const selected = ref<PveRecord[]>([]);
const rows = shallowRef<PveRecord[]>([]);

const editorVisible = ref(false);
const editor = shallowRef<Component>(ZoneEditor);
const editorProps = shallowRef<{ zoneType: SdnZoneType; zoneId?: string }>({
  zoneType: 'simple',
});

const zoneTypeLabels: Record<SdnZoneType, string> = {
  simple: 'Simple',
  vlan: 'VLAN',
  qinq: 'QinQ',
  vxlan: 'VXLAN',
  evpn: 'EVPN',
};

const addableTypes: SdnZoneType[] = ['simple', 'vlan', 'qinq', 'vxlan', 'evpn'];

function pendingValue(row: PveRecord, key: string): unknown {
  const pending = (row.pending as PveRecord) || {};
  return pending[key] ?? row[key];
}

function displayValue(row: PveRecord, key: string): string {
  const v = pendingValue(row, key);
  if (v === undefined || v === null || v === '') return '-';
  if (Array.isArray(v)) {
    return v
      .map((item) => {
        const s = textValue(item).split(',')[0] ?? '';
        return s.replace(/^name=/, '');
      })
      .sort()
      .join(', ');
  }
  return textValue(v);
}

function zoneTypeLabel(row: PveRecord): string {
  const t = textValue(pendingValue(row, 'type'));
  return zoneTypeLabels[t as SdnZoneType] || t;
}

const selectedZone = computed(() => selected.value[0]);

const selectedDeleted = computed(() => textValue(selectedZone.value?.state) === 'deleted');

const canEditOrRemove = computed(() => selected.value.length === 1 && !selectedDeleted.value);

function identityZone(row: PveRecord): string {
  return textValue(row.zone);
}
function identityType(row: PveRecord): SdnZoneType {
  return textValue(row.type) as SdnZoneType;
}

const columns: QTableColumn<PveRecord>[] = [
  {
    name: 'zone',
    required: true,
    label: gettext('Zone'),
    align: 'left',
    field: (row) => displayValue(row, 'zone'),
    sortable: true,
  },
  {
    name: 'type',
    label: gettext('Type'),
    align: 'left',
    field: (row) => zoneTypeLabel(row),
    sortable: true,
  },
  {
    name: 'mtu',
    label: 'MTU',
    align: 'left',
    field: (row) => displayValue(row, 'mtu'),
    sortable: true,
  },
  {
    name: 'ipam',
    label: 'IPAM',
    align: 'left',
    field: (row) => displayValue(row, 'ipam'),
    sortable: true,
  },
  {
    name: 'dnszone',
    label: gettext('Domain'),
    align: 'left',
    field: (row) => displayValue(row, 'dnszone'),
    sortable: true,
  },
  {
    name: 'dns',
    label: 'DNS',
    align: 'left',
    field: (row) => displayValue(row, 'dns'),
    sortable: true,
  },
  {
    name: 'reversedns',
    label: gettext('Reverse DNS'),
    align: 'left',
    field: (row) => displayValue(row, 'reversedns'),
    sortable: true,
  },
  {
    name: 'nodes',
    label: gettext('Nodes'),
    align: 'left',
    field: (row) => displayValue(row, 'nodes'),
    sortable: true,
  },
  {
    name: 'state',
    label: gettext('State'),
    align: 'left',
    field: (row) => displayValue(row, 'state'),
    sortable: true,
  },
];

async function refreshData() {
  loading.value = true;
  try {
    const response = await getSdnZones();
    const data = response.data || [];
    rows.value = [...data].sort((a, b) => textValue(a.zone).localeCompare(textValue(b.zone)));
    selected.value = [];
  } finally {
    loading.value = false;
  }
}

function openAdd(type: SdnZoneType) {
  editorProps.value = { zoneType: type };
  editorVisible.value = true;
}

function openEdit() {
  const row = selectedZone.value;
  if (!row) return;
  const type = identityType(row);
  const zone = identityZone(row);
  if (!type || !zone) return;
  editorProps.value = { zoneType: type, zoneId: zone };
  editorVisible.value = true;
}

function onRowDblClick(_evt: unknown, row: PveRecord) {
  const t = identityType(row);
  const z = identityZone(row);
  if (!t || !z || textValue(row.state) === 'deleted') return;
  editorProps.value = { zoneType: t, zoneId: z };
  editorVisible.value = true;
}

function removeSelected() {
  const row = selectedZone.value;
  if (!row) return;
  const zone = identityZone(row);
  if (!zone) return;
  Dialog.create({
    title: gettext('Confirm'),
    message: gettext('Are you sure to delete [%s]?').replace('%s', zone),
    cancel: true,
    persistent: true,
  }).onOk(() => {
    void (async () => {
      loading.value = true;
      try {
        await deleteSdnZone(zone);
        await refreshData();
      } finally {
        loading.value = false;
      }
    })();
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
      @row-dblclick="onRowDblClick"
    >
      <template #top>
        <div class="row q-gutter-sm">
          <q-btn-dropdown
            no-caps
            outline
            size="12px"
            color="primary"
            class="u-button"
            :label="gettext('Add')"
          >
            <q-list dense>
              <q-item
                v-for="type in addableTypes"
                :key="type"
                v-close-popup
                clickable
                @click="openAdd(type)"
              >
                <q-item-section>{{ zoneTypeLabels[type] }}</q-item-section>
              </q-item>
            </q-list>
          </q-btn-dropdown>
          <q-btn
            no-caps
            outline
            size="12px"
            :color="canEditOrRemove ? 'primary' : 'grey'"
            class="u-button"
            :disable="!canEditOrRemove"
            :label="gettext('Edit')"
            @click="openEdit"
          />
          <q-btn
            no-caps
            outline
            size="12px"
            :color="canEditOrRemove ? 'red' : 'grey'"
            class="u-button"
            :disable="!canEditOrRemove"
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
        <q-input v-model="filter" borderless dense debounce="300" :placeholder="gettext('Search')">
          <template #append>
            <q-icon name="search" />
          </template>
        </q-input>
      </template>
      <template #body-cell-state="scope">
        <q-td :props="scope">
          <q-badge
            v-if="textValue(pendingValue(scope.row, 'state'))"
            :color="
              textValue(pendingValue(scope.row, 'state')) === 'deleted' ? 'negative' : 'warning'
            "
            :label="textValue(pendingValue(scope.row, 'state'))"
          />
          <span v-else>-</span>
        </q-td>
      </template>
    </q-table>
    <component
      :is="editor"
      v-if="editor"
      v-model="editorVisible"
      v-bind="editorProps"
      @saved="refreshData"
    />
  </div>
</template>
