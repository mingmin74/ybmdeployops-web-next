<template>
  <q-card
    flat
    bordered
    class="topology-card"
  >
    <q-card-section class="topology-card__header">
      <div class="row items-center justify-between">
        <div class="topology-card__title">{{ gettext('资源拓扑总览') }}</div>
      </div>
    </q-card-section>

    <q-separator />

    <q-card-section class="topology-card__body">
      <div class="topology-image">
        <q-img
          src="@/assets/overview/banner.png"
          :alt="gettext('数据中心资源拓扑')"
          fit="contain"
          class="topology-image__img"
        />
      </div>

      <div class="topology-stats">
        <div class="topology-stat">
          <div class="topology-stat__label">
            <q-icon
              name="computer"
              size="16px"
            />
            <span>{{ gettext('虚拟机') }}</span>
          </div>
          <div class="topology-stat__value">{{ vmStats.total }}</div>
          <div class="topology-stat__detail">
            <span class="topology-stat__status topology-stat__status--running">
              <i class="topology-stat__dot"></i>
              <span>{{ gettext('运行') }} {{ vmStats.running }}</span>
            </span>
            <span class="topology-stat__status topology-stat__status--stopped">
              <i class="topology-stat__dot"></i>
              <span>{{ gettext('停止') }} {{ vmStats.stopped }}</span>
            </span>
          </div>
        </div>

        <div class="topology-stat">
          <div class="topology-stat__label">
            <q-icon
              name="layers"
              size="16px"
            />
            <span>{{ gettext('LXC 容器') }}</span>
          </div>
          <div class="topology-stat__value">{{ ctStats.total }}</div>
          <div class="topology-stat__detail">
            <span class="topology-stat__status topology-stat__status--running">
              <i class="topology-stat__dot"></i>
              <span>{{ gettext('运行') }} {{ ctStats.running }}</span>
            </span>
            <span class="topology-stat__status topology-stat__status--stopped-lxc">
              <i class="topology-stat__dot"></i>
              <span>{{ gettext('停止') }} {{ ctStats.stopped }}</span>
            </span>
          </div>
        </div>

        <div class="topology-stat">
          <div class="topology-stat__label">
            <q-icon
              name="dns"
              size="16px"
            />
            <span>{{ gettext('节点') }}</span>
          </div>
          <div class="topology-stat__value">{{ nodeStats.total }}</div>
          <div class="topology-stat__detail">
            <span class="topology-stat__status topology-stat__status--running">
              <i class="topology-stat__dot"></i>
              <span>{{ gettext('在线') }} {{ nodeStats.online }}</span>
            </span>
            <span class="topology-stat__status topology-stat__status--offline">
              <i class="topology-stat__dot"></i>
              <span>{{ gettext('离线') }} {{ nodeStats.offline }}</span>
            </span>
          </div>
        </div>

        <div class="topology-stat">
          <div class="topology-stat__label">
            <q-icon
              name="storage"
              size="16px"
            />
            <span>{{ gettext('存储') }}</span>
          </div>
          <div class="topology-stat__value topology-stat__value--primary">
            {{ storageStats.total }}
          </div>
          <div class="topology-stat__detail topology-stat__detail--single">
            <span class="topology-stat__caption">{{ gettext('存储资源总数') }}</span>
          </div>
        </div>

        <div class="topology-stat">
          <div class="topology-stat__label">
            <q-icon
              name="account_tree"
              size="16px"
            />
            <span>{{ gettext('网络') }}</span>
          </div>
          <div class="topology-stat__value">{{ networkStats.total }}</div>
          <div class="topology-stat__detail topology-stat__detail--single">
            <span class="topology-stat__caption">{{ gettext('网络资源总数') }}</span>
          </div>
        </div>
      </div>
    </q-card-section>
  </q-card>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { PveRecord } from '@/api/resources';
import { useResourcesStore } from '@/stores/resources';
import { gettext } from '@/locale';
import { textValue } from '@/utils/pveFormat';

const resources = useResourcesStore();
resources.usePolling();

function hasStatus(record: PveRecord, ...statuses: string[]) {
  const current = textValue(record.status).toLowerCase();
  return statuses.some((status) => current === status.toLowerCase());
}

const vmStats = computed(() => {
  const rows = resources.records.filter((row) => textValue(row.type) === 'qemu' && !row.template);
  return {
    total: rows.length,
    running: rows.filter((row) => hasStatus(row, 'running')).length,
    stopped: rows.filter((row) => hasStatus(row, 'stopped', 'suspended', 'paused')).length,
  };
});

