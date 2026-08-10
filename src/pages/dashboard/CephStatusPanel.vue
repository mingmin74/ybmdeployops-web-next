<template>
  <q-card flat bordered class="ceph-status-card">
    <!-- 标题 -->
    <q-card-section class="ceph-status-card__header">
      <div class="ceph-status-card__title">状态</div>
    </q-card-section>

    <q-separator />

    <!-- 主体 -->
    <q-card-section class="ceph-status-card__body">
      <div class="row">
        <!-- OSD 状态 -->
        <div class="col-6 ceph-section ceph-section--osd">
          <div class="ceph-section__title">OSDs</div>

          <div class="osd-table">
            <!-- 表头 -->
            <div class="osd-row osd-row--header">
              <div class="osd-cell osd-cell--label"></div>

              <div class="osd-cell">
                <div class="osd-head-label">
                  <span class="legend-dot legend-dot--in"></span>
                  <span>已加入</span>
                </div>
              </div>

              <div class="osd-cell">
                <div class="osd-head-label">
                  <span class="legend-dot legend-dot--out"></span>
                  <span>已移出</span>
                </div>
              </div>
            </div>

            <!-- 在线 -->
            <div class="osd-row">
              <div class="osd-cell osd-cell--label">
                <div class="osd-status osd-status--online">
                  <q-icon name="arrow_circle_up" size="17px" />
                  <span>在线</span>
                </div>
              </div>

              <div class="osd-cell osd-cell--value">24</div>

              <div class="osd-cell osd-cell--value">0</div>
            </div>

            <!-- 离线 -->
            <div class="osd-row">
              <div class="osd-cell osd-cell--label">
                <div class="osd-status osd-status--offline">
                  <q-icon name="arrow_circle_down" size="17px" />
                  <span>离线</span>
                </div>
              </div>

              <div class="osd-cell osd-cell--value">0</div>

              <div class="osd-cell osd-cell--value">0</div>
            </div>
          </div>

          <div class="osd-total">
            总计：
            <span>24</span>
          </div>
        </div>

        <!-- PG 状态 -->
        <div class="col-6 ceph-section ceph-section--pg">
          <div class="pg-content">
            <!-- 环形图 -->
            <div class="pg-donut">
              <div class="pg-donut__inner">
                <div class="pg-donut__value">512</div>

                <div class="pg-donut__label">PGs</div>
              </div>
            </div>

            <!-- 图例 -->
            <div class="pg-legend">
              <div class="pg-legend__item">
                <span class="pg-legend__dot pg-legend__dot--active"></span>

                <span class="pg-legend__label"> active+clean： </span>

                <span class="pg-legend__value"> 486 </span>
              </div>

              <div class="pg-legend__item">
                <span class="pg-legend__dot pg-legend__dot--degraded"></span>

                <span class="pg-legend__label"> degraded： </span>

                <span class="pg-legend__value"> 18 </span>
              </div>

              <div class="pg-legend__item">
                <span class="pg-legend__dot pg-legend__dot--warning"></span>

                <span class="pg-legend__label"> undersized： </span>

                <span class="pg-legend__value"> 8 </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </q-card-section>
  </q-card>
</template>

<script setup lang="ts"></script>

<style scoped>
.ceph-status-card {
  width: 100%;
  height: 100%;
  background: #ffffff;
  border-color: #e5e7eb;
  border-radius: 8px;
  box-shadow: 0 1px 2px rgba(37, 99, 235, 0.04);
}

/* ---------------- header ---------------- */

.ceph-status-card__header {
  padding: 10px 14px;
}

.ceph-status-card__title {
  color: #303846;
  font-size: 14px;
  font-weight: 600;
  line-height: 28px;
}

/* ---------------- body ---------------- */

.ceph-status-card__body {
  padding: 14px;
}

.ceph-section {
  min-width: 0;
}

.ceph-section--osd {
  padding-right: 18px;
}

.ceph-section--pg {
  display: flex;
  align-items: center;
  padding-left: 18px;
  border-left: 1px solid #edf0f3;
}

.ceph-section__title {
  margin-bottom: 10px;
  color: #7b8494;
  font-size: 12px;
  font-weight: 500;
  line-height: 18px;
  text-align: center;
}

/* ---------------- OSD table ---------------- */

.osd-table {
  width: 100%;
}

.osd-row {
  display: grid;
  grid-template-columns: 1fr 72px 72px;
  min-height: 34px;
  align-items: center;
  border-top: 1px solid #edf0f3;
}

.osd-row--header {
  min-height: 28px;
  border-top: 0;
}

.osd-cell {
  min-width: 0;
  color: #3e4653;
  font-size: 12px;
  text-align: right;
}

.osd-cell--label {
  text-align: left;
}

.osd-cell--value {
  font-size: 13px;
  font-weight: 500;
  font-variant-numeric: tabular-nums;
}

.osd-head-label {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  color: #7b8494;
  font-size: 11px;
}

/* ---------------- OSD status ---------------- */

.osd-status {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  color: #7b8494;
  font-size: 12px;
}

.osd-status--online .q-icon {
  color: #27a474;
}

.osd-status--offline .q-icon {
  color: #e35d6a;
}

/* ---------------- legend dot ---------------- */

.legend-dot {
  display: inline-block;
  width: 7px;
  height: 7px;
  flex-shrink: 0;
  border-radius: 50%;
}

.legend-dot--in {
  background: #27a474;
}

.legend-dot--out {
  background: transparent;
  border: 1px solid #e59b3a;
}

/* ---------------- total ---------------- */

.osd-total {
  margin-top: 8px;
  color: #8b94a3;
  font-size: 11px;
  line-height: 18px;
  text-align: center;
}

.osd-total span {
  color: #303846;
  font-size: 13px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

/* ---------------- PG ---------------- */

.pg-content {
  display: flex;
  width: 100%;
  align-items: center;
  justify-content: center;
  gap: 18px;
}

/* 环形图 */

.pg-donut {
  position: relative;
  width: 112px;
  height: 112px;
  flex-shrink: 0;
  background: conic-gradient(#27a474 0deg 341deg, #e59b3a 341deg 354deg, #e35d6a 354deg 360deg);
  border-radius: 50%;
}

.pg-donut::after {
  position: absolute;
  inset: 20px;
  background: #ffffff;
  border-radius: 50%;
  content: '';
}

.pg-donut__inner {
  position: absolute;
  z-index: 1;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
}

.pg-donut__value {
  color: #303846;
  font-size: 20px;
  font-weight: 600;
  line-height: 24px;
  font-variant-numeric: tabular-nums;
}

.pg-donut__label {
  margin-top: 1px;
  color: #8b94a3;
  font-size: 10px;
  line-height: 14px;
}

/* ---------------- PG legend ---------------- */

.pg-legend {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 8px;
}

.pg-legend__item {
  display: flex;
  align-items: center;
  white-space: nowrap;
}

.pg-legend__dot {
  width: 7px;
  height: 7px;
  flex-shrink: 0;
  margin-right: 7px;
  border-radius: 50%;
}

.pg-legend__dot--active {
  background: #27a474;
}

.pg-legend__dot--degraded {
  background: #e59b3a;
}

.pg-legend__dot--warning {
  background: #e35d6a;
}

.pg-legend__label {
  color: #7b8494;
  font-size: 11px;
}

.pg-legend__value {
  margin-left: auto;
  padding-left: 5px;
  color: #303846;
  font-size: 12px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}
</style>
