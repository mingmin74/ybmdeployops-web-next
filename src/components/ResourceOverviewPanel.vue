<script setup lang="ts">
import type { QTableColumn } from 'quasar';
import { computed, onMounted, shallowRef, watch } from 'vue';
import LineMetricChart from '@/components/LineMetricChart.vue';
import HostNotesPanel from '@/components/HostNotesPanel.vue';
import MetricSparkline from '@/components/MetricSparkline.vue';
import NodeSelectTable from '@/components/NodeSelectTable.vue';
import UsageProgress from '@/components/UsageProgress.vue';
import type { PveRecord } from '@/api/resources';
import { getClusterResources } from '@/api/resources';
import {
  getNodeRrd,
  getNodeStatus,
  getNodeRepositories,
  getNodeSubscription,
  getStorageRrd,
  getVmCurrent,
  getVmRrd,
} from '@/api/overview';
import { gettext } from '@/locale';
import { formatBytes, textValue, usedPercent } from '@/utils/pveFormat';
import { resourceProgressColor } from '@/utils/format';
import hostOverviewIllustration from '@/assets/overview/left_icon1.png';

const props = defineProps<{
  mode: 'computer' | 'host' | 'storage';
  node?: string;
  hideNodeSelector?: boolean;
}>();

const loading = shallowRef(false);
const selectedId = shallowRef('');
const resources = shallowRef<PveRecord[]>([]);
const current = shallowRef<PveRecord>({});
const rrdRows = shallowRef<PveRecord[]>([]);
const standardRepositories = shallowRef<PveRecord[]>([]);
const subscriptionActive = shallowRef<boolean | undefined>(undefined);
const rrdTimeframe = shallowRef<'hour' | 'day' | 'week' | 'month' | 'year'>('hour');
const rrdConsolidation = shallowRef<'AVERAGE' | 'MAX'>('AVERAGE');

const modeType = computed(() =>
  props.mode === 'computer' ? 'vm' : props.mode === 'host' ? 'node' : 'storage'
);
const title = computed(() =>
  props.mode === 'computer'
    ? gettext('Computer')
    : props.mode === 'host'
    ? gettext('Host')
    : gettext('Storage')
);

const options = computed(() =>
  resources.value.map((item) => ({
    label:
      props.mode === 'computer'
        ? `${textValue(item.vmid)} / ${textValue(item.name || item.type, '-')}`
        : textValue(item.node || item.storage || item.id),
    value: resourceId(item),
  }))
);

const selectedResource = computed(() => {
  if (props.mode === 'host' && props.node) {
    return (
      resources.value.find((item) => textValue(item.node) === props.node) || { node: props.node }
    );
  }

  return (
    resources.value.find((item) => resourceId(item) === selectedId.value) ||
    resources.value[0] ||
    {}
  );
});
const hostSelectedNode = computed({
  get: () => textValue(selectedResource.value.node),
  set: (node: string) => {
    const resource = resources.value.find((item) => textValue(item.node) === node);
    selectedId.value = resource ? resourceId(resource) : '';
  },
});
const rrdConsolidationOptions = computed(() => [
  { label: gettext('Average'), value: 'AVERAGE' },
  { label: gettext('Maximum'), value: 'MAX' },
]);
const rrdTimeframeOptions = computed(() => [
  { label: gettext('Hour'), value: 'hour' },
  { label: gettext('Day'), value: 'day' },
  { label: gettext('Week'), value: 'week' },
  { label: gettext('Month'), value: 'month' },
  { label: gettext('Year'), value: 'year' },
]);

const statRows = computed(() => [
  {
    label: gettext('Name'),
    value: textValue(
      selectedResource.value.name ||
        selectedResource.value.node ||
        selectedResource.value.storage ||
        selectedResource.value.id,
      '-'
    ),
  },
  {
    label: gettext('Status'),
    value: textValue(current.value.status || selectedResource.value.status, '-'),
  },
  { label: gettext('Node'), value: textValue(selectedResource.value.node, '-') },
  { label: gettext('Uptime'), value: formatUptime(current.value.uptime) },
  {
    label: gettext('CPU Usage'),
    value: `${usedPercent(Number(current.value.cpu || selectedResource.value.cpu), 1).toFixed(2)}%`,
  },
  {
    label: gettext('Memory Usage'),
    value: `${formatBytes(current.value.mem as number)} / ${formatBytes(
      (current.value.maxmem || selectedResource.value.maxmem) as number
    )}`,
  },
  {
    label: gettext('Disk Usage'),
    value: `${formatBytes(
      (current.value.disk || selectedResource.value.disk) as number
    )} / ${formatBytes((current.value.maxdisk || selectedResource.value.maxdisk) as number)}`,
  },
]);

