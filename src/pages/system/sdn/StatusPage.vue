<script setup lang="ts">
import type { QTableColumn } from 'quasar';
import { Dialog, Notify } from 'quasar';
import { onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue';
import type { PveRecord } from '@/api/resources';
import { getClusterResources } from '@/api/resources';
import { applySdnChanges, getSdnDryRun } from '@/api/sdn';
import NodeSelectTable from '@/components/NodeSelectTable.vue';
import UWindow from '@/components/UWindow.vue';
import { gettext } from '@/locale';
import { textValue } from '@/utils/pveFormat';

const loading = ref(false);
const refreshing = ref(false);
const filter = ref('');
const dryRunVisible = ref(false);
const dryRunLoading = ref(false);
const selectedNode = ref('');
const dryRunSelectorKey = ref(0);
const rows = shallowRef<PveRecord[]>([]);
const frrDiff = ref('');
const interfacesDiff = ref('');
const refreshInterval = 3000;
let refreshTimer: number | undefined;

const columns: QTableColumn<PveRecord>[] = [
  {
    name: 'network',
    required: true,
    label: 'SDN',
    align: 'left',
    field: (row) => row.network || '-',
    sortable: true,
  },
  {
    name: 'node',
    label: gettext('Node'),
    align: 'left',
    field: (row) => row.node || '-',
    sortable: true,
  },
  {
    name: 'network-type',
    label: gettext('Type'),
    align: 'left',
    field: (row) => row['network-type'] || '-',
    sortable: true,
  },
  {
    name: 'status',
    label: gettext('Status'),
    align: 'left',
    field: (row) => row.status || '-',
    sortable: true,
  },
];

async function refreshData() {
  if (refreshing.value) return;

  refreshing.value = true;
  loading.value = true;
  try {
    const response = await getClusterResources();
    rows.value = (response.data || []).filter((row) => textValue(row.type) === 'network');
  } catch {
    // request() reports the error; keep polling alive after a failed refresh.
  } finally {
    loading.value = false;
    refreshing.value = false;
  }
}

function applyChanges() {
  Dialog.create({
    title: gettext('Confirm'),
    message: gettext(
      'Applying pending SDN changes will also apply any pending local node network changes. Proceed?'
    ),
    cancel: true,
    persistent: true,
  }).onOk(() => {
    loading.value = true;
    void applySdnChanges()
      .then(() => {
        Notify.create({ type: 'positive', message: gettext('SDN changes applied') });
        return refreshData();
      })
      .catch(() => undefined)
      .finally(() => {
        loading.value = false;
      });
  });
}

function openDryRun() {
  selectedNode.value = '';
  dryRunSelectorKey.value += 1;
  frrDiff.value = '';
  interfacesDiff.value = '';
  dryRunVisible.value = true;
}

async function loadDryRun(node: string) {
  frrDiff.value = '';
  interfacesDiff.value = '';
  if (!node) return;

  dryRunLoading.value = true;
  try {
    const response = await getSdnDryRun(node);
    const data = response.data || {};
    frrDiff.value = textValue(data['frr-diff']) || gettext('No changes');
    interfacesDiff.value = textValue(data['interfaces-diff']) || gettext('No changes');
  } catch {
    // request() reports the error.
  } finally {
    dryRunLoading.value = false;
  }
}

function statusColor(value: unknown) {
  const status = textValue(value).toLowerCase();
  if (['available', 'online', 'ok', 'active'].includes(status)) return 'positive';
  if (['offline', 'error', 'failed'].includes(status)) return 'negative';
  if (['warning', 'unknown'].includes(status)) return 'warning';
  return 'grey-7';
}

watch(selectedNode, loadDryRun);
onMounted(() => {
  void refreshData();
  refreshTimer = window.setInterval(() => void refreshData(), refreshInterval);
});

onBeforeUnmount(() => {
  if (refreshTimer) window.clearInterval(refreshTimer);
});
</script>

<template>
  <div class="sdn-page sdn-status-page">
    <q-table
      flat
      row-key="id"
      table-header-class="u-table-header"
      :rows="rows"
      :columns="columns"
      :filter="filter"
      :loading="loading"
      :pagination="{ page: 1, rowsPerPage: 10 }"
      :rows-per-page-options="[10]"
      :no-data-label="gettext('no record can be found')"
    >
      <template #top>
        <div class="q-gutter-sm">
          <q-btn
            no-caps
            outline
            size="12px"
            color="primary"
            class="u-button"
            :label="gettext('Apply')"
            @click="applyChanges"
          />
          <q-btn
            no-caps
            outline
            size="12px"
            color="primary"
            class="u-button"
            :label="gettext('Dry-Run')"
            @click="openDryRun"
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
        <q-input
          v-model="filter"
          borderless
          dense
          debounce="300"
          :placeholder="gettext('Search')"
        >
          <template #append><q-icon name="search" /></template>
        </q-input>
      </template>

      <template #body-cell-status="scope">
        <q-td :props="scope">
          <q-badge
            :color="statusColor(scope.value)"
            :label="scope.value || '-'"
          />
        </q-td>
      </template>
    </q-table>

    <q-dialog
      v-model="dryRunVisible"
      persistent
      transition-show="scale"
      transition-hide="scale"
    >
      <UWindow
        :title="gettext('Pending SDN configuration changes')"
        width="800px"
        :loading="dryRunLoading"
      >
        <div class="q-pa-md q-gutter-md u-hidden-error">
          <NodeSelectTable
            :key="dryRunSelectorKey"
            v-model="selectedNode"
            disable-offline
            :label="gettext('Node')"
            field-style="standard"
            width="760px"
          />
          <div class="sdn-diff-section relative-position">
            <q-inner-loading :showing="dryRunLoading">
              <q-spinner
                color="primary"
                size="32px"
              />
            </q-inner-loading>
            <div class="sdn-diff-section__title">{{ gettext('FRR Config') }}</div>
            <pre class="sdn-diff-output">{{ frrDiff }}</pre>
          </div>
          <div class="sdn-diff-section relative-position">
            <q-inner-loading :showing="dryRunLoading">
              <q-spinner
                color="primary"
                size="32px"
              />
            </q-inner-loading>
            <div class="sdn-diff-section__title">{{ gettext('Interfaces Config') }}</div>
            <pre class="sdn-diff-output">{{ interfacesDiff }}</pre>
          </div>
        </div>
        <template #foot>
          <q-space />
          <q-btn
            v-close-popup
            no-caps
            flat
            size="12px"
            class="bg-grey-8 text-grey-1 u-button"
            :label="gettext('Close')"
          />
        </template>
      </UWindow>
    </q-dialog>
  </div>
</template>

<style scoped>
.sdn-page {
  margin: 16px;
  padding: 16px;
  background: #fff;
}

.sdn-status-page {
  min-height: calc(100vh - 96px);
}

.sdn-status-card {
  border-color: var(--app-border);
  border-radius: 0;
}

.sdn-diff-section {
  border: 1px solid var(--app-border);
}

.sdn-diff-section__title {
  padding: 8px 12px;
  background: #f2f5fc;
  border-bottom: 1px solid var(--app-border);
  color: var(--app-text);
  font-size: 13px;
  font-weight: 500;
}

.sdn-diff-output {
  min-height: 150px;
  max-height: 260px;
  margin: 0;
  padding: 10px 12px;
  overflow: auto;
  background: #ffffff;
  white-space: pre;
  font-family: Consolas, 'Courier New', monospace;
  font-size: 12px;
}
</style>
