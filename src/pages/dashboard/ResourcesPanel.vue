<template>
  <q-card flat bordered class="resources-card">
    <!-- 标题 -->
    <q-card-section class="resources-card__header">
      <div class="row items-center justify-between">
        <div class="resources-card__title">资源</div>

        <q-btn flat dense round size="sm" icon="chevron_right" color="grey-6" />
      </div>
    </q-card-section>

    <q-separator />

    <!-- 主体 -->
    <q-card-section class="resources-card__body">
      <div class="row">
        <!-- CPU -->
        <div class="col-4 resource-item">
          <div class="resource-item__title">CPU</div>

          <div class="half-gauge">
            <div class="half-gauge__track">
              <div class="half-gauge__progress half-gauge__progress--cpu"></div>

              <div class="half-gauge__center">
                <div class="half-gauge__value">42<span>%</span></div>
              </div>
            </div>
          </div>

          <div class="resource-item__caption">已使用 42%</div>
        </div>

        <!-- 内存 -->
        <div class="col-4 resource-item resource-item--border">
          <div class="resource-item__title">内存</div>

          <div class="half-gauge">
            <div class="half-gauge__track">
              <div class="half-gauge__progress half-gauge__progress--memory"></div>

              <div class="half-gauge__center">
                <div class="half-gauge__value">68<span>%</span></div>
              </div>
            </div>
          </div>

          <div class="resource-item__caption">174 GB / 256 GB</div>
        </div>

        <!-- 存储 -->
        <div class="col-4 resource-item">
          <div class="resource-item__title">存储</div>

          <div class="half-gauge">
            <div class="half-gauge__track">
              <div class="half-gauge__progress half-gauge__progress--storage"></div>

              <div class="half-gauge__center">
                <div class="half-gauge__value">55<span>%</span></div>
              </div>
            </div>
          </div>

          <div class="resource-item__caption">11 TB / 20 TB</div>
        </div>
      </div>
    </q-card-section>
  </q-card>
</template>

<script setup lang="ts"></script>

<style scoped>
.resources-card {
  width: 100%;
  height: 100%;
  background: #ffffff;
  border-color: #e5e7eb;
  border-radius: 8px;
  box-shadow: 0 1px 2px rgba(37, 99, 235, 0.04);
}

/* ---------------- header ---------------- */

.resources-card__header {
  padding: 10px 14px;
}

.resources-card__title {
  color: #303846;
  font-size: 14px;
  font-weight: 600;
  line-height: 28px;
}

/* ---------------- body ---------------- */

.resources-card__body {
  padding: 16px 12px 14px;
}

/* ---------------- resource ---------------- */

.resource-item {
  display: flex;
  min-width: 0;
  flex-direction: column;
  align-items: center;
  padding: 0 14px;
}

.resource-item--border {
  border-right: 1px solid #edf0f3;
  border-left: 1px solid #edf0f3;
}

.resource-item__title {
  margin-bottom: 12px;
  color: #7b8494;
  font-size: 12px;
  font-weight: 500;
  line-height: 18px;
}

.resource-item__caption {
  margin-top: 5px;
  overflow: hidden;
  color: #8b94a3;
  font-size: 11px;
  line-height: 18px;
  text-align: center;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* ---------------- half gauge ---------------- */

.half-gauge {
  position: relative;
  width: 124px;
  height: 72px;
  overflow: hidden;
}

.half-gauge__track {
  position: absolute;
  top: 0;
  left: 0;
  width: 124px;
  height: 124px;
  background: conic-gradient(from 270deg, #edf1f5 0deg, #edf1f5 180deg, transparent 180deg);
  border-radius: 50%;
}

/*
 * 静态进度。
 * 目前只是调 UI，所以直接通过角度控制。
 * 后面接数据时再改成 style 动态传值。
 */

.half-gauge__progress {
  position: absolute;
  inset: 0;
  border-radius: 50%;
}

/* CPU 42% */
.half-gauge__progress--cpu {
  background: conic-gradient(
    from 270deg,
    #1976d2 0deg,
    #1976d2 75.6deg,
    transparent 75.6deg,
    transparent 360deg
  );
}

/* 内存 68% */
.half-gauge__progress--memory {
  background: conic-gradient(
    from 270deg,
    #5b8def 0deg,
    #5b8def 122.4deg,
    transparent 122.4deg,
    transparent 360deg
  );
}

/* 存储 55% */
.half-gauge__progress--storage {
  background: conic-gradient(
    from 270deg,
    #27a474 0deg,
    #27a474 99deg,
    transparent 99deg,
    transparent 360deg
  );
}

/* 中心挖空 */
.half-gauge__center {
  position: absolute;
  top: 13px;
  left: 13px;
  display: flex;
  width: 98px;
  height: 98px;
  align-items: flex-start;
  justify-content: center;
  padding-top: 28px;
  background: #ffffff;
  border-radius: 50%;
}

.half-gauge__value {
  color: #303846;
  font-size: 22px;
  font-weight: 600;
  line-height: 28px;
  font-variant-numeric: tabular-nums;
}

.half-gauge__value span {
  margin-left: 1px;
  color: #7b8494;
  font-size: 12px;
  font-weight: 400;
}
</style>
