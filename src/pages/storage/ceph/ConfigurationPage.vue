<script setup lang="ts">
import type { QTableColumn } from 'quasar';
import { computed, ref, shallowRef, watch } from 'vue';
import type { PveRecord } from '@/api/resources';
import { getCephConfig, getCephConfigDb, getCephCrush } from '@/api/ceph';
import { gettext } from '@/locale';

const loading = ref(false);
const rawConfig = ref('');
const rawCrush = ref('');
const dbRows = shallowRef<PveRecord[]>([]);
const mainSplitter = ref(50);
const configSplitter = ref(50);
const { node = 'localhost' } = defineProps<{ node?: string }>();

const dbColumns = computed<QTableColumn<PveRecord>[]>(() => {
  const columns: QTableColumn<PveRecord>[] = [
    {
      name: 'section',
      label: gettext('WHO'),
      align: 'left',
      field: (row) => row.section || '-',
      sortable: true,
    },
    {
      name: 'name',
      required: true,
      label: gettext('OPTION'),
      align: 'left',
      field: (row) => row.name || '-',
      sortable: true,
    },
    {
      name: 'value',
      label: gettext('VALUE'),
      align: 'left',
      field: (row) => row.value || '-',
      sortable: true,
    },
  ];

  if (dbRows.value.some((row) => row.mask)) {
    columns.splice(1, 0, {
      name: 'mask',
      label: gettext('MASK'),
      align: 'left',
      field: (row) => row.mask || '-',
      sortable: true,
    });
  }

  return columns;
});

const configText = computed(() => rawConfig.value || gettext('no record can be found'));
const crushText = computed(() => rawCrush.value || gettext('no record can be found'));

function formatRawResponse(value: unknown) {
  return typeof value === 'string' ? value : JSON.stringify(value || {}, null, 2);
}

async function refreshData() {
  loading.value = true;
  try {
    const [rawResponse, crushResponse, dbResponse] = await Promise.allSettled([
      getCephConfig(node),
      getCephCrush(node),
      getCephConfigDb(node),
    ]);
    if (rawResponse.status === 'fulfilled') {
      rawConfig.value = formatRawResponse(rawResponse.value.data);
    }
    if (crushResponse.status === 'fulfilled')
      rawCrush.value = formatRawResponse(crushResponse.value.data);
    if (dbResponse.status === 'fulfilled') dbRows.value = dbResponse.value.data || [];
  } finally {
    loading.value = false;
  }
}

watch(
  () => node,
  () => refreshData(),
  { immediate: true },
);
</script>

<template>
  <div class="ceph-configuration">
    <div class="configuration-toolbar">
      <q-btn
        no-caps
        outline
        size="12px"
        color="primary"
        class="u-button"
        :loading="loading"
        :label="gettext('Refresh')"
        @click="refreshData"
      />
    </div>
    <q-splitter
      v-model="mainSplitter"
      unit="%"
      :limits="[30, 70]"
      class="configuration-main-splitter"
    >
      <template #before
        ><q-splitter
          v-model="configSplitter"
          horizontal
          unit="%"
          :limits="[25, 75]"
          class="configuration-bottom-splitter"
        >
          <template #before
            ><section class="configuration-pane">
              <div class="pane-header">{{ gettext('Configuration') }}</div>
              <pre class="ceph-pre">{{ configText }}</pre>
            </section></template
          >
          <template #after
            ><section class="configuration-pane configuration-db-pane">
              <div class="pane-header">{{ gettext('Configuration Database') }}</div>
              <q-table
                flat
                row-key="name"
                table-header-class="u-table-header"
                :rows="dbRows"
                :columns="dbColumns"
                :loading="loading"
                :pagination="{ page: 1, rowsPerPage: 0 }"
                :rows-per-page-options="[0]"
              /></section
          ></template> </q-splitter
      ></template>
      <template #after
        ><section class="configuration-pane crush-pane">
          <div class="pane-header">Crush Map</div>
          <pre class="ceph-pre">{{ crushText }}</pre>
        </section></template
      >
    </q-splitter>
  </div>
</template>

<style scoped>
.ceph-configuration {
  display: flex;
  flex-direction: column;
  height: calc(100vh - 214px);
  min-height: 560px;
  padding: 16px;
}
.configuration-toolbar {
  display: flex;
  justify-content: flex-end;
  margin-bottom: 10px;
}
.configuration-main-splitter,
.configuration-bottom-splitter {
  background: #fff;
  border: 1px solid #dfe1e6;
  flex: 1;
  min-height: 0;
}
.configuration-main-splitter :deep(.q-splitter__separator),
.configuration-bottom-splitter :deep(.q-splitter__separator) {
  background: #dfe1e6;
}
.configuration-main-splitter :deep(.q-splitter__separator-area),
.configuration-bottom-splitter :deep(.q-splitter__separator-area) {
  width: 7px;
}
.configuration-pane {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
}
.pane-header {
  align-items: center;
  background: #f2f5fc;
  border-bottom: 1px solid #dfe1e6;
  color: #174f86;
  display: flex;
  flex: 0 0 38px;
  font-size: 13px;
  font-weight: 600;
  padding: 0 14px;
}
.ceph-pre {
  margin: 0;
  min-height: 0;
  overflow: auto;
  padding: 10px;
  white-space: pre-wrap;
}
.configuration-db-pane :deep(.q-table__container) {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-height: 0;
}
.configuration-db-pane :deep(.q-table__middle) {
  flex: 1;
}
@media (max-width: 760px) {
  .ceph-configuration {
    height: calc(100vh - 174px);
    min-height: 500px;
    padding: 10px;
  }
}
</style>
