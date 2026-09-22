<template>
  <div class="row q-col-gutter-sm">
    <div class="col-6 col-md-4 col-xl-2">
      <q-card
        flat
        bordered
        class="kpi-card"
      >
        <q-card-section class="kpi-card__content">
          <div class="row items-center no-wrap">
            <div class="kpi-icon">
              <q-img
                src="@/assets/overview/01_cluster_status.png"
                fit="contain"
              />
            </div>

            <div class="kpi-main">
              <div class="kpi-label">{{ gettext('集群状态') }}</div>
              <div class="kpi-value">{{ clusterState.value }}</div>
            </div>
          </div>

          <div class="kpi-footer">
            <span
              class="status-dot"
              :class="clusterState.dotClass"
            ></span>
            <span class="ellipsis">{{ clusterState.footer }}</span>
          </div>
        </q-card-section>
      </q-card>
    </div>

    <div class="col-6 col-md-4 col-xl-2">
      <q-card
        flat
        bordered
        class="kpi-card"
      >
        <q-card-section class="kpi-card__content">
          <div class="row items-center no-wrap">
            <div class="kpi-icon">
              <q-img
                src="@/assets/overview/02_ceph_status.png"
                fit="contain"
              />
            </div>

            <div class="kpi-main">
              <div class="kpi-label">{{ gettext('Ceph 状态') }}</div>
              <div class="kpi-value">{{ cephStateCard.value }}</div>
            </div>
          </div>

          <div class="kpi-footer">
            <span
              class="status-dot"
              :class="cephStateCard.dotClass"
            ></span>
            <span class="ellipsis">{{ cephStateCard.footer }}</span>
          </div>
        </q-card-section>
      </q-card>
    </div>

    <div class="col-6 col-md-4 col-xl-2">
      <q-card
        flat
        bordered
        class="kpi-card"
      >
        <q-card-section class="kpi-card__content">
          <div class="row items-center no-wrap">
            <div class="kpi-icon">
              <q-img
                src="@/assets/overview/03_nodes_online.png"
                fit="contain"
              />
            </div>

            <div class="kpi-main">
              <div class="kpi-label">{{ gettext('节点在线数') }}</div>
              <div class="kpi-value">{{ nodeStats.online }} / {{ nodeStats.total }}</div>
            </div>
          </div>

          <div class="kpi-footer">
            <span
              class="status-dot"
              :class="nodeStats.offline === 0 ? 'status-dot--success' : 'status-dot--muted'"
            ></span>
            <span class="ellipsis">
              {{ gettext('离线') }} {{ nodeStats.offline }} · {{ gettext('在线率') }}
              {{ nodeStats.availability }}
            </span>
          </div>
        </q-card-section>
      </q-card>
    </div>

    <div class="col-6 col-md-4 col-xl-2">
      <q-card
        flat
        bordered
        class="kpi-card"
      >
        <q-card-section class="kpi-card__content">
          <div class="row items-center no-wrap">
            <div class="kpi-icon">
              <q-img
                src="@/assets/overview/04_virtual_machine.png"
                fit="contain"
              />
            </div>

            <div class="kpi-main">
              <div class="kpi-label">{{ gettext('虚拟机') }}</div>
              <div class="kpi-value">{{ vmStats.total }}</div>
            </div>
          </div>

          <div class="kpi-footer">
            <span class="status-dot status-dot--muted"></span>
            <span class="ellipsis">
              {{ gettext('运行中') }} {{ vmStats.running }} · {{ gettext('已停止') }}
              {{ vmStats.stopped }}
            </span>
          </div>
        </q-card-section>
      </q-card>
    </div>

    <div class="col-6 col-md-4 col-xl-2">
      <q-card
        flat
        bordered
        class="kpi-card"
      >
        <q-card-section class="kpi-card__content">
          <div class="row items-center no-wrap">
            <div class="kpi-icon">
              <q-img
                src="@/assets/overview/05_lxc_container.png"
                fit="contain"
              />
            </div>

            <div class="kpi-main">
              <div class="kpi-label">{{ gettext('LXC 容器') }}</div>
              <div class="kpi-value">{{ ctStats.total }}</div>
            </div>
          </div>

          <div class="kpi-footer">
            <span class="status-dot status-dot--muted"></span>
            <span class="ellipsis">
              {{ gettext('运行中') }} {{ ctStats.running }} · {{ gettext('已停止') }}
              {{ ctStats.stopped }}
            </span>
          </div>
        </q-card-section>
      </q-card>
    </div>

    <div class="col-6 col-md-4 col-xl-2">
      <q-card
        flat
        bordered
        class="kpi-card"
      >
        <q-card-section class="kpi-card__content">
          <div class="row items-center no-wrap">
            <div class="kpi-icon">
              <q-img
                src="@/assets/overview/06_osd_total.png"
                fit="contain"
              />
            </div>

            <div class="kpi-main">
              <div class="kpi-label">{{ gettext('OSD 总数') }}</div>
              <div class="kpi-value">{{ osdStats.total }}</div>
            </div>
          </div>

          <div class="kpi-footer">
            <span
              class="status-dot"
              :class="osdStats.alerting === 0 ? 'status-dot--success' : 'status-dot--muted'"
            ></span>
            <span class="ellipsis">
              {{ gettext('在线') }} {{ osdStats.online }} · {{ gettext('告警') }}
              {{ osdStats.alerting }}
            </span>
          </div>
        </q-card-section>
      </q-card>
    </div>
  </div>
