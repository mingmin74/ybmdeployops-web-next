<script setup lang="ts">
import type { QTableColumn } from 'quasar';
import { computed, onBeforeUnmount, onMounted, ref, shallowRef } from 'vue';
import { getClusterJoinInfo } from '@/api/cluster';
import { getClusterNodes, type PveRecord } from '@/api/resources';
import TaskOutputDialog from '@/components/TaskOutputDialog.vue';
import ClusterActionDialogs from './components/ClusterActionDialogs.vue';
import { gettext } from '@/locale';

const loading = ref(false);
const rows = shallowRef<PveRecord[]>([]);
const clusterInfo = ref({
  name: '',
  version: '',
  nodeNumber: 0,
});
const joinInfo = shallowRef<PveRecord>({});
const actionMode = shallowRef<'create' | 'information' | 'join' | null>(null);
const taskVisible = shallowRef(false);
const taskUpid = shallowRef('');
const taskTitle = shallowRef('');
let infoTimer: number | undefined;
let nodesTimer: number | undefined;

const inCluster = computed(() => Boolean(clusterInfo.value.name));

function toText(value: unknown) {
  if (typeof value === 'string' || typeof value === 'number') {
    return String(value);
  }
  return '';
}

const columns = computed<QTableColumn<PveRecord>[]>(() => [
  { name: 'node', required: true, label: gettext('Node Name'), field: 'node', align: 'left' },
  { name: 'node_id', label: gettext('Node ID'), align: 'left', field: 'nodeid' },
  { name: 'quorum_votes', label: gettext('Votes'), field: 'quorum_votes', align: 'left' },
  ...Array.from({ length: 8 }, (_, index) => index)
    .filter((index) => rows.value.some((row) => Boolean(row[`ring${index}_addr`])))
    .map((index) => ({ name: `ring${index}_addr`, label: `${gettext('Link')} ${index}`, field: `ring${index}_addr`, align: 'left' as const })),
]);

async function loadClusterInfo() {
  loading.value = true;
  try {
    const [infoResponse, nodesResponse] = await Promise.all([
      getClusterJoinInfo().catch(() => ({ data: {} })),
      getClusterNodes().catch(() => ({ data: [] as PveRecord[] })),
    ]);
    const info: PveRecord = infoResponse.data || {};
    const totem = (info.totem || {}) as PveRecord;
    joinInfo.value = info;
    rows.value = [...(nodesResponse.data || [])].sort((left, right) => toText(left.node).localeCompare(toText(right.node)));
    clusterInfo.value = {
      name: toText(totem.cluster_name),
      version: toText(totem.config_version),
      nodeNumber: Array.isArray(info.nodelist) ? info.nodelist.length : rows.value.length,
    };
  } finally {
    loading.value = false;
  }
}

async function loadJoinInfo() {
  const response = await getClusterJoinInfo().catch(() => ({ data: {} }));
  const info: PveRecord = response.data || {};
  joinInfo.value = info;
  const totem = (info.totem || {}) as PveRecord;
  clusterInfo.value = { name: toText(totem.cluster_name), version: toText(totem.config_version), nodeNumber: Array.isArray(info.nodelist) ? info.nodelist.length : rows.value.length };
}
async function loadNodes() {
  const response = await getClusterNodes().catch(() => ({ data: [] as PveRecord[] }));
  rows.value = [...(response.data || [])].sort((left, right) => toText(left.node).localeCompare(toText(right.node)));
}
function openTask(upid: string, title: string) { taskUpid.value = upid; taskTitle.value = title; taskVisible.value = upid.startsWith('UPID:'); }
function taskNode() { return taskUpid.value.split(':')[1] || toText(joinInfo.value.preferred_node) || toText(rows.value[0]?.node); }

onMounted(() => {
  void loadClusterInfo();
  infoTimer = window.setInterval(() => void loadJoinInfo(), 15000);
  nodesTimer = window.setInterval(() => void loadNodes(), 5000);
});
onBeforeUnmount(() => { if (infoTimer) window.clearInterval(infoTimer); if (nodesTimer) window.clearInterval(nodesTimer); });
</script>

<template>
  <div class="q-ma-md">
    <q-card class="q-mt-sm no-border-radius no-shadow">
      <q-card-section>
        <div class="row q-gutter-sm q-mb-md">
          <q-btn
            no-caps
            outline
            size="12px"
            class="u-button"
            :color="inCluster ? 'grey' : 'primary'"
            :disable="inCluster"
            :label="gettext('Create Cluster')"
            @click="actionMode = 'create'"
          />
          <q-btn
            no-caps
            outline
            size="12px"
            class="u-button"
            :color="inCluster ? 'primary' : 'grey'"
            :disable="!inCluster"
            :label="gettext('Join Information')"
            @click="actionMode = 'information'"
          />
          <q-btn
            no-caps
            outline
            size="12px"
            class="u-button"
            :color="inCluster ? 'grey' : 'primary'"
            :disable="inCluster"
            :label="gettext('Join Cluster')"
            @click="actionMode = 'join'"
          />
          <q-btn
            no-caps
            outline
            size="12px"
            color="primary"
            class="u-button"
            :label="gettext('Refresh')"
            @click="loadClusterInfo"
          />
          <div v-if="inCluster" class="cluster-summary">
            <div class="cluster-summary-item">
              <span>{{ gettext('Cluster Name') }}</span>
              <strong>{{ clusterInfo.name || '-' }}</strong>
            </div>
            <div class="cluster-summary-item">
              <span>{{ gettext('Config Version') }}</span>
              <strong>{{ clusterInfo.version || '-' }}</strong>
            </div>
            <div class="cluster-summary-item">
              <span>{{ gettext('Number of Nodes') }}</span>
              <strong>{{ clusterInfo.nodeNumber }}</strong>
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
    <ClusterActionDialogs v-model="actionMode" :join-info="joinInfo" @task="openTask" />
    <TaskOutputDialog v-model="taskVisible" :node="taskNode()" :upid="taskUpid" :title="taskTitle" @finished="loadClusterInfo" />
  </div>
</template>

<style scoped>
.cluster-summary {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 24px;
  align-items: center;
  margin-left: 8px;
}

.cluster-summary-item {
  display: inline-flex;
  gap: 6px;
  align-items: baseline;
  color: #666;
  font-size: 12px;
}

.cluster-summary-item strong {
  color: #333;
  font-size: 13px;
  font-weight: 500;
}
</style>