const cpuValues = computed(() => rrdRows.value.map((item) => Number(item.cpu || 0) * 100));
const memoryValues = computed(() => rrdRows.value.map((item) => item.mem as number));
const networkValues = computed(() =>
  rrdRows.value.map((item) => Number(item.netin || 0) + Number(item.netout || 0))
);
const diskValues = computed(() =>
  rrdRows.value.map((item) => Number(item.diskread || 0) + Number(item.diskwrite || 0))
);
const hostMemory = computed(() => (current.value.memory || {}) as PveRecord);
const hostRootfs = computed(() => (current.value.rootfs || {}) as PveRecord);
const hostSwap = computed(() => (current.value.swap || {}) as PveRecord);
const hostCpuInfo = computed(() => (current.value.cpuinfo || {}) as PveRecord);
const hostCpuPercent = computed(() => usedPercent(Number(current.value.cpu), 1));
const hostIoDelayPercent = computed(() => usedPercent(Number(current.value.wait), 1));
const hostMemoryPercent = computed(() =>
  usedPercent(Number(hostMemory.value.used), Number(hostMemory.value.total))
);
const hostDiskPercent = computed(() =>
  usedPercent(Number(hostRootfs.value.used), Number(hostRootfs.value.total))
);
const hostSwapPercent = computed(() =>
  usedPercent(Number(hostSwap.value.used), Number(hostSwap.value.total))
);
const hostCpuDescription = computed(() => {
  const cpus = textValue(hostCpuInfo.value.cpus, textValue(selectedResource.value.maxcpu, '-'));
  const model = textValue(hostCpuInfo.value.model, '-');
  const sockets = textValue(hostCpuInfo.value.sockets, '-');
  return `${cpus} x ${model} (${sockets} ${gettext('CPU Socket(s)')})`;
});
const hostKernelVersion = computed(() => {
  const kernel = current.value['current-kernel'] as PveRecord | undefined;
  if (!kernel) return textValue(current.value.kversion, '-');
  const sysname = textValue(kernel.sysname, 'Linux');
  const release = textValue(kernel.release, '-');
  const buildDate = textValue(kernel.version, '').match(/\((.+)\)\s*$/)?.[1];
  return buildDate ? `${sysname} ${release} (${buildDate})` : `${sysname} ${release}`;
});
const hostBootMode = computed(() => {
  const bootInfo = current.value['boot-info'] as PveRecord | undefined;
  if (bootInfo?.mode === 'legacy-bios') return gettext('Legacy BIOS');
  if (bootInfo?.mode === 'efi')
    return bootInfo.secureboot ? `${gettext('EFI')} (${gettext('Secure Boot')})` : gettext('EFI');
  return '-';
});
const repositoryStatus = computed(() => {
  if (subscriptionActive.value === undefined || !standardRepositories.value.length)
    return 'unknown';

  const getRepositoryStatus = (handle: string) =>
    Boolean(standardRepositories.value.find((repository) => repository.handle === handle)?.status);
  const enterpriseRepository = getRepositoryStatus('enterprise');
  const noSubscriptionRepository = getRepositoryStatus('no-subscription');
  const testRepository = getRepositoryStatus('test');

  if (noSubscriptionRepository || testRepository) return 'non-production';
  if (subscriptionActive.value && enterpriseRepository) return 'ok';
  if (!subscriptionActive.value && enterpriseRepository) return 'no-subscription';
  if (!enterpriseRepository || !noSubscriptionRepository || !testRepository) return 'no-repository';
  return 'unknown';
});
const repositoryStatusInfo = computed(() => {
  switch (repositoryStatus.value) {
    case 'ok':
      return {
        value: gettext('Production-ready Enterprise repository enabled'),
        className: 'good',
      };
    case 'no-subscription':
      return {
        value: gettext('Enterprise repository needs valid subscription'),
        className: 'warning',
      };
    case 'non-production':
      return {
        value: gettext('Non production-ready repository enabled!'),
        className: 'warning',
      };
    case 'no-repository':
      return {
        value: gettext('No Proxmox VE repository enabled!'),
        className: 'critical',
      };
    default:
      return { value: '-', className: 'faded' };
  }
});
const hostInfoRows = computed<Array<{ label: string; value: string; className?: string }>>(() => [
  { label: gettext('CPU(s)'), value: hostCpuDescription.value },
  { label: gettext('Kernel Version'), value: hostKernelVersion.value },
  { label: gettext('Boot Mode'), value: hostBootMode.value },
  { label: gettext('Manager Version'), value: textValue(current.value.pveversion, '-') },
  {
    label: gettext('Load Average'),
    value: Array.isArray(current.value.loadavg)
      ? current.value.loadavg.join(',')
      : textValue(current.value.loadavg, '-'),
  },
  {
    label: gettext('KSM Sharing'),
    value: formatBytes(Number((current.value.ksm as PveRecord | undefined)?.shared || 0)),
  },
  /* {
    label: gettext('Repository Status'),
    value: repositoryStatusInfo.value.value,
    className: repositoryStatusInfo.value.className,
  }, */
]);
const hostBasicTitle = computed(
  () =>
    `${textValue(selectedResource.value.node || selectedResource.value.name, '-')} (${formatUptime(
      current.value.uptime
    )})`
);
const nodeStatus = computed(() =>
  textValue(current.value.status || selectedResource.value.status, 'unknown').toLowerCase()
);
const nodeStatusLabel = computed(() => {
  if (nodeStatus.value === 'online') return gettext('Online');
  if (nodeStatus.value === 'offline') return gettext('Offline');
  return nodeStatus.value;
});
const hostLoadAverageValues = computed(() => {
  const values = Array.isArray(current.value.loadavg) ? current.value.loadavg : [];
  return [
    { label: gettext('Last 1 Minute'), value: textValue(values[0], '-') },
    { label: gettext('Last 5 Minutes'), value: textValue(values[1], '-') },
    { label: gettext('Last 15 Minutes'), value: textValue(values[2], '-') },
  ];
});
const hostResourceCards = computed(() => [
  {
    title: gettext('CPU Usage'),
    value: `${hostCpuPercent.value.toFixed(2)}%`,
    meta: `${textValue(
      hostCpuInfo.value.cpus,
      textValue(selectedResource.value.maxcpu, '-')
    )} CPU(s)`,
    percent: hostCpuPercent.value,
  },
  {
    title: gettext('Memory Usage'),
    value: `${hostMemoryPercent.value.toFixed(2)}%`,
    meta: `${formatBytes(Number(hostMemory.value.used))} / ${formatBytes(
      Number(hostMemory.value.total)
    )}`,
    percent: hostMemoryPercent.value,
  },
  {
    title: gettext('HD Space'),
    value: `${hostDiskPercent.value.toFixed(2)}%`,
    meta: `${formatBytes(Number(hostRootfs.value.used))} / ${formatBytes(
      Number(hostRootfs.value.total)
    )}`,
    percent: hostDiskPercent.value,
  },
  {
    title: gettext('SWAP Usage'),
    value: `${hostSwapPercent.value.toFixed(2)}%`,
    meta: `${formatBytes(Number(hostSwap.value.used))} / ${formatBytes(
      Number(hostSwap.value.total)
    )}`,
    percent: hostSwapPercent.value,
  },
  {
    title: gettext('IO Delay'),
    value: `${hostIoDelayPercent.value.toFixed(2)}%`,
    meta: gettext('IO Delay'),
    percent: hostIoDelayPercent.value,
  },
  { title: gettext('Load Average'), loadValues: hostLoadAverageValues.value },
]);
const hostChartXAxis = computed(() =>
  rrdRows.value.map((item) => (item.time ? timestampToMinute(Number(item.time) * 1000) : ''))
);
const hostCpuSeries = computed(() => [
  {
    name: gettext('IO Delay'),
    data: rrdRows.value.map((item) => Number(item.iowait || 0) * 100),
    color: '#ef6c00',
  },
  {
    name: gettext('CPU Usage'),
    data: rrdRows.value.map((item) => Number(item.cpu || 0) * 100),
    color: '#1976d2',
  },
]);
const hostLoadSeries = computed(() => [
  {
    name: gettext('Load Average'),
    data: rrdRows.value.map((item) => Number(item.loadavg || 0)),
    color: '#1976d2',
  },
]);
const hostMemorySeries = computed(() => [
  {
    name: gettext('Total'),
    data: rrdRows.value.map((item) => Number(item.memtotal || item.maxmem || 0)),
    color: '#8c96a8',
  },
  {
    name: gettext('RAM Used'),
    data: rrdRows.value.map((item) => Number(item.memused || item.mem || 0)),
    color: '#2e7d32',
  },
  {
    name: gettext('ZFS ARC'),
    data: rrdRows.value.map((item) => Number(item.arcsize || 0)),
    color: '#24ad9a',
  },
  {
    name: gettext('Available'),
    data: rrdRows.value.map((item) => Number(item.memavailable || 0)),
    color: '#bbde0d',
  },
]);
const hostNetworkSeries = computed(() => [
  {
    name: gettext('Incoming'),
    data: rrdRows.value.map((item) => Number(item.netin || 0)),
    color: '#00838f',
  },
  {
    name: gettext('Outgoing'),
    data: rrdRows.value.map((item) => Number(item.netout || 0)),
    color: '#1976d2',
  },
]);
const hostCpuPressureSeries = computed(() => [
  {
    name: gettext('Some'),
    data: rrdRows.value.map((item) => Number(item.pressurecpusome || 0)),
    color: '#ffd13e',
  },
]);
const hostIoPressureSeries = computed(() => [
  {
    name: gettext('Some'),
    data: rrdRows.value.map((item) => Number(item.pressureiosome || 0)),
    color: '#ffd13e',
  },
  {
    name: gettext('Full'),
    data: rrdRows.value.map((item) => Number(item.pressureiofull || 0)),
    color: '#a61120',
  },
]);
const hostMemoryPressureSeries = computed(() => [
  {
    name: gettext('Some'),
    data: rrdRows.value.map((item) => Number(item.pressurememorysome || 0)),
    color: '#ffd13e',
  },
  {
    name: gettext('Full'),
    data: rrdRows.value.map((item) => Number(item.pressurememoryfull || 0)),
    color: '#a61120',
  },
]);

