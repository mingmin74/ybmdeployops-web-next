<template>
  <q-card flat bordered class="performance-card">
    <!-- 标题栏 -->
    <q-card-section class="performance-card__header">
      <div class="row items-center justify-between">
        <div class="performance-card__title">性能</div>

        <q-btn
          flat
          dense
          no-caps
          color="primary"
          label="近 24 小时"
          icon-right="chevron_right"
          class="performance-card__action"
        />
      </div>
    </q-card-section>

    <q-separator />

    <!-- 主体 -->
    <q-card-section class="performance-card__body">
      <div class="row">
        <!-- Ceph 使用率 -->
        <div class="col-3 usage-section">
          <div class="usage-section__title">使用率</div>

          <div class="half-gauge">
            <div class="half-gauge__track">
              <div class="half-gauge__progress"></div>

              <div class="half-gauge__center">
                <div class="half-gauge__value">55<span>%</span></div>
              </div>
            </div>
          </div>

          <div class="usage-section__label">Ceph 使用率</div>

          <div class="usage-section__caption">已使用 11 TB / 总容量 20 TB</div>
        </div>

        <!-- 性能指标 -->
        <div class="col-9 metrics-section">
          <div class="row q-col-gutter-sm q-row-gutter-sm">
            <!-- 读取带宽 -->
            <div class="col-6">
              <div class="metric-card">
                <div class="metric-card__header">
                  <span class="metric-card__label"> 读取带宽 </span>

                  <span class="metric-card__value"> 428 MB/s </span>
                </div>

                <div class="sparkline">
                  <svg viewBox="0 0 220 42" preserveAspectRatio="none" class="sparkline__svg">
                    <defs>
                      <linearGradient id="readGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stop-color="#1976d2" stop-opacity="0.16" />
                        <stop offset="100%" stop-color="#1976d2" stop-opacity="0" />
                      </linearGradient>
                    </defs>

                    <path
                      d="M0 32 L18 29 L36 31 L54 22 L72 25 L90 18 L108 21 L126 13 L144 17 L162 10 L180 15 L198 8 L220 11 L220 42 L0 42 Z"
                      fill="url(#readGradient)"
                    />

                    <path
                      d="M0 32 L18 29 L36 31 L54 22 L72 25 L90 18 L108 21 L126 13 L144 17 L162 10 L180 15 L198 8 L220 11"
                      fill="none"
                      stroke="#1976d2"
                      stroke-width="2"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                    />
                  </svg>
                </div>
              </div>
            </div>

            <!-- 写入带宽 -->
            <div class="col-6">
              <div class="metric-card">
                <div class="metric-card__header">
                  <span class="metric-card__label"> 写入带宽 </span>

                  <span class="metric-card__value"> 186 MB/s </span>
                </div>

                <div class="sparkline">
                  <svg viewBox="0 0 220 42" preserveAspectRatio="none" class="sparkline__svg">
                    <defs>
                      <linearGradient id="writeGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stop-color="#27a474" stop-opacity="0.16" />
                        <stop offset="100%" stop-color="#27a474" stop-opacity="0" />
                      </linearGradient>
                    </defs>

                    <path
                      d="M0 27 L18 30 L36 25 L54 28 L72 20 L90 24 L108 17 L126 22 L144 15 L162 19 L180 11 L198 16 L220 13 L220 42 L0 42 Z"
                      fill="url(#writeGradient)"
                    />

                    <path
                      d="M0 27 L18 30 L36 25 L54 28 L72 20 L90 24 L108 17 L126 22 L144 15 L162 19 L180 11 L198 16 L220 13"
                      fill="none"
                      stroke="#27a474"
                      stroke-width="2"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                    />
                  </svg>
                </div>
              </div>
            </div>

            <!-- 读取 IOPS -->
            <div class="col-6">
              <div class="metric-card">
                <div class="metric-card__header">
                  <span class="metric-card__label"> 读取 IOPS </span>

                  <span class="metric-card__value"> 3,842 </span>
                </div>

                <div class="sparkline">
                  <svg viewBox="0 0 220 42" preserveAspectRatio="none" class="sparkline__svg">
                    <defs>
                      <linearGradient id="readIopsGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stop-color="#6f73d9" stop-opacity="0.16" />
                        <stop offset="100%" stop-color="#6f73d9" stop-opacity="0" />
                      </linearGradient>
                    </defs>

                    <path
                      d="M0 31 L18 23 L36 26 L54 18 L72 22 L90 12 L108 19 L126 15 L144 20 L162 9 L180 13 L198 7 L220 12 L220 42 L0 42 Z"
                      fill="url(#readIopsGradient)"
                    />

                    <path
                      d="M0 31 L18 23 L36 26 L54 18 L72 22 L90 12 L108 19 L126 15 L144 20 L162 9 L180 13 L198 7 L220 12"
                      fill="none"
                      stroke="#6f73d9"
                      stroke-width="2"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                    />
                  </svg>
                </div>
              </div>
            </div>

            <!-- 写入 IOPS -->
            <div class="col-6">
              <div class="metric-card">
                <div class="metric-card__header">
                  <span class="metric-card__label"> 写入 IOPS </span>

                  <span class="metric-card__value"> 1,926 </span>
                </div>

                <div class="sparkline">
                  <svg viewBox="0 0 220 42" preserveAspectRatio="none" class="sparkline__svg">
                    <defs>
                      <linearGradient id="writeIopsGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stop-color="#e59b3a" stop-opacity="0.16" />
                        <stop offset="100%" stop-color="#e59b3a" stop-opacity="0" />
                      </linearGradient>
                    </defs>

                    <path
                      d="M0 29 L18 27 L36 30 L54 24 L72 26 L90 19 L108 22 L126 16 L144 18 L162 14 L180 17 L198 11 L220 15 L220 42 L0 42 Z"
                      fill="url(#writeIopsGradient)"
                    />

                    <path
                      d="M0 29 L18 27 L36 30 L54 24 L72 26 L90 19 L108 22 L126 16 L144 18 L162 14 L180 17 L198 11 L220 15"
                      fill="none"
                      stroke="#e59b3a"
                      stroke-width="2"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                    />
                  </svg>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </q-card-section>
  </q-card>
