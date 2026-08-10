
<template>

  <div class="q-pa-md dashboard-layout">
    <!-- KPI -->
    <KpiCards />

    <!-- 拓扑 + 健康状态 / 虚拟机 -->
    <div class="dashboard-row">
      <div class="dashboard-row__column">
        <TopologyCard />
      </div>

      <div class="dashboard-row__column">
        <div class="column dashboard-row__side">
          <div class="dashboard-row__panel">
            <HealthPanel />
          </div>
          <div class="dashboard-row__panel">
            <GuestsPanel />
          </div>
        </div>
      </div>
    </div>

    <!-- 资源使用 + 节点 -->
    <div class="row q-col-gutter-sm">
      <div class="col-12 col-lg-5">
        <ResourcesPanel />
      </div>

      <div class="col-12 col-lg-7">
        <NodesTable />
      </div>
    </div>

    <!-- Ceph 状态 + Ceph 服务 -->
    <div class="row q-col-gutter-sm">
      <div class="col-12 col-lg-5">
        <CephStatusPanel />
      </div>

      <div class="col-12 col-lg-7">
        <CephServicesPanel />
      </div>
    </div>

    <!-- 性能 -->
    <PerformancePanel />
  </div>

</template>

<script setup>
import KpiCards from './KpiCards.vue'


 import TopologyCard from './TopologyCard.vue'
 import HealthPanel from './HealthPanel.vue'
 import GuestsPanel from './GuestsPanel.vue'
import ResourcesPanel from './ResourcesPanel.vue'
import NodesTable from './NodesTable.vue'
import CephStatusPanel from './CephStatusPanel.vue'
import CephServicesPanel from './CephServicesPanel.vue'
import PerformancePanel from './PerformancePanel.vue'
</script>

<style scoped>
.dashboard-row {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.dashboard-row__column {
  display: flex;
  flex-direction: column;
}

.dashboard-row__side {
  gap: 8px;
}

.dashboard-row__panel {
  min-height: 0;
}

.dashboard-layout {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

@media (min-width: 1440px) {
  .dashboard-row {
    display: grid;
    grid-template-columns: minmax(0, 2fr) minmax(0, 1fr);
  }

  .dashboard-row__side {
    flex: 1 1 auto;
    min-height: 0;
  }

  .dashboard-row__panel:first-child {
    display: flex;
    flex: 1 1 auto;
  }

  .dashboard-row__panel:first-child :deep(.q-card) {
    flex: 1 1 auto;
  }
}

</style>
