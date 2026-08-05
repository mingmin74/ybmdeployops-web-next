<template>
  <q-card flat bordered class="services-card">
    <!-- 标题 -->
    <q-card-section class="services-card__header">
      <div class="services-card__title">服务</div>
    </q-card-section>

    <q-separator />

    <!-- 主体 -->
    <q-card-section class="services-card__body">
      <div class="row">
        <!-- MON -->
        <div class="col-4 service-group">
          <div class="service-group__title">MON</div>

          <div class="service-hosts">
            <q-chip square dense class="service-chip">
              <span class="service-chip__host">node-01</span>

              <q-icon name="check" size="14px" class="service-chip__icon" />
            </q-chip>

            <q-chip square dense class="service-chip">
              <span class="service-chip__host">node-02</span>

              <q-icon name="check" size="14px" class="service-chip__icon" />
            </q-chip>

            <q-chip square dense class="service-chip">
              <span class="service-chip__host">node-03</span>

              <q-icon name="check" size="14px" class="service-chip__icon" />
            </q-chip>
          </div>
        </div>

        <!-- MGR -->
        <div class="col-4 service-group service-group--border">
          <div class="service-group__title">MGR</div>

          <div class="service-hosts">
            <q-chip square dense class="service-chip">
              <span class="service-chip__host">node-01</span>

              <q-icon name="check" size="14px" class="service-chip__icon" />
            </q-chip>

            <q-chip square dense class="service-chip">
              <span class="service-chip__host">node-02</span>

              <q-icon name="check" size="14px" class="service-chip__icon" />
            </q-chip>
          </div>
        </div>

        <!-- MDS -->
        <div class="col-4 service-group">
          <div class="service-group__title">MDS</div>

          <div class="service-hosts">
            <q-chip square dense class="service-chip">
              <span class="service-chip__host">node-01</span>

              <q-icon name="check" size="14px" class="service-chip__icon" />
            </q-chip>

            <q-chip square dense class="service-chip">
              <span class="service-chip__host">node-03</span>

              <q-icon name="check" size="14px" class="service-chip__icon" />
            </q-chip>
          </div>
        </div>
      </div>
    </q-card-section>
  </q-card>
</template>

<script setup></script>

<style scoped>
.services-card {
  width: 100%;
  height: 100%;
  background: #ffffff;
  border-color: #e5e7eb;
  border-radius: 8px;
  box-shadow: 0 1px 2px rgba(37, 99, 235, 0.04);
}

/* ---------------- header ---------------- */

.services-card__header {
  padding: 10px 14px;
}

.services-card__title {
  color: #303846;
  font-size: 14px;
  font-weight: 600;
  line-height: 28px;
}

/* ---------------- body ---------------- */

.services-card__body {
  padding: 14px;
}

.service-group {
  min-width: 0;
  min-height: 112px;
  padding: 0 16px;
}

.service-group--border {
  border-right: 1px solid #edf0f3;
  border-left: 1px solid #edf0f3;
}

.service-group__title {
  margin-bottom: 12px;
  color: #7b8494;
  font-size: 12px;
  font-weight: 500;
  line-height: 18px;
  text-align: center;
}

/* ---------------- hosts ---------------- */

.service-hosts {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 7px;
}

/* ---------------- chip ---------------- */

.service-chip {
  min-height: 28px;
  margin: 0;
  padding: 0 8px;
  color: #3e4653;
  background: #f7f9fc;
  border: 1px solid #e5e9ef;
  border-radius: 5px;
  box-shadow: none;
}

.service-chip:hover {
  background: #f3f7fc;
  border-color: #d5e2f2;
}

.service-chip__host {
  color: #3e4653;
  font-family: 'Roboto Mono', 'SFMono-Regular', Consolas, monospace;
  font-size: 11px;
  font-variant-numeric: tabular-nums;
}

.service-chip__icon {
  margin-left: 5px;
  color: #27a474;
}
</style>
