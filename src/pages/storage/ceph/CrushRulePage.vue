<script setup lang="ts">
import type { QTableColumn } from 'quasar';
import { computed, ref, shallowRef, watch } from 'vue';
import type { PveRecord } from '@/api/resources';
import { getCephCrush, getCephRules } from '@/api/ceph';
import { gettext } from '@/locale';

const loading = ref(false);
const rules = shallowRef<PveRecord[]>([]);
const crush = shallowRef<unknown>('');
const { node = 'localhost' } = defineProps<{ node?: string }>();
const crushText = computed(() =>
  typeof crush.value === 'string' ? crush.value : JSON.stringify(crush.value || {}, null, 2)
);
const columns: QTableColumn<PveRecord>[] = [
  {
    name: 'name',
    required: true,
    label: gettext('Name'),
    align: 'left',
    field: (row) => row.name || '-',
    sortable: true,
  },
  {
    name: 'rule_id',
    label: 'ID',
    align: 'left',
    field: (row) => row.rule_id ?? row.id ?? '-',
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
    name: 'min_size',
    label: gettext('Min Size'),
    align: 'left',
    field: (row) => row.min_size || '-',
    sortable: true,
  },
  {
    name: 'max_size',
    label: gettext('Max Size'),
    align: 'left',
    field: (row) => row.max_size || '-',
    sortable: true,
  },
];

async function refreshData() {
  loading.value = true;
  try {
    const [rulesResponse, crushResponse] = await Promise.allSettled([
      getCephRules(node),
      getCephCrush(node),
    ]);
    if (rulesResponse.status === 'fulfilled') rules.value = rulesResponse.value.data || [];
    if (crushResponse.status === 'fulfilled') crush.value = crushResponse.value.data || {};
  } finally {
    loading.value = false;
  }
}

watch(
  () => node,
  () => void refreshData(),
  { immediate: true }
);
</script>

<template>
  <div class="column q-gutter-md">
    <q-table
      flat
      row-key="name"
      table-header-class="u-table-header"
      :title="gettext('Crush Rule')"
      :rows="rules"
      :columns="columns"
      :loading="loading"
      :pagination="{ page: 1, rowsPerPage: 10 }"
      :rows-per-page-options="[10]"
    >
      <template #top>
        <div class="text-subtitle2">{{ gettext('Crush Rule') }}</div>
        <q-space />
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
    </q-table>
    <q-card
      flat
      bordered
    >
      <q-card-section>
        <div class="text-subtitle2 q-mb-sm">CRUSH</div>
        <pre class="ceph-pre">{{ crushText }}</pre>
      </q-card-section>
    </q-card>
  </div>
</template>

<style scoped>
.ceph-pre {
  max-height: 360px;
  overflow: auto;
  margin: 0;
  white-space: pre-wrap;
}
</style>
