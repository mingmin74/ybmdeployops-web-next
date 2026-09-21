<template>
  <q-card flat bordered class="services-card">
    <q-card-section class="services-card__header">
      <div class="services-card__title">{{ gettext('服务') }}</div>
    </q-card-section>

    <q-separator />

    <q-card-section class="services-card__body">
      <div class="row">
        <div
          v-for="(group, idx) in serviceGroups"
          :key="group.type"
          class="col-4 service-group"
          :class="{ 'service-group--border': idx === 1 }"
        >
          <div class="service-group__title">
            {{ group.type === 'mon' ? 'MON' : group.type === 'mgr' ? 'MGR' : 'MDS' }}
          </div>

          <div
            v-if="group.items.length"
            class="service-hosts"
          >
            <q-chip
              v-for="service in group.items"
              :key="service.id"
              square
              dense
              class="service-chip"
            >
              <span class="service-chip__host">{{ service.host }}</span>

              <q-icon
                :name="serviceIcon(service.color)"
                size="14px"
                class="service-chip__icon"
                :color="chipIconColor(service.color)"
              />
              <q-tooltip class="service-chip__tooltip">
                <div>{{ gettext('Name') }}: {{ service.name }}</div>
                <div>{{ gettext('Host') }}: {{ service.host }}</div>
                <div>{{ gettext('Address') }}: {{ service.address }}</div>
                <div>{{ gettext('Version') }}: {{ service.version }}</div>
                <div>{{ gettext('Status') }}: {{ service.status }}</div>
              </q-tooltip>
            </q-chip>
          </div>
          <div
            v-else
            class="service-hosts"
          >
            <div class="service-empty">-</div>
          </div>
        </div>
      </div>
    </q-card-section>
  </q-card>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, shallowRef } from 'vue';
import type { PveRecord } from '@/api/resources';
import { getCephStatus, getCephMetadata } from '@/api/ceph';
import { gettext } from '@/locale';
import { textValue } from '@/utils/pveFormat';

type ServiceRow = {
  id: string;
  type: string;
  name: string;
  host: string;
  address: string;
  version: string;
  status: string;
  color: string;
};

const status = shallowRef<PveRecord>({});
const metadata = shallowRef<PveRecord>({});
const { node = 'localhost' } = defineProps<{ node?: string }>();
let statusTimer: ReturnType<typeof setInterval> | undefined;
let metadataTimer: ReturnType<typeof setInterval> | undefined;

const services = computed<ServiceRow[]>(() =>
  ['mon', 'mgr', 'mds']
    .flatMap((type) => {
      const entries = metadata.value[type];
      const values = Array.isArray(entries)
        ? entries
        : Object.entries((entries || {}) as PveRecord).map(([id, item]) => ({
            id,
            ...(item as PveRecord),
          }));
      return values.map((item) => {
        const service = item as PveRecord;
        const id =
          textValue(service.id) ||
          `${textValue(service.name)}@${textValue(service.hostname || service.host)}`;
        const [nameFromId, hostFromId] = id.split('@');
        const name = textValue(service.name, nameFromId || '-');
        const host = textValue(service.hostname || service.host, hostFromId || '-');
        const active =
          type === 'mgr' &&
          textValue((status.value.mgrmap as PveRecord | undefined)?.active_name) === name;
        const standby =
          type === 'mgr' &&
          Array.isArray((status.value.mgrmap as PveRecord | undefined)?.standbys) &&
          ((status.value.mgrmap as PveRecord).standbys as PveRecord[]).some(
            (mgr) => textValue(mgr.name) === name
          );
        const address = textValue(service.addr || service.addrs, gettext('Unknown'));
        const metadataNode = ((metadata.value.node as PveRecord | undefined)?.[host] ||
          {}) as PveRecord;
        const version = cephVersionText(
          service.version ||
            service.ceph_version ||
            metadataNode.version ||
            (metadata.value.version as PveRecord | undefined)?.[host],
          '-'
        );
        const health = serviceHealth(type, name, service, version, address, active, standby);
        return {
          id: `${type}-${id}`,
          type,
          name,
          host,
          address,
          version,
          status: health.status,
          color: health.color,
        };
      });
    })
    .sort((a, b) => a.type.localeCompare(b.type) || a.host.localeCompare(b.host))
);
const serviceGroups = computed(() =>
  [
    { type: 'mon', title: gettext('Monitors') },
    { type: 'mgr', title: gettext('Managers') },
    { type: 'mds', title: gettext('Metadata Servers') },
  ].map((group) => ({
    ...group,
    items: services.value.filter((service) => service.type === group.type),
  }))
);

