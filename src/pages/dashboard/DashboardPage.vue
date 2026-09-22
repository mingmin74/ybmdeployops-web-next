<template>
  <div class="q-pa-md dashboard-layout">
    <!-- KPI -->
    <KpiCards :ceph-available="cephAvailable" />

    <!-- 拓扑 + 资源 / 状态 -->
    <div class="dashboard-row">
      <div class="dashboard-row__topology">
        <TopologyCard />
      </div>

      <div class="dashboard-row__overview">
        <div class="dashboard-row__resources">
          <ResourcesPanel />
        </div>

        <div class="dashboard-row__ceph-status">
          <CephStatusPanel :ceph-available="cephAvailable" />
        </div>

        <!-- 客户模块暂时隐藏
        <div class="dashboard-row__guests">
          <GuestsPanel />
        </div>
        -->
      </div>
    </div>

    <!-- 节点 + Ceph 服务 -->
    <div class="row q-col-gutter-sm">
      <div class="col-12 col-lg-6">
        <NodesTable />
      </div>

      <div class="col-12 col-lg-6">
        <CephServicesPanel :ceph-available="cephAvailable" />
      </div>
    </div>

    <!-- 性能 -->
    <PerformancePanel :ceph-available="cephAvailable" />
  </div>
</template>

<script setup lang="ts">
import { onMounted, shallowRef } from 'vue';
import { probeCeph } from '@/api/cephSetup';
import { request } from '@/api/request';
import KpiCards from './KpiCards.vue';
import TopologyCard from './TopologyCard.vue';
import ResourcesPanel from './ResourcesPanel.vue';
import NodesTable from './NodesTable.vue';
import CephStatusPanel from './CephStatusPanel.vue';
import CephServicesPanel from './CephServicesPanel.vue';
import PerformancePanel from './PerformancePanel.vue';

const cephAvailable = shallowRef(false);

async function detectCeph() {
  try {
    const response = await request<{ type: string; name: string; local?: number | boolean }[]>(
      '/cluster/status',
      { silent: true }
    );
    const node = response.data?.find((entry) => entry.type === 'node' && entry.local)?.name;
    if (!node) return;

    cephAvailable.value = (await probeCeph(node)) === 'ready';
  } catch {
    cephAvailable.value = false;
  }
}

onMounted(() => {
  void detectCeph();
});
</script>

<style scoped>
.dashboard-row {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.dashboard-row__overview {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.dashboard-row__resources {
  order: 1;
}

.dashboard-row__ceph-status {
  order: 2;
}

.dashboard-layout {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

@media (min-width: 1440px) {
  .dashboard-row {
    display: grid;
    grid-template-columns: minmax(0, 3fr) minmax(0, 1.5fr) minmax(0, 1.5fr);
  }

  .dashboard-row__topology {
    grid-column: 1;
    grid-row: span 2;
  }

  .dashboard-row__overview {
    display: grid;
    grid-column: span 2;
    grid-row: span 2;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    grid-template-rows: auto minmax(0, 1fr);
  }

  .dashboard-row__resources,
  .dashboard-row__ceph-status {
    order: initial;
  }

  .dashboard-row__resources {
    grid-column: 1 / -1;
    grid-row: 2;
  }

  .dashboard-row__ceph-status {
    grid-column: 1 / -1;
    grid-row: 1;
  }
}

@media (min-width: 1904px) {
  .dashboard-layout {
    height: calc(100vh - 54px);
    height: calc(100dvh - 54px);
    overflow: hidden;
  }

  .dashboard-layout > :deep(.performance-card) {
    min-height: 0;
    flex: 1 1 0;
  }
}
</style>