const tableColumns = computed<QTableColumn<PveRecord>[]>(() => {
  const base: QTableColumn<PveRecord>[] = [
    {
      name: 'name',
      required: true,
      label: gettext('Name'),
      align: 'left',
      field: (row) => row.name || row.node || row.storage || row.id || '-',
      sortable: true,
    },
    {
      name: 'node',
      label: gettext('Node'),
      align: 'left',
      field: (row) => row.node || '-',
      sortable: true,
    },
    {
      name: 'status',
      label: gettext('Status'),
      align: 'left',
      field: (row) => row.status || '-',
      sortable: true,
    },
    { name: 'usage', label: gettext('Usage'), align: 'left', field: 'usage' },
  ];
  if (props.mode === 'computer') {
    base.splice(1, 0, {
      name: 'vmid',
      label: gettext('VMID'),
      align: 'left',
      field: (row) => row.vmid || '-',
      sortable: true,
    });
  }
  return base;
});

function resourceId(row: PveRecord) {
  const fallback = `${textValue(row.node)}:${textValue(
    row.vmid || row.storage || row.node || row.name
  )}`;
  return textValue(row.id, fallback);
}

function formatUptime(value: unknown) {
  const seconds = Number(value);
  if (!seconds) return '-';
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return `${days}d ${hours}h ${minutes}m`;
}

