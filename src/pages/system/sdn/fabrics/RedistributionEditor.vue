<script setup lang="ts">
import { computed, shallowRef, watch } from 'vue';
import { request } from '@/api/request';
import { gettext } from '@/locale';

export type RedistributionEntry = { source: string; routeMap: string };

const rows = defineModel<RedistributionEntry[]>({ default: () => [] });
const { sources } = defineProps<{ sources: { label: string; value: string }[] }>();
const routeMaps = shallowRef<{ label: string; value: string }[]>([]);
const duplicateSource = computed(() => {
  const seen = new Set<string>();
  return rows.value.some((row) => !row.source || seen.has(row.source) || !seen.add(row.source));
});
const valid = computed(() => !duplicateSource.value);

async function loadRouteMaps() {
  const response = await request<{ id?: string }[]>('/api2/json/cluster/sdn/route-maps', {
    method: 'GET',
    notifyOnError: true,
  });
  routeMaps.value = (response.data || [])
    .map((item) => String(item.id || ''))
    .filter(Boolean)
    .sort()
    .map((id) => ({ label: id, value: id }));
}
function sourceOptions(index: number) {
  const used = new Set(
    rows.value.filter((_, rowIndex) => rowIndex !== index).map((row) => row.source),
  );
  return sources.filter((source) => !used.has(source.value));
}
function add() {
  const source = sources.find((item) => !rows.value.some((row) => row.source === item.value));
  if (source) rows.value = [...rows.value, { source: source.value, routeMap: '' }];
}
function remove(index: number) {
  rows.value = rows.value.filter((_, rowIndex) => rowIndex !== index);
}
watch(
  () => sources,
  () => void loadRouteMaps(),
  { immediate: true },
);
defineExpose({ valid });
</script>

<template>
  <div class="u-dense">
    <q-table
      flat
      bordered
      dense
      row-key="source"
      :rows="rows"
      :pagination="{ rowsPerPage: 0 }"
      :columns="[
        { name: 'source', label: gettext('Source'), field: 'source', align: 'left' },
        { name: 'route-map', label: gettext('Route Map'), field: 'routeMap', align: 'left' },
        { name: 'remove', label: '', field: 'source', align: 'right' },
      ]"
    >
      <template #body-cell-source="scope"
        ><q-td :props="scope"
          ><q-select
            v-model="scope.row.source"
            dense
            borderless
            emit-value
            map-options
            :options="sourceOptions(scope.rowIndex)" /></q-td
      ></template>
      <template #body-cell-route-map="scope"
        ><q-td :props="scope"
          ><q-select
            v-model="scope.row.routeMap"
            dense
            borderless
            clearable
            emit-value
            map-options
            :options="routeMaps" /></q-td
      ></template>
      <template #body-cell-remove="scope"
        ><q-td :props="scope"
          ><q-btn flat dense color="negative" icon="delete" @click="remove(scope.rowIndex)" /></q-td
      ></template>
    </q-table>
    <div v-if="duplicateSource" class="text-negative text-caption q-mt-sm">
      {{ gettext('Duplicate source') }}
    </div>
    <q-btn
      no-caps
      outline
      size="12px"
      color="primary"
      class="u-button q-mt-sm"
      :disable="rows.length >= sources.length"
      :label="gettext('Add')"
      @click="add"
    />
  </div>
</template>