function statusColor(value: string) {
  const normalized = value.toUpperCase();
  if (normalized.includes('ERR') || normalized.includes('CRIT') || normalized.includes('DOWN'))
    return 'negative';
  if (normalized.includes('WARN') || normalized.includes('OUT') || normalized.includes('UNKNOWN'))
    return 'warning';
  if (normalized.includes('OK') || normalized === 'ACTIVE') return 'positive';
  return 'grey-7';
}

function serviceIcon(color: string) {
  if (color === 'positive') return 'check';
  if (color === 'warning') return 'warning';
  if (color === 'negative') return 'error';
  return 'help';
}

function chipIconColor(color: string) {
  if (color === 'positive') return '#27a474';
  if (color === 'warning') return '#f2a93b';
  if (color === 'negative') return '#c62828';
  return '#929baa';
}

function cephVersionText(value: unknown, fallback: string) {
  if (!value || typeof value !== 'object') return textValue(value, fallback);
  const version = value as PveRecord;
  return textValue(
    version.str || version.version || version.ceph_version || version.ceph_version_short,
    fallback
  );
}

function serviceHealth(
  type: string,
  name: string,
  service: PveRecord,
  version: string,
  address: string,
  active: boolean,
  standby: boolean
) {
  const unknownAddress = gettext('Unknown');
  if (
    (textValue(service.service) && version === '-') ||
    (version === '-' && address === unknownAddress)
  ) {
    return { status: gettext('Unknown'), color: 'grey-7' };
  }

  if (type === 'mon') {
    const quorumNames = status.value.quorum_names;
    let color = Array.isArray(quorumNames) && !quorumNames.includes(name) ? 'negative' : 'positive';
    const checks = ((status.value.health as PveRecord | undefined)?.checks || {}) as PveRecord;
    Object.entries(checks).forEach(([id, value]) => {
      if (!id.startsWith('MON_')) return;
      const details = (value as PveRecord).detail;
      if (
        Array.isArray(details) &&
        details.some((detail) =>
          new RegExp(`mon\\.${name}(?:\\b|$)`).test(textValue((detail as PveRecord).message))
        )
      ) {
        const warningColor = statusColor(textValue((value as PveRecord).severity));
        if (warningColor === 'negative' || (warningColor === 'warning' && color === 'positive')) {
          color = warningColor;
        }
      }
    });
    return { status: color === 'positive' ? gettext('active') : gettext('Unknown'), color };
  }

  if (type === 'mgr') {
    if (active) return { status: gettext('active'), color: 'positive' };
    if (standby) return { status: gettext('standby'), color: 'positive' };
    if (status.value.mgrmap) return { status: gettext('Unknown'), color: 'warning' };
  }

  return { status: gettext('active'), color: 'positive' };
}

async function refreshStatus() {
  const response = await getCephStatus(node);
  status.value = response.data || {};
}
async function refreshMetadata() {
  const response = await getCephMetadata(node);
  metadata.value = response.data || {};
}
async function refreshData() {
  await Promise.allSettled([refreshStatus(), refreshMetadata()]);
}

onMounted(() => {
  void refreshData();
  statusTimer = setInterval(() => void refreshStatus(), 5000);
  metadataTimer = setInterval(() => void refreshMetadata(), 15000);
});

onUnmounted(() => {
  if (statusTimer) clearInterval(statusTimer);
  if (metadataTimer) clearInterval(metadataTimer);
});
</script>

<style scoped>
.services-card {
  width: 100%;
  height: 100%;
  background: #ffffff;
  border-color: #e5e7eb;
  border-radius: 8px;
  box-shadow: 0 1px 2px rgba(37, 99, 235, 0.04);
}

.services-card__header {
  padding: 10px 14px;
}

.services-card__title {
  color: #303846;
  font-size: 14px;
  font-weight: 600;
  line-height: 28px;
}

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

.service-hosts {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 7px;
}

.service-empty {
  color: #b0b6bf;
  font-size: 13px;
  line-height: 28px;
}

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

.service-chip__tooltip {
  font-size: 11px;
  line-height: 16px;
}
</style>