</template>
<script setup lang="ts">
import { computed, onBeforeUnmount, shallowRef, watch } from 'vue';
import type { PveRecord } from '@/api/resources';
import { useResourcesStore } from '@/stores/resources';
import { getCephMetadata, getCephStatus } from '@/api/ceph';
import { gettext } from '@/locale';
import { textValue } from '@/utils/pveFormat';

type WarningRow = { id: string; severity: string; summary: string };

const props = defineProps<{ node?: string; cephAvailable?: boolean }>();
const node = props.node || 'localhost';
const cephAvailable = computed(() => props.cephAvailable ?? true);
const resources = useResourcesStore();
resources.usePolling();

function hasStatus(record: PveRecord, ...statuses: string[]) {
  const current = textValue(record.status).toLowerCase();
  return statuses.some((status) => current === status.toLowerCase());
}

const nodeStats = computed(() => {
  const rows = resources.records.filter((row) => textValue(row.type) === 'node');
  const online = rows.filter((row) => hasStatus(row, 'online', 'available', 'active')).length;
  const offline = rows.length - online;
  const availability =
    rows.length === 0 ? '0%' : `${Math.min(100, Math.round((online / rows.length) * 100))}%`;
  return { total: rows.length, online, offline, availability };
});

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

const status = shallowRef<PveRecord>({});
const metadata = shallowRef<PveRecord>({});

const health = computed(() =>
  textValue(
    (status.value.health as PveRecord | undefined)?.status ||
      status.value.healthstatus ||
      status.value.health,
    'HEALTH_UNKNOWN'
  ).toUpperCase()
);
const cephVersion = computed(() => {
  const nodes = (metadata.value.node || {}) as PveRecord;
  return Object.values(nodes).reduce<string>((latest, item) => {
    const value = item as PveRecord;
    const version = textValue((value.version as PveRecord | undefined)?.str);
    return version > latest ? version : latest;
  }, '');
});

const clusterName = computed(() => {
  const byFsid = textValue(status.value.fsid);
  const fromConfig =
    textValue((status.value.config as PveRecord | undefined)?.cluster_name) ||
    textValue((metadata.value.config as PveRecord | undefined)?.cluster_name) ||
    textValue((metadata.value.config as PveRecord | undefined)?.fsid_name) ||
    textValue(status.value.cluster_name) ||
    textValue(metadata.value.cluster_name);
  const firstNode = Object.values((metadata.value.node || {}) as PveRecord)[0] as
    PveRecord | undefined;
  const fromNode =
    textValue(firstNode?.cluster) ||
    textValue(firstNode?.['cluster-name']) ||
    textValue(
      ((firstNode?.config as PveRecord | undefined)?.cluster as PveRecord | undefined)?.name
    );
  return fromConfig || fromNode || byFsid || gettext('Ceph Cluster');
});

const monQuorum = computed(() => {
  const names = status.value.quorum_names;
  const quorumList = status.value.quorum;
  const mons = Array.isArray(metadata.value.mon)
    ? (metadata.value.mon as PveRecord[])
    : Object.values((metadata.value.mon || {}) as PveRecord);
  const namesArray = Array.isArray(names)
    ? (names as string[]).filter(Boolean)
    : textValue(names).split(',').filter(Boolean);
  if (mons.length > 0) {
    const required = Math.floor(mons.length / 2) + 1;
    return {
      ok: namesArray.length >= required,
      detail: `${namesArray.length}/${mons.length}`,
    };
  }
  if (Array.isArray(quorumList)) {
    return { ok: quorumList.length > 0, detail: `${quorumList.length}` };
  }
  return {
    ok: Boolean(namesArray.length),
    detail: namesArray.length ? `${namesArray.length}` : '0',
  };
});

