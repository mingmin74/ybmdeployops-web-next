<script setup lang="ts">
import type { QTableColumn } from 'quasar';
import { computed, onMounted, ref, shallowRef } from 'vue';
import { getClusterConfig, getClusterNodes, type PveRecord } from '@/api/resources';
import { gettext } from '@/locale';

const loading = ref(false);
const rows = shallowRef<PveRecord[]>([]);
const clusterInfo = ref({
  name: '',
  version: '',
  nodeNumber: 0,
});

const inCluster = computed(() => Boolean(clusterInfo.value.name));

function toText(value: unknown) {
  if (typeof value === 'string' || typeof value === 'number') {
    return String(value);
  }
  return '';
}

const columns: QTableColumn<PveRecord>[] = [
  { name: 'node', required: true, label: gettext('Node Name'), field: 'node', align: 'left' },
  { name: 'node_id', label: gettext('Node ID'), align: 'left', field: 'nodeid' },
  { name: 'quorum_votes', label: gettext('Votes'), field: 'quorum_votes', align: 'left' },
  { name: 'ring0_addr', label: gettext('Link 0'), field: 'ring0_addr', align: 'left' },
  { name: 'ring1_addr', label: gettext('Link 1'), field: 'ring1_addr', align: 'left' },
];

async function loadClusterInfo() {
  loading.value = true;
  try {
    const [configResponse, nodesResponse] = await Promise.all([
      getClusterConfig(),
      getClusterNodes(),
    ]);
    const config = configResponse.data || {};
    const totem = (config.totem || {}) as PveRecord;
    rows.value = nodesResponse.data || [];
    clusterInfo.value = {
      name: toText(totem.cluster_name),
      version: toText(totem.config_version),
      nodeNumber: rows.value.length,
    };
  } finally {
    loading.value = false;
  }
}

onMounted(() => {
  void loadClusterInfo();
});
</script>

<template>
  <div class="q-ma-md">
    <q-card class="q-mt-sm no-border-radius no-shadow">
      <q-card-section>
        <div class="row q-gutter-md q-mb-md">
          <q-btn
            no-caps
            outline
            size="12px"
            color="primary"
            class="u-button"
            :label="gettext('Refresh')"
            @click="loadClusterInfo"
          />
          <div v-if="inCluster" class="row q-gutter-lg items-center">
            <div>
              {{ gettext('Cluster Name') }}:
              <span class="text-grey-8">{{ clusterInfo.name || '-' }}</span>
            </div>
            <div>
              {{ gettext('Config Version') }}:
              <span class="text-grey-8">{{ clusterInfo.version || '-' }}</span>
            </div>
            <div>
              {{ gettext('Number of Nodes') }}:
              <span class="text-grey-8">{{ clusterInfo.nodeNumber }}</span>
            </div>
          </div>
          <div v-else class="row items-center text-red">
            <q-icon name="warning" class="q-mr-sm" size="24px" />
            {{ gettext('Standalone node - no cluster defined') }}
          </div>
        </div>
        <q-table
          flat
          row-key="node"
          table-header-class="u-table-header"
          :rows="rows"
          :columns="columns"
          :loading="loading"
          :rows-per-page-options="[10]"
          :pagination="{ page: 1, rowsPerPage: 10 }"
          :no-data-label="gettext('no record can be found')"
        >
          <template #no-data="{ message }">
            <div class="full-width row flex-center text-accent q-gutter-sm">
              <span class="text-grey-6">{{ message }}</span>
            </div>
          </template>
        </q-table>
      </q-card-section>
    </q-card>
  </div>
</template>