function timestampToMinute(value: number) {
  const date = new Date(value);
  const pad = (part: number) => String(part).padStart(2, '0');
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function hostMemoryTooltip(index: number) {
  const row = rrdRows.value[index];
  if (!row) return '';
  const total = Number(row.memtotal || 0);
  const used = Number(row.memused || 0);
  const arc = Number(row.arcsize || 0);
  const available = Number(row.memavailable || 0);
  const withoutArc =
    arc > 1024 * 1024 ? ` (${gettext('Without ZFS ARC')}: ${formatBytes(used - arc)})` : '';
  const availableText = available ? ` (${gettext('Available')}: ${formatBytes(available)})` : '';
  return [
    `${gettext('Total')}: ${formatBytes(total)}${availableText}`,
    `${gettext('Used')}: ${formatBytes(used)}${withoutArc}`,
  ].join('<br>');
}

async function loadRepositoryStatus(node: string) {
  standardRepositories.value = [];
  subscriptionActive.value = undefined;

  const [repositoriesResult, subscriptionResult] = await Promise.allSettled([
    getNodeRepositories(node),
    getNodeSubscription(node),
  ]);
  if (repositoriesResult.status === 'fulfilled') {
    const repositories = repositoriesResult.value.data?.['standard-repos'];
    standardRepositories.value = Array.isArray(repositories) ? (repositories as PveRecord[]) : [];
  }
  if (subscriptionResult.status === 'fulfilled') {
    subscriptionActive.value =
      textValue(subscriptionResult.value.data?.status).toLowerCase() === 'active';
  }
}

async function loadResources() {
  loading.value = true;
  try {
    const response = await getClusterResources({ type: modeType.value });
    resources.value = response.data || [];
    const initialResource =
      props.mode === 'host' && props.node
        ? resources.value.find((item) => textValue(item.node) === props.node) || {
            node: props.node,
          }
        : resources.value[0] || {};
    selectedId.value = resourceId(initialResource);
    await loadSelected();
  } finally {
    loading.value = false;
  }
}

async function loadSelected() {
  const row = selectedResource.value;
  if (!Object.keys(row).length) {
    current.value = {};
    rrdRows.value = [];
    return;
  }

  loading.value = true;
  try {
    if (props.mode === 'computer') {
      const type = row.type === 'lxc' ? 'lxc' : 'qemu';
      const [statusResponse, rrdResponse] = await Promise.all([
        getVmCurrent(textValue(row.node), textValue(row.vmid), type),
        getVmRrd(textValue(row.node), textValue(row.vmid), 'hour', 'AVERAGE', type),
      ]);
      current.value = statusResponse.data || {};
      rrdRows.value = rrdResponse.data || [];
    } else if (props.mode === 'host') {
      const node = textValue(row.node);
      const repositoryStatusPromise = loadRepositoryStatus(node);
      const [statusResponse, rrdResponse] = await Promise.all([
        getNodeStatus(node),
        getNodeRrd(node, rrdTimeframe.value, rrdConsolidation.value),
      ]);
      current.value = statusResponse.data || {};
      rrdRows.value = rrdResponse.data || [];
      await repositoryStatusPromise;
    } else {
      const rrdResponse = await getStorageRrd(
        textValue(row.node, 'localhost'),
        textValue(row.storage),
        'hour',
        'AVERAGE'
      );
      current.value = row;
      rrdRows.value = rrdResponse.data || [];
    }
  } finally {
    loading.value = false;
  }
}

watch(selectedId, () => {
  void loadSelected();
});

watch(
  () => props.node,
  () => {
    if (props.mode === 'host') void loadResources();
  }
);

onMounted(loadResources);
</script>

<template>
  <div
    v-if="props.mode === 'host'"
    class="q-ma-md host-overview"
  >
    <div class="overview-toolbar">
      <NodeSelectTable
        v-if="!props.hideNodeSelector"
        v-model="hostSelectedNode"
      />
      <q-select
        v-model="rrdTimeframe"
        square
        outlined
        dense
        emit-value
        map-options
        options-dense
        class="timeframe-select u-dense"
        :options="rrdTimeframeOptions"
        @update:model-value="loadSelected"
      />
      <q-select
        v-model="rrdConsolidation"
        square
        outlined
        dense
        emit-value
        map-options
        options-dense
        class="aggregation-select u-dense"
        :options="rrdConsolidationOptions"
        @update:model-value="loadSelected"
      />
      <q-btn
        no-caps
        outline
        size="12px"
        color="primary"
        class="u-button"
        :loading="loading"
        :label="gettext('Refresh')"
        @click="loadResources"
      />
    </div>

    <div class="host-top-grid">
      <q-card class="overview-panel no-shadow no-border-radius no-margin">
        <q-card-section class="panel-section">
          <div class="panel-header">
            <span class="host-basic-title">
              <i
                class="host-status-dot"
                :class="`is-${nodeStatus}`"
              >
                <q-tooltip>{{ nodeStatusLabel }}</q-tooltip>
              </i>
              {{ hostBasicTitle }}
            </span>
            <q-space />
          </div>
          <div class="host-basic-content">
            <div class="host-illustration-column">
              <div class="host-illustration">
                <img
                  :src="hostOverviewIllustration"
                  alt=""
                />
              </div>
            </div>
            <div class="info-list">
              <div
                v-for="item in hostInfoRows"
                :key="item.label"
                class="info-row"
              >
                <span class="info-row-label">{{ item.label }}</span>
                <strong :class="item.className">{{ item.value }}</strong>
              </div>
            </div>
          </div>
          <div class="host-notes-wrap">
            <HostNotesPanel :node="textValue(selectedResource.node)" />
          </div>
        </q-card-section>
      </q-card>

      <q-card class="overview-panel resource-grid-panel no-shadow no-border-radius no-margin">
        <q-card-section class="panel-section">
          <div class="panel-header">
            <span>{{ gettext('System Resources') }}</span>
          </div>
          <div class="resource-card-grid">
            <section
              v-for="card in hostResourceCards"
              :key="card.title"
              class="resource-card"
              :class="{ 'is-load-average': card.loadValues }"
            >
              <div class="resource-card-title">{{ card.title }}</div>
              <template v-if="card.loadValues">
                <div class="load-average-values">
                  <div
                    v-for="value in card.loadValues"
                    :key="value.label"
                  >
                    <strong>{{ value.value }}</strong>
                    <span>{{ value.label }}</span>
                  </div>
                </div>
              </template>
              <template v-else>
                <strong>{{ card.value }}</strong>
                <div class="resource-card-meta">
                  <span>{{ gettext('Used') }}</span>
                  <span>{{ card.meta }}</span>
                </div>
                <q-circular-progress
                  show-value
                  class="resource-card-progress"
                  size="80px"
                  :thickness="0.18"
                  :value="card.percent"
                  :color="resourceProgressColor(card.percent)"
                  track-color="blue-grey-1"
                >
                  {{ card.percent.toFixed(0) }}%
                </q-circular-progress>
              </template>
            </section>
          </div>
        </q-card-section>
      </q-card>
    </div>

    <div class="row q-col-gutter-sm chart-grid">
      <div class="col-12 col-md-6">
        <q-card class="chart-panel no-shadow no-border-radius">
          <q-card-section class="chart-card-section">
            <div class="chart-header">
              <strong>{{ gettext('CPU Usage') }}</strong>
            </div>
            <LineMetricChart
              :x-data="hostChartXAxis"
              :series="hostCpuSeries"
              unit-type="percent"
              :height="260"
            />
          </q-card-section>
        </q-card>
      </div>
      <div class="col-12 col-md-6">
        <q-card class="chart-panel no-shadow no-border-radius">
          <q-card-section class="chart-card-section">
            <div class="chart-header">
              <strong>{{ gettext('Server Load') }}</strong>
            </div>
            <LineMetricChart
              :x-data="hostChartXAxis"
              :series="hostLoadSeries"
              :height="260"
            />
          </q-card-section>
        </q-card>
      </div>
      <div class="col-12 col-md-6">
        <q-card class="chart-panel no-shadow no-border-radius">
          <q-card-section class="chart-card-section">
            <div class="chart-header">
              <strong>{{ gettext('Memory Usage') }}</strong>
            </div>
            <LineMetricChart
              :x-data="hostChartXAxis"
              :series="hostMemorySeries"
              :tooltip-formatter="hostMemoryTooltip"
              unit-type="bytes"
              power-of-two
              :height="260"
            />
          </q-card-section>
        </q-card>
      </div>
      <div class="col-12 col-md-6">
        <q-card class="chart-panel no-shadow no-border-radius">
          <q-card-section class="chart-card-section">
            <div class="chart-header">
              <strong>{{ gettext('Network Traffic') }}</strong>
            </div>
            <LineMetricChart
              :x-data="hostChartXAxis"
              :series="hostNetworkSeries"
              unit-type="bytespersecond"
              :height="260"
            />
          </q-card-section>
        </q-card>
      </div>
      <div class="col-12 col-md-6">
        <q-card class="chart-panel no-shadow no-border-radius">
          <q-card-section class="chart-card-section">
            <div class="chart-header">
              <strong>{{ gettext('CPU Pressure Stall') }}</strong>
            </div>
            <LineMetricChart
              :x-data="hostChartXAxis"
              :series="hostCpuPressureSeries"
              unit-type="percent"
              :height="260"
            />
          </q-card-section>
        </q-card>
      </div>
      <div class="col-12 col-md-6">
        <q-card class="chart-panel no-shadow no-border-radius">
          <q-card-section class="chart-card-section">
            <div class="chart-header">
              <strong>{{ gettext('IO Pressure Stall') }}</strong>
            </div>
            <LineMetricChart
              :x-data="hostChartXAxis"
              :series="hostIoPressureSeries"
              unit-type="percent"
              :height="260"
            />
          </q-card-section>
        </q-card>
      </div>
      <div class="col-12 col-md-6">
        <q-card class="chart-panel no-shadow no-border-radius">
          <q-card-section class="chart-card-section">
            <div class="chart-header">
              <strong>{{ gettext('Memory Pressure Stall') }}</strong>
            </div>
            <LineMetricChart
              :x-data="hostChartXAxis"
              :series="hostMemoryPressureSeries"
              unit-type="percent"
              :height="260"
            />
          </q-card-section>
        </q-card>
      </div>
    </div>

    <q-inner-loading :showing="loading" />
  </div>

  <div
    v-else
    class="q-ma-md"
  >
    <div class="bg-white q-pa-sm row items-center q-gutter-sm">
      <q-select
        v-model="selectedId"
        square
        outlined
        dense
        emit-value
        map-options
        options-dense
        class="resource-select"
        :options="options"
        :label="title"
      />
      <q-btn
        no-caps
        outline
        size="12px"
        color="primary"
        class="u-button"
        :loading="loading"
        :label="gettext('Refresh')"
        @click="loadResources"
      />
    </div>

    <div class="row q-col-gutter-md q-mt-sm">
      <div class="col-12 col-md-4">
        <q-card
          flat
          bordered
          class="overview-card"
        >
          <q-card-section>
            <div class="text-subtitle2 q-mb-sm">{{ gettext('Status') }}</div>
            <div
              v-for="item in statRows"
              :key="item.label"
              class="row q-py-xs"
            >
              <div class="col text-grey-7">{{ item.label }}</div>
              <div class="col text-right text-grey-9">{{ item.value }}</div>
            </div>
          </q-card-section>
        </q-card>
      </div>
      <div class="col-12 col-md-8">
        <q-table
          flat
          row-key="id"
          table-header-class="u-table-header"
          :rows="resources"
          :columns="tableColumns"
          :loading="loading"
          :pagination="{ page: 1, rowsPerPage: 8 }"
          :rows-per-page-options="[8]"
          :no-data-label="gettext('no record can be found')"
          @row-click="
            (_, row) => {
              selectedId = resourceId(row);
            }
          "
        >
          <template #body-cell-usage="scope">
            <q-td :props="scope">
              <UsageProgress
                :percent="
                  usedPercent(
                    Number(scope.row.mem || scope.row.disk),
                    Number(scope.row.maxmem || scope.row.maxdisk)
                  )
                "
              />
            </q-td>
          </template>
        </q-table>
      </div>
    </div>

    <div class="row q-col-gutter-md q-mt-sm">
      <div class="col-12 col-md-6">
        <q-card
          flat
          bordered
        >
          <q-card-section>
            <div class="text-subtitle2 q-mb-sm">{{ gettext('CPU Usage') }}</div>
            <MetricSparkline :values="cpuValues" />
          </q-card-section>
        </q-card>
      </div>
      <div class="col-12 col-md-6">
        <q-card
          flat
          bordered
        >
          <q-card-section>
            <div class="text-subtitle2 q-mb-sm">{{ gettext('Memory Usage') }}</div>
            <MetricSparkline
              :values="memoryValues"
              color="#2e7d32"
            />
          </q-card-section>
        </q-card>
      </div>
      <div class="col-12 col-md-6">
        <q-card
          flat
          bordered
        >
          <q-card-section>
            <div class="text-subtitle2 q-mb-sm">{{ gettext('Network Traffic') }}</div>
            <MetricSparkline
              :values="networkValues"
              color="#00838f"
            />
          </q-card-section>
        </q-card>
      </div>
      <div class="col-12 col-md-6">
        <q-card
          flat
          bordered
        >
          <q-card-section>
            <div class="text-subtitle2 q-mb-sm">
              {{ props.mode === 'storage' ? gettext('Disk Usage') : gettext('Disk IO') }}
            </div>
            <MetricSparkline
              :values="diskValues"
              color="#ef6c00"
            />
          </q-card-section>
        </q-card>
      </div>
    </div>
    <q-inner-loading :showing="loading" />
  </div>
</template>

<style scoped>
.resource-select {
  min-width: 260px;
}

.aggregation-select {
  min-width: 108px;
}

.timeframe-select {
  min-width: 96px;
}

.host-overview .aggregation-select :deep(.q-field__control),
.host-overview .aggregation-select :deep(.q-field__marginal),
.host-overview .timeframe-select :deep(.q-field__control),
.host-overview .timeframe-select :deep(.q-field__marginal) {
  height: 28px !important;
  min-height: 28px !important;
}

.host-overview .aggregation-select :deep(.q-field__native),
.host-overview .aggregation-select :deep(.q-field__input),
.host-overview .timeframe-select :deep(.q-field__native),
.host-overview .timeframe-select :deep(.q-field__input) {
  line-height: 28px;
  min-height: 28px !important;
  padding-bottom: 0;
  padding-top: 0;
}

.host-overview .aggregation-select :deep(.q-field--outlined .q-field__control::before),
.host-overview .aggregation-select :deep(.q-field--outlined .q-field__control::after),
.host-overview .timeframe-select :deep(.q-field--outlined .q-field__control::before),
.host-overview .timeframe-select :deep(.q-field--outlined .q-field__control::after) {
  border: 1px solid #cccccc !important;
}

.host-overview {
  color: #333333;
}

.overview-toolbar {
  align-items: center;
  background: #ffffff;
  border: 1px solid #dfe1e6;
  display: flex;
  gap: 8px;
  margin-bottom: 10px;
  min-height: 44px;
  padding: 6px 8px;
}

.overview-panel,
.chart-panel {
  background: #ffffff;
  border: 1px solid #dfe1e6;
}

.overview-panel {
  min-height: 216px;
}

.host-top-grid {
  display: grid;
  gap: 10px;
  grid-template-columns: minmax(390px, 1.05fr) minmax(560px, 1.35fr);
  margin-bottom: 10px;
}

.panel-section,
.chart-card-section {
  padding: 0;
}

.panel-header,
.chart-header {
  align-items: center;
  background: #f2f5fc;
  border-bottom: 1px solid #dfe1e6;
  color: #174f86;
  display: flex;
  min-height: 38px;
  padding: 0 14px;
}

.panel-header span,
.chart-header strong {
  font-size: 13px;
  font-weight: 600;
}

.host-basic-title {
  align-items: center;
  display: inline-flex;
  gap: 7px;
}
.host-status-dot {
  display: inline-block;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #94a3b1;
  box-shadow: 0 0 0 2px #eef2f5;
}
.host-status-dot.is-online {
  background: #21a354;
}
.host-status-dot.is-offline {
  background: #d95c4b;
}

.host-basic-content {
  align-items: start;
  display: grid;
  gap: 18px;
  grid-template-columns: 150px minmax(240px, 1fr);
  min-height: 176px;
  padding: 12px 16px;
  align-items: center;
}

.host-illustration-column {
  min-width: 0;
}

.host-illustration {
  align-items: center;
  display: flex;
  justify-content: center;
}

.host-illustration img {
  display: block;
  height: auto;
  max-height: 118px;
  max-width: 100%;
  object-fit: contain;
}

.info-list {
  padding: 0;
}

.info-row {
  align-items: center;
  border-bottom: 1px solid #eef1f6;
  display: flex;
  gap: 12px;
  justify-content: space-between;
  min-height: 30px;
}

.info-row:last-child {
  border-bottom: 0;
}

.info-row span,
.resource-card-meta {
  color: #666666;
  font-size: 12px;
}

.info-row-label {
  align-items: center;
  display: inline-flex;
  gap: 6px;
  min-width: 0;
}

.info-row-label :deep(.q-icon) {
  color: #6f849d;
  flex: 0 0 auto;
}

.host-illustration-column :deep(.host-notes-panel) {
  margin: 8px 0 0;
  padding-top: 8px;
}

.host-notes-wrap :deep(.host-notes-panel) {
  margin: 0 16px 14px;
}

.info-row strong {
  color: #333333;
  font-size: 12px;
  font-weight: 600;
  min-width: 0;
  overflow: hidden;
  text-align: right;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.host-status-tag {
  min-width: 52px;
  padding: 3px 7px;
  border: 1px solid #dce5ed;
  background: #edf2f6;
  color: #667788;
  font-size: 11px;
  font-weight: 600;
  text-align: center;
}
.host-status-tag.is-online {
  border-color: #b9dfc4;
  background: #edf8f0;
  color: #278144;
}
.host-status-tag.is-offline {
  border-color: #f0c7c0;
  background: #fff1ef;
  color: #bd4e42;
}

.resource-card-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  padding: 10px;
}

.resource-card {
  background: #fbfcfe;
  border: 1px solid #e1e6ee;
  border-radius: 4px;
  min-height: 124px;
  padding: 12px 96px 12px 14px;
  position: relative;
  flex: 1 1 calc((100% - 20px) / 3);
  min-width: 160px;
}

.resource-card-title {
  color: #475b73;
  font-size: 13px;
  font-weight: 600;
  line-height: 24px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.resource-card strong {
  color: #27384d;
  display: block;
  font-size: 22px;
  line-height: 1.35;
  margin: 8px 0 5px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.resource-card-meta {
  display: flex;
  /* justify-content: space-between; */
}

.resource-card-meta span:last-child {
  color: #52657d;
  overflow: hidden;
  padding-left: 8px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.resource-card.is-load-average {
  padding-right: 14px;
}
.load-average-values {
  align-items: stretch;
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  margin-top: 16px;
}
.load-average-values > div {
  min-width: 0;
  padding: 3px 8px 2px;
  text-align: center;
}
.load-average-values > div:not(:last-child) {
  border-right: 1px solid #e1e6ee;
}
.load-average-values strong {
  display: block;
  margin: 0;
  color: #27384d;
  font-size: 20px;
  font-variant-numeric: tabular-nums;
  font-weight: 700;
  line-height: 1.25;
}
.load-average-values span {
  display: block;
  margin-top: 6px;
  color: #667788;
  font-size: 12px;
  line-height: 1.35;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.resource-card-progress {
  color: #52657d;
  font-size: 11px;
  font-weight: 600;
  position: absolute;
  right: 16px;
  top: 50%;
  transform: translateY(-50%);
}

.chart-grid {
  margin-top: 2px;
}

@media (max-width: 1280px) {
  .host-top-grid {
    grid-template-columns: 1fr;
  }

  .chart-grid > .col-md-6 {
    flex: 0 0 100%;
    max-width: 100%;
  }
}

@media (max-width: 760px) {
  .host-basic-content {
    grid-template-columns: 1fr;
  }

  .resource-card-grid {
    gap: 8px;
  }

  .resource-card {
    flex-basis: calc((100% - 8px) / 2);
  }
}

.overview-card {
  min-height: 278px;
}
</style>
