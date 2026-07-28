<script setup lang="ts">
import type { QTableColumn } from 'quasar';
import { computed, onMounted, ref, shallowRef } from 'vue';
import type { PveRecord } from '@/api/resources';
import { getCephConfig, getCephConfigDb } from '@/api/ceph';
import { gettext } from '@/locale';

const loading = ref(false);
const rawConfig = ref('');
const dbRows = shallowRef<PveRecord[]>([]);
const columns: QTableColumn<PveRecord>[] = [
  {
    name: 'section',
    label: gettext('Section'),
    align: 'left',
    field: (row) => row.section || '-',
    sortable: true,
  },
  {
    name: 'name',
    required: true,
    label: gettext('Name'),
    align: 'left',
    field: (row) => row.name || '-',
    sortable: true,
  },
  {
    name: 'value',
    label: gettext('Value'),
    align: 'left',
    field: (row) => row.value || '-',
    sortable: true,
  },
  {
    name: 'level',
    label: gettext('Level'),
    align: 'left',
    field: (row) => row.level || '-',
    sortable: true,
  },
];

const configText = computed(() => rawConfig.value || gettext('no record can be found'));

async function refreshData() {
  loading.value = true;
  try {
    const [rawResponse, dbResponse] = await Promise.allSettled([
      getCephConfig(),
      getCephConfigDb(),
    ]);
    if (rawResponse.status === 'fulfilled') {
      rawConfig.value =
        typeof rawResponse.value.data === 'string'
          ? rawResponse.value.data
          : JSON.stringify(rawResponse.value.data || {}, null, 2);
    }
    if (dbResponse.status === 'fulfilled') dbRows.value = dbResponse.value.data || [];
  } finally {
    loading.value = false;
  }
}

onMounted(refreshData);
</script>

<template>
  <div class="column q-gutter-md">
    <q-btn
      no-caps
      outline
      size="12px"
      color="primary"
      class="u-button self-start"
      :loading="loading"
      :label="gettext('Refresh')"
      @click="refreshData"
    />
    <q-card flat bordered
      ><q-card-section
        ><div class="text-subtitle2 q-mb-sm">{{ gettext('Configuration') }}</div>
        <pre class="ceph-pre">{{ configText }}</pre>
      </q-card-section></q-card
    >
    <q-table
      flat
      row-key="name"
      table-header-class="u-table-header"
      :title="gettext('Configuration Database')"
      :rows="dbRows"
      :columns="columns"
      :loading="loading"
      :pagination="{ page: 1, rowsPerPage: 10 }"
      :rows-per-page-options="[10]"
    />
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