const ctStats = computed(() => {
  const rows = resources.records.filter((row) => textValue(row.type) === 'lxc');
  return {
    total: rows.length,
    running: rows.filter((row) => hasStatus(row, 'running')).length,
    stopped: rows.filter((row) => hasStatus(row, 'stopped', 'suspended', 'paused')).length,
  };
});

const nodeStats = computed(() => {
  const rows = resources.records.filter((row) => textValue(row.type) === 'node');
  return {
    total: rows.length,
    online: rows.filter((row) => hasStatus(row, 'online', 'available', 'active')).length,
    offline: rows.filter((row) => hasStatus(row, 'offline', 'unknown')).length,
  };
});

const storageStats = computed(() => {
  const seen = new Set<string>();
  resources.records.forEach((row) => {
    if (textValue(row.type) !== 'storage') return;
    const id =
      row.shared && textValue(row.storage) !== 'local'
        ? textValue(row.storage) || textValue(row.id)
        : textValue(row.id);
    if (!id) return;
    seen.add(id);
  });
  return { total: seen.size };
});

const networkStats = computed(() => {
  const rows = resources.records.filter((row) => textValue(row.type) === 'network');
  return { total: rows.length };
});
</script>

<style scoped>
.topology-card {
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

.topology-card__header {
  padding: 10px 14px;
}

.topology-card__title {
  color: #303846;
  font-size: 14px;
  font-weight: 600;
  line-height: 28px;
}

.topology-card__action {
  min-height: 28px;
  padding: 0 4px;
  font-size: 12px;
}

/* -------------------- body -------------------- */

.topology-card__body {
  display: flex;
  min-height: 0;
  flex: 1 1 auto;
  flex-direction: column;
  padding: 12px;
}

/* -------------------- topology image -------------------- */

.topology-image {
  width: 100%;
  overflow: hidden;
  border-radius: 6px;
}

.topology-image__img {
  width: 100%;
  height: 400px;
}

/* -------------------- statistics -------------------- */

.topology-stats {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  margin-top: auto;
  padding: 14px 8px;
  background: #fafcff;
  border: 1px solid #eef2f7;
  border-radius: 6px;
}

.topology-stat {
  position: relative;
  min-width: 0;
  padding: 0 12px;
  text-align: center;
}

.topology-stat + .topology-stat::before {
  content: '';
  position: absolute;
  top: 50%;
  left: 0;
  width: 1px;
  height: 38px;
  background: #e5eaf1;
  transform: translateY(-50%);
}

.topology-stat__label {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  color: #6b7280;
  font-size: 13px;
  font-weight: 400;
  line-height: 20px;
  white-space: nowrap;
}

.topology-stat__value {
  margin-top: 4px;
  color: #334155;
  font-size: 21px;
  font-weight: 500;
  line-height: 34px;
  font-variant-numeric: tabular-nums;
  letter-spacing: -0.2px;
}

.topology-stat__value--primary {
  color: #3b82f6;
}

.topology-stat__detail {
  display: flex;
  justify-content: center;
  gap: 12px;
  margin-top: 6px;
  font-size: 12px;
  line-height: 18px;
  white-space: nowrap;
}

.topology-stat__detail--single {
  gap: 0;
}

.topology-stat__status {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  color: #6b7280;
}

.topology-stat__dot {
  display: inline-block;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #d1d5db;
  flex-shrink: 0;
}

.topology-stat__status--running .topology-stat__dot {
  background: #34d399;
}

.topology-stat__status--running {
  color: #10b981;
}

.topology-stat__status--stopped .topology-stat__dot {
  background: #60a5fa;
}

.topology-stat__status--stopped {
  color: #3b82f6;
}

.topology-stat__status--stopped-lxc .topology-stat__dot {
  background: #9ca3af;
}

.topology-stat__status--stopped-lxc {
  color: #6b7280;
}

.topology-stat__status--offline .topology-stat__dot {
  background: #b0b8c4;
}

.topology-stat__status--offline {
  color: #6b7280;
}

.topology-stat__caption {
  color: #6b7280;
}

@media (max-width: 767px) {
  .topology-image__img {
    height: 300px;
  }

  .topology-stats {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 16px 0;
  }

  .topology-stat + .topology-stat::before {
    display: none;
  }
}
</style>
