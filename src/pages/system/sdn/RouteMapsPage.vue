<script setup lang="ts">
import type { QTableColumn } from 'quasar';
import { Dialog } from 'quasar';
import { computed, onMounted, ref, shallowRef } from 'vue';
import { deleteSdnRouteMapEntry, getSdnRouteMapEntries } from '@/api/sdn';
import type { PveRecord } from '@/api/resources';
import { gettext } from '@/locale';
import { textValue } from '@/utils/pveFormat';
import RouteMapEntryEditor from './RouteMapEntryEditor.vue';
type RouteMapRow = PveRecord & { key: string };
const loading = ref(false);
const selected = ref<RouteMapRow[]>([]);
const rows = shallowRef<RouteMapRow[]>([]);
const editorVisible = ref(false);
const editing = shallowRef<RouteMapRow>();
const matchLabels: Record<string, string> = {
  'route-type': gettext('Route Type'),
  vni: gettext('VNI'),
  'ip-address-prefix-list': gettext('IPv4 (prefix-list)'),
  'ip6-address-prefix-list': gettext('IPv6 (prefix-list)'),
  'ip-next-hop-prefix-list': gettext('IPv4 next-hop (prefix-list)'),
  'ip6-next-hop-prefix-list': gettext('IPv6 next-hop (prefix-list)'),
  'ip-next-hop-address': gettext('IPv4 next-hop'),
  'ip6-next-hop-address': gettext('IPv6 next-hop'),
  metric: gettext('Metric'),
  'local-preference': gettext('Local Preference'),
  peer: gettext('Peer'),
  tag: gettext('Tag'),
};
const setLabels: Record<string, string> = {
  'ip-next-hop': gettext('IPv4 next-hop'),
  'ip-next-hop-peer-address': gettext('IPv4 next-hop to peer address'),
  'ip-next-hop-unchanged': gettext('IPv4 next-hop unchanged'),
  'ip6-next-hop': gettext('IPv6 next-hop'),
  'ip6-next-hop-peer-address': gettext('IPv6 next-hop to peer address'),
  'ip6-next-hop-prefer-global': gettext('IPv6 next-hop to global address'),
  'local-preference': gettext('Local Preference'),
  tag: gettext('Tag'),
  weight: gettext('Weight'),
  metric: gettext('Metric'),
  src: gettext('Source'),
};
function value(row: PveRecord, key: string) {
  return ((row.pending as PveRecord) || {})[key] ?? row[key];
}
function actionText(row: PveRecord, key: 'match' | 'set') {
  const labels = key === 'match' ? matchLabels : setLabels;
  const raw = value(row, key);
  const actions: unknown[] = Array.isArray(raw) ? raw : [];
  return actions
    .map((item) => {
      const text = textValue(item);
      const actionKey = text.match(/(?:^|,)key=([^,]*)/)?.[1] || '';
      const actionValue = text.match(/(?:^|,)value=([^,]*)/)?.[1] || '';
      return `${labels[actionKey] || actionKey}${actionValue ? `: ${actionValue}` : ''}`;
    })
    .filter(Boolean)
    .join('\n');
}
const columns: QTableColumn<RouteMapRow>[] = [
  {
    name: 'name',
    label: gettext('Name'),
    field: (row) => textValue(value(row, 'route-map-id')) || '-',
    align: 'left',
    sortable: true,
  },
  {
    name: 'order',
    label: gettext('Order'),
    field: (row) => textValue(value(row, 'order')) || '-',
    align: 'left',
    sortable: true,
  },
  {
    name: 'action',
    label: gettext('Action'),
    field: (row) => textValue(value(row, 'action')) || '-',
    align: 'left',
  },
  {
    name: 'match',
    label: gettext('Match'),
    field: (row) => actionText(row, 'match'),
    align: 'left',
  },
  { name: 'set', label: gettext('Set'), field: (row) => actionText(row, 'set'), align: 'left' },
  {
    name: 'call',
    label: gettext('Call'),
    field: (row) => textValue(value(row, 'call')) || '-',
    align: 'left',
  },
  {
    name: 'exit',
    label: gettext('Exit Policy'),
    field: (row) => textValue(value(row, 'exit-action')).match(/(?:^|,)key=([^,]*)/)?.[1] || '-',
    align: 'left',
  },
  {
    name: 'state',
    label: gettext('State'),
    field: (row) => textValue(value(row, 'state')),
    align: 'left',
  },
];
const routeMapIds = computed(() =>
  [
    ...new Set(rows.value.map((row) => textValue(value(row, 'route-map-id'))).filter(Boolean)),
  ].sort(),
);
const editorRouteMapId = computed(() =>
  editing.value ? textValue(value(editing.value, 'route-map-id')) : undefined,
);
const editorOrder = computed(() =>
  editing.value ? textValue(value(editing.value, 'order')) : undefined,
);
async function reload() {
  loading.value = true;
  try {
    rows.value = ((await getSdnRouteMapEntries()).data || [])
      .map((row) => ({
        ...row,
        key: `${textValue(value(row, 'route-map-id'))}_${textValue(value(row, 'order'))}`,
      }))
      .sort(
        (a, b) =>
          textValue(value(a, 'route-map-id')).localeCompare(textValue(value(b, 'route-map-id'))) ||
          Number(value(a, 'order')) - Number(value(b, 'order')),
      );
    selected.value = [];
  } finally {
    loading.value = false;
  }
}
function add() {
  editing.value = undefined;
  editorVisible.value = true;
}
function edit(row?: RouteMapRow) {
  const target = row ?? selected.value[0];
  if (!target) return;
  selected.value = [target];
  editing.value = target;
  editorVisible.value = true;
}
function remove() {
  const row = selected.value[0];
  if (!row) return;
  Dialog.create({
    title: gettext('Confirm'),
    message: gettext('Remove route map entry?'),
    cancel: true,
    persistent: true,
  }).onOk(
    () =>
      void deleteSdnRouteMapEntry(
        textValue(value(row, 'route-map-id')),
        textValue(value(row, 'order')),
      ).then(reload),
  );
}
onMounted(() => void reload());
</script>
<template>
  <div class="sdn-page bg-white">
    <q-table
      flat
      row-key="key"
      table-header-class="u-table-header"
      selection="single"
      :rows="rows"
      :columns="columns"
      :selected="selected"
      :loading="loading"
      :pagination="{ page: 1, rowsPerPage: 10 }"
      :rows-per-page-options="[10]"
      :no-data-label="gettext('No route maps configured.')"
      @row-dblclick="(_, row) => edit(row)"
      @update:selected="selected = [...$event]"
      ><template #top
        ><div class="row q-gutter-sm">
          <q-btn
            no-caps
            outline
            size="12px"
            color="primary"
            class="u-button"
            :label="gettext('Add')"
            @click="add"
          /><q-btn
            no-caps
            outline
            size="12px"
            color="primary"
            class="u-button"
            :disable="selected.length !== 1"
            :label="gettext('Edit')"
            @click="edit()"
          /><q-btn
            no-caps
            outline
            size="12px"
            :color="selected.length !== 1 ? 'grey' : 'red'"
            class="u-button"
            :disable="selected.length !== 1"
            :label="gettext('Remove')"
            @click="remove"
          /><q-btn
            no-caps
            outline
            size="12px"
            color="primary"
            class="u-button"
            :label="gettext('Reload')"
            @click="reload"
          /></div></template
      ><template #body-cell-match="scope"
        ><q-td :props="scope" class="route-map-cell">{{
          actionText(scope.row, 'match')
        }}</q-td></template
      ><template #body-cell-set="scope"
        ><q-td :props="scope" class="route-map-cell">{{
          actionText(scope.row, 'set')
        }}</q-td></template
      ><template #body-cell-state="scope"
        ><q-td :props="scope"
          ><q-badge
            v-if="scope.value"
            :color="scope.value === 'deleted' ? 'negative' : 'warning'"
            :label="scope.value" /></q-td></template></q-table
    ><RouteMapEntryEditor
      v-model="editorVisible"
      :route-map-id="editorRouteMapId"
      :order="editorOrder"
      :route-map-ids="routeMapIds"
      @saved="reload"
    />
  </div>
</template>
<style scoped>
.sdn-page {
  margin: 16px;
  background: #fff;
}

.route-map-cell {
  white-space: pre-line;
}
</style>