const clusterState = computed(() => {
  const badCount = warnings.value.filter((w) => ['warning', 'error'].includes(w.level)).length;
  const hasMonErr = warnings.value.some((w) => w.id.startsWith('MON_'));
  const value =
    !monQuorum.value.ok || hasMonErr || warnings.value.some((w) => w.level === 'error')
      ? gettext('异常')
      : badCount > 0
        ? gettext('警告')
        : gettext('健康');
  const dotClass =
    !monQuorum.value.ok || warnings.value.some((w) => w.level === 'error')
      ? 'status-dot--error'
      : badCount > 0
        ? 'status-dot--warning'
        : 'status-dot--success';
  const footer = `${gettext('集群')} ${clusterName.value} · ${gettext('法定人数')}: ${monQuorum.value.detail}`;
  return { value, dotClass, footer };
});

const warnings = computed<(WarningRow & { level: 'ok' | 'warning' | 'error' | 'muted' })[]>(() => {
  const checks = ((status.value.health as PveRecord | undefined)?.checks || {}) as PveRecord;
  return Object.entries(checks)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([id, value]) => {
      const check = value as PveRecord;
      const severity = textValue(check.severity, 'HEALTH_UNKNOWN').toUpperCase();
      const level = severity.includes('ERR')
        ? 'error'
        : severity.includes('WARN')
          ? 'warning'
          : severity.includes('OK')
            ? 'ok'
            : 'muted';
      return {
        id,
        severity,
        summary: textValue((check.summary as PveRecord)?.message, id),
        level,
      };
    });
});

const cephStateCard = computed(() => {
  const value = health.value.includes('ERR')
    ? gettext('异常')
    : health.value.includes('WARN')
      ? gettext('警告')
      : health.value.includes('OK')
        ? gettext('健康')
        : gettext('未知');
  const dotClass = health.value.includes('ERR')
    ? 'status-dot--error'
    : health.value.includes('WARN')
      ? 'status-dot--warning'
      : health.value.includes('OK')
        ? 'status-dot--success'
        : 'status-dot--muted';
  const version = cephVersion.value || '-';
  return {
    value,
    dotClass,
    footer: `${health.value.includes('UNKNOWN') ? 'HEALTH_UNKNOWN' : health.value} · ${gettext('版本')} ${version}`,
  };
});

const osdmap = computed(
  () =>
    (((status.value.osdmap as PveRecord | undefined)?.osdmap as PveRecord | undefined) ||
      status.value.osdmap ||
      {}) as PveRecord
);

const osdStatus = computed(() => {
  const total = Number(osdmap.value.num_osds) || 0;
  const up = Number(osdmap.value.num_up_osds) || 0;
  const inside = Number(osdmap.value.num_in_osds) || 0;
  const downInRaw =
    warnings.value
      .find((warning) => warning.id === 'OSD_DOWN')
      ?.summary.match(/(\d+) osds down/)?.[1] || '0';
  const down = total - up;
  const downInCount = Number(downInRaw);
  const upIn = Math.max(0, inside - downInCount);
  return {
    total,
    upIn,
    upOut: Math.max(0, up - upIn),
    downIn: downInCount,
    downOut: Math.max(0, down - downInCount),
  };
});

const osdStats = computed(() => {
  const alertCount = warnings.value.filter(
    (w) => w.level === 'error' || w.level === 'warning'
  ).length;
  const alerting = Math.max(0, osdStatus.value.downIn + osdStatus.value.downOut) + alertCount;
  return {
    total: osdStatus.value.total,
    online: osdStatus.value.upIn + osdStatus.value.upOut,
    alerting,
  };
});

let statusTimer: ReturnType<typeof setInterval> | undefined;
let metadataTimer: ReturnType<typeof setInterval> | undefined;
async function refreshStatus() {
  try {
    const response = await getCephStatus(node);
    status.value = response.data || {};
  } catch {
    // Keep latest snapshot
  }
}
async function refreshMetadata() {
  try {
    const response = await getCephMetadata(node);
    metadata.value = response.data || {};
  } catch {
    // Keep latest snapshot
  }
}
async function refreshCeph() {
  await Promise.allSettled([refreshStatus(), refreshMetadata()]);
}

function stopCephPolling() {
  if (statusTimer) clearInterval(statusTimer);
  if (metadataTimer) clearInterval(metadataTimer);
  statusTimer = undefined;
  metadataTimer = undefined;
}

function startCephPolling() {
  stopCephPolling();
  void refreshCeph();
  statusTimer = setInterval(() => void refreshStatus(), 5000);
  metadataTimer = setInterval(() => void refreshMetadata(), 15000);
}

watch(
  cephAvailable,
  (available) => {
    if (available) startCephPolling();
    else stopCephPolling();
  },
  { immediate: true }
);

onBeforeUnmount(() => {
  stopCephPolling();
});
</script>
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
  margin-right: 12px;
}

.kpi-icon :deep(.q-img) {
  width: 100%;
  height: 100%;
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

.status-dot--warning {
  background: #e59b3a;
}

.status-dot--error {
  background: #e35d6a;
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
