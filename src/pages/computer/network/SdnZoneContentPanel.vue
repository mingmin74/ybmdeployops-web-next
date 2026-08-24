<script setup lang="ts">
import type { QTableColumn } from 'quasar';
import { computed, shallowRef, watch } from 'vue';
import { getSdnZoneContent } from '@/api/sdn';
import type { PveRecord } from '@/api/resources';
import { gettext } from '@/locale';
import RulesPage from '@/pages/system/permission/RulesPage.vue';
import { textValue } from '@/utils/pveFormat';

const props = defineProps<{ node: string; zone: string }>();
const loading = shallowRef(false);
const rows = shallowRef<PveRecord[]>([]);
const selected = shallowRef<PveRecord[]>([]);
let requestId = 0;

const columns: QTableColumn<PveRecord>[] = [
  { name: 'vnet', label: 'VNet', field: 'vnet', align: 'left', sortable: true },
  { name: 'alias', label: gettext('Alias'), field: 'alias', align: 'left', sortable: true },
  { name: 'status', label: gettext('Status'), field: 'status', align: 'left', sortable: true },
  { name: 'statusmsg', label: gettext('Details'), field: 'statusmsg', align: 'left' },
];
const selectedVnet = computed(() => textValue(selected.value[0]?.vnet));
const permissionPath = computed(() =>
  selectedVnet.value ? `/sdn/zones/${props.zone}/${selectedVnet.value}` : ''
);

function normalize(row: PveRecord): PveRecord {
  return {
    ...row,
    vnet: textValue(row.vnet || row.iface),
    alias: textValue(row.alias || row.comments),
  };
}

async function load() {
  if (!props.node || !props.zone) {
    rows.value = [];
    selected.value = [];
    return;
  }
  const currentRequest = ++requestId;
  loading.value = true;
  try {
    const response = await getSdnZoneContent(props.node, props.zone);
    if (currentRequest !== requestId) return;
    rows.value = (response.data || [])
      .map(normalize)
      .sort((left, right) => textValue(left.vnet).localeCompare(textValue(right.vnet)));
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
        row-key="vnet"
        selection="single"
        table-header-class="u-table-header"
        :rows="rows"
        :columns="columns"
        :loading="loading"
        :rows-per-page-options="[0]"
        hide-pagination
        :no-data-label="gettext('no record can be found')"
      >
        <template #top>
          <div class="text-subtitle2">{{ gettext('VNets') }}</div>
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
      <RulesPage
        v-if="permissionPath"
        :resource-path="permissionPath"
        vnet-acl
      />
      <div
        v-else
        class="u-border q-pa-md text-grey-7"
      >
        {{ gettext('Select a VNet to view permissions.') }}
      </div>
    </div>
  </div>
</template>
