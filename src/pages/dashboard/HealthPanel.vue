<template>
  <q-card flat bordered class="health-card">
    <!-- 标题 -->
    <q-card-section class="health-card__header">
      <div class="health-card__title">健康状态</div>
    </q-card-section>

    <q-separator />

    <!-- 主体 -->
    <q-card-section class="health-card__body">
      <div class="row">
        <!-- 集群状态 -->
        <div class="col-4 health-section">
          <div class="health-section__title">状态</div>

          <div class="health-status-icon">
            <q-icon name="check" size="30px" />
          </div>

          <div class="health-section__description">
            <div>集群：EVS-Cluster</div>
            <div>具有法定数目：是</div>
          </div>
        </div>

        <!-- 节点 -->
        <div class="col-4 health-section health-section--border">
          <div class="health-section__title">节点</div>

          <div class="node-status-list">
            <div class="node-status-item">
              <div class="node-status-item__label">
                <q-icon name="check" size="16px" class="text-positive" />
                <span>在线</span>
              </div>

              <div class="node-status-item__value">6</div>
            </div>

            <div class="node-status-item">
              <div class="node-status-item__label">
                <q-icon name="close" size="16px" class="text-negative" />
                <span>离线</span>
              </div>

              <div class="node-status-item__value">0</div>
            </div>
          </div>
        </div>

        <!-- Ceph -->
        <div class="col-4 health-section">
          <div class="health-section__title">Ceph</div>

          <div class="health-status-icon">
            <q-icon name="check" size="30px" />
          </div>

          <div class="health-section__status">HEALTH_OK</div>

          <div class="health-section__description">Ceph 版本：18.2.4</div>
        </div>
      </div>

      <!-- 概要 -->
      <div class="health-summary">
        <div class="health-summary__label">概要</div>

        <div class="health-summary__content">
          <q-icon name="task_alt" size="18px" class="text-positive" />

          <span> 集群运行正常，所有节点和 Ceph 服务均处于健康状态 </span>
        </div>
      </div>

    </q-card-section>
  </q-card>
</template>

<script setup></script>

<style scoped>
.health-card {
  display: flex;
  width: 100%;
  height: 100%;
  flex-direction: column;
  background: #ffffff;
  border-color: #e5e7eb;
  border-radius: 8px;
  box-shadow: 0 1px 2px rgba(37, 99, 235, 0.04);
}

/* -------------------- header -------------------- */

.health-card__header {
  padding: 10px 14px;
}

.health-card__title {
  color: #303846;
  font-size: 14px;
  font-weight: 600;
  line-height: 28px;
}

/* -------------------- body -------------------- */

.health-card__body {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  padding: 14px;
}

.health-card__body > .row {
  flex: 1 1 auto;
  align-items: center;
}

/* -------------------- health section -------------------- */

.health-section {
  display: flex;
  min-width: 0;
  min-height: 112px;
  flex-direction: column;
  align-items: center;
  padding: 0 14px;
  text-align: center;
}

.health-section--border {
  border-right: 1px solid #edf0f3;
  border-left: 1px solid #edf0f3;
}

.health-section__title {
  margin-bottom: 9px;
  color: #7b8494;
  font-size: 12px;
  font-weight: 500;
  line-height: 18px;
}

/* -------------------- health icon -------------------- */

.health-status-icon {
  display: flex;
  width: 48px;
  height: 48px;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  color: #ffffff;
  background: #27a474;
  border-radius: 50%;
}

/* -------------------- description -------------------- */

.health-section__description {
  margin-top: 7px;
  overflow: hidden;
  color: #8b94a3;
  font-size: 11px;
  line-height: 18px;
}

.health-section__status {
  margin-top: 6px;
  color: #303846;
  font-size: 12px;
  font-weight: 500;
  line-height: 18px;
}

/* -------------------- node -------------------- */

.node-status-list {
  width: 100%;
  max-width: 140px;
  margin-top: 8px;
}

.node-status-item {
  display: flex;
  min-height: 28px;
  align-items: center;
  justify-content: space-between;
}

.node-status-item + .node-status-item {
  margin-top: 4px;
}

.node-status-item__label {
  display: flex;
  align-items: center;
  gap: 6px;
  color: #7b8494;
  font-size: 12px;
}

.node-status-item__value {
  color: #303846;
  font-size: 14px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

/* -------------------- summary -------------------- */

.health-summary {
  margin-top: 14px;
  padding: 9px 11px;
  background: #f7f9fc;
  border: 1px solid #edf0f3;
  border-radius: 6px;
}

.health-summary__label {
  margin-bottom: 4px;
  color: #7b8494;
  font-size: 11px;
  font-weight: 500;
  line-height: 16px;
}

.health-summary__content {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 7px;
  color: #3e4653;
  font-size: 12px;
  line-height: 20px;
}

</style>
