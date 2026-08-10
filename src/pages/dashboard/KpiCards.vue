<template>
  <div class="row q-col-gutter-sm">
    <!-- 集群状态 -->
    <div class="col-6 col-md-4 col-xl-2">
      <q-card flat bordered class="kpi-card">
        <q-card-section class="kpi-card__content">
          <div class="row items-center no-wrap">
            <div class="kpi-icon kpi-icon--blue">
              <q-icon name="dashboard" size="22px" />
            </div>

            <div class="kpi-main">
              <div class="kpi-label">集群状态</div>
              <div class="kpi-value">健康</div>
            </div>
          </div>

          <div class="kpi-footer">
            <span class="status-dot status-dot--success"></span>
            <span class="ellipsis"> 集群 EVS-Cluster · 具有法定数目：是 </span>
          </div>
        </q-card-section>
      </q-card>
    </div>

    <!-- Ceph 状态 -->
    <div class="col-6 col-md-4 col-xl-2">
      <q-card flat bordered class="kpi-card">
        <q-card-section class="kpi-card__content">
          <div class="row items-center no-wrap">
            <div class="kpi-icon kpi-icon--red">
              <q-icon name="storage" size="22px" />
            </div>

            <div class="kpi-main">
              <div class="kpi-label">Ceph 状态</div>
              <div class="kpi-value">健康</div>
            </div>
          </div>

          <div class="kpi-footer">
            <span class="status-dot status-dot--success"></span>
            <span class="ellipsis"> HEALTH_OK · 版本 18.2.4 </span>
          </div>
        </q-card-section>
      </q-card>
    </div>

    <!-- 节点在线数 -->
    <div class="col-6 col-md-4 col-xl-2">
      <q-card flat bordered class="kpi-card">
        <q-card-section class="kpi-card__content">
          <div class="row items-center no-wrap">
            <div class="kpi-icon kpi-icon--blue">
              <q-icon name="dns" size="22px" />
            </div>

            <div class="kpi-main">
              <div class="kpi-label">节点在线数</div>
              <div class="kpi-value">6 / 6</div>
            </div>
          </div>

          <div class="kpi-footer">
            <span class="status-dot status-dot--success"></span>
            <span class="ellipsis"> 离线 0 · 在线率 100% </span>
          </div>
        </q-card-section>
      </q-card>
    </div>

    <!-- 虚拟机 -->
    <div class="col-6 col-md-4 col-xl-2">
      <q-card flat bordered class="kpi-card">
        <q-card-section class="kpi-card__content">
          <div class="row items-center no-wrap">
            <div class="kpi-icon kpi-icon--purple">
              <q-icon name="computer" size="22px" />
            </div>

            <div class="kpi-main">
              <div class="kpi-label">虚拟机</div>
              <div class="kpi-value">32</div>
            </div>
          </div>

          <div class="kpi-footer">
            <span class="status-dot status-dot--muted"></span>
            <span class="ellipsis"> 运行中 28 · 已停止 4 </span>
          </div>
        </q-card-section>
      </q-card>
    </div>

    <!-- LXC 容器 -->
    <div class="col-6 col-md-4 col-xl-2">
      <q-card flat bordered class="kpi-card">
        <q-card-section class="kpi-card__content">
          <div class="row items-center no-wrap">
            <div class="kpi-icon kpi-icon--green">
              <q-icon name="layers" size="22px" />
            </div>

            <div class="kpi-main">
              <div class="kpi-label">LXC 容器</div>
              <div class="kpi-value">18</div>
            </div>
          </div>

          <div class="kpi-footer">
            <span class="status-dot status-dot--muted"></span>
            <span class="ellipsis"> 运行中 15 · 已停止 3 </span>
          </div>
        </q-card-section>
      </q-card>
    </div>

    <!-- OSD 总数 -->
    <div class="col-6 col-md-4 col-xl-2">
      <q-card flat bordered class="kpi-card">
        <q-card-section class="kpi-card__content">
          <div class="row items-center no-wrap">
            <div class="kpi-icon kpi-icon--orange">
              <q-icon name="shield" size="22px" />
            </div>

            <div class="kpi-main">
              <div class="kpi-label">OSD 总数</div>
              <div class="kpi-value">24</div>
            </div>
          </div>

          <div class="kpi-footer">
            <span class="status-dot status-dot--success"></span>
            <span class="ellipsis"> 在线 24 · 告警 0 </span>
          </div>
        </q-card-section>
      </q-card>
    </div>
  </div>
</template>

<script setup lang="ts"></script>

<style scoped>
.kpi-card {
  height: 100%;
  min-height: 112px;
  background: #ffffff;
  border-color: #e5e7eb;
  border-radius: 8px;
  box-shadow: 0 1px 2px rgba(37, 99, 235, 0.04);
  transition:
    border-color 0.2s ease,
    box-shadow 0.2s ease,
    transform 0.2s ease;
}

.kpi-card:hover {
  border-color: #d4e3f7;
  box-shadow: 0 4px 12px rgba(25, 118, 210, 0.08);
  transform: translateY(-1px);
}

.kpi-card__content {
  padding: 14px;
}

.kpi-icon {
  display: flex;
  width: 42px;
  height: 42px;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  border-radius: 8px;
  margin-right: 12px;
}

/* 集群 / 节点 */
.kpi-icon--blue {
  color: #1976d2;
  background: rgba(25, 118, 210, 0.1);
}

/* Ceph */
.kpi-icon--red {
  color: #e35d6a;
  background: rgba(227, 93, 106, 0.1);
}

/* 虚拟机 */
.kpi-icon--purple {
  color: #6f73d9;
  background: rgba(111, 115, 217, 0.1);
}

/* LXC */
.kpi-icon--green {
  color: #27a474;
  background: rgba(39, 164, 116, 0.1);
}

/* OSD */
.kpi-icon--orange {
  color: #e59b3a;
  background: rgba(229, 155, 58, 0.12);
}

.kpi-main {
  min-width: 0;
  flex: 1;
}

.kpi-label {
  margin-bottom: 2px;
  overflow: hidden;
  color: #7b8494;
  font-size: 12px;
  line-height: 18px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.kpi-value {
  color: #1976d2;
  font-size: 21px;
  font-weight: 600;
  line-height: 28px;
  font-variant-numeric: tabular-nums;
}

.kpi-footer {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 6px;
  margin-top: 10px;
  color: #8b94a3;
  font-size: 11px;
  line-height: 16px;
}

.status-dot {
  width: 6px;
  height: 6px;
  flex-shrink: 0;
  border-radius: 50%;
}

.status-dot--success {
  background: #27a474;
}

.status-dot--muted {
  background: #aeb5c0;
}

.ellipsis {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