</template>

<script setup></script>

<style scoped>
.performance-card {
  width: 100%;
  background: #ffffff;
  border-color: #e5e7eb;
  border-radius: 8px;
  box-shadow: 0 1px 2px rgba(37, 99, 235, 0.04);
}

/* ---------------- header ---------------- */

.performance-card__header {
  padding: 10px 14px;
}

.performance-card__title {
  color: #303846;
  font-size: 14px;
  font-weight: 600;
  line-height: 28px;
}

.performance-card__action {
  min-height: 28px;
  padding: 0 4px;
  font-size: 12px;
}

/* ---------------- body ---------------- */

.performance-card__body {
  padding: 14px;
}

/* ---------------- usage ---------------- */

.usage-section {
  display: flex;
  min-width: 220px;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 4px 22px 6px 8px;
  border-right: 1px solid #edf0f3;
}

.usage-section__title {
  margin-bottom: 8px;
  color: #7b8494;
  font-size: 12px;
  font-weight: 500;
  line-height: 18px;
}

.usage-section__label {
  margin-top: 3px;
  color: #4c5564;
  font-size: 12px;
  font-weight: 500;
  line-height: 18px;
}

.usage-section__caption {
  margin-top: 2px;
  color: #929baa;
  font-size: 11px;
  line-height: 16px;
}

/* ---------------- half gauge ---------------- */

.half-gauge {
  position: relative;
  width: 140px;
  height: 82px;
  overflow: hidden;
}

.half-gauge__track {
  position: absolute;
  top: 0;
  left: 0;
  width: 140px;
  height: 140px;
  background: conic-gradient(from 270deg, #edf1f5 0deg, #edf1f5 180deg, transparent 180deg);
  border-radius: 50%;
}

.half-gauge__progress {
  position: absolute;
  inset: 0;
  background: conic-gradient(
    from 270deg,
    #1976d2 0deg,
    #1976d2 99deg,
    transparent 99deg,
    transparent 360deg
  );
  border-radius: 50%;
}

.half-gauge__center {
  position: absolute;
  top: 15px;
  left: 15px;
  display: flex;
  width: 110px;
  height: 110px;
  align-items: flex-start;
  justify-content: center;
  padding-top: 32px;
  background: #ffffff;
  border-radius: 50%;
}

.half-gauge__value {
  color: #303846;
  font-size: 25px;
  font-weight: 600;
  line-height: 30px;
  font-variant-numeric: tabular-nums;
}

.half-gauge__value span {
  margin-left: 2px;
  color: #7b8494;
  font-size: 12px;
  font-weight: 400;
}

/* ---------------- metrics ---------------- */

.metrics-section {
  padding-left: 18px;
}

.metric-card {
  height: 88px;
  overflow: hidden;
  padding: 9px 11px 0;
  background: #f8fafc;
  border: 1px solid #e8edf3;
  border-radius: 6px;
  transition:
    background-color 0.2s ease,
    border-color 0.2s ease;
}

.metric-card:hover {
  background: #f6f9fd;
  border-color: #d7e3f1;
}

.metric-card__header {
  display: flex;
  min-width: 0;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.metric-card__label {
  overflow: hidden;
  color: #7b8494;
  font-size: 11px;
  line-height: 18px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.metric-card__value {
  flex-shrink: 0;
  color: #303846;
  font-size: 13px;
  font-weight: 600;
  line-height: 18px;
  font-variant-numeric: tabular-nums;
}

/* ---------------- sparkline ---------------- */

.sparkline {
  width: 100%;
  height: 48px;
  margin-top: 2px;
}

.sparkline__svg {
  display: block;
  width: 100%;
  height: 100%;
}

/* ---------------- responsive ---------------- */

@media (max-width: 1023px) {
  .usage-section {
    min-width: 0;
  }
}

@media (max-width: 767px) {
  .performance-card__body > .row {
    display: block;
  }

  .usage-section,
  .metrics-section {
    width: 100%;
    max-width: 100%;
  }

  .usage-section {
    padding: 0 0 16px;
    border-right: 0;
    border-bottom: 1px solid #edf0f3;
  }

  .metrics-section {
    padding: 16px 0 0;
  }
}
</style>
