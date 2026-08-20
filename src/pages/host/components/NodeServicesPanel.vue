<script setup lang="ts">
import type { QTableColumn } from 'quasar';
import { computed, shallowRef, watch } from 'vue';
import {
  getNodeServices,
  restartNodeService,
  startNodeService,
  stopNodeService,
  type PveService,
} from '@/api/host';
import TaskOutputDialog from '@/components/TaskOutputDialog.vue';
import { gettext } from '@/locale';
import { useSessionStore } from '@/stores/session';

const { node } = defineProps<{ node: string }>();
const session = useSessionStore();
const loading = shallowRef(false);
const actionLoading = shallowRef(false);
const rows = shallowRef<PveService[]>([]);
const selected = shallowRef<PveService[]>([]);
const taskVisible = shallowRef(false);
const taskUpid = shallowRef('');
const taskTitle = shallowRef('');
const selectedService = computed(() => selected.value[0]);
const nodeCaps = computed(
  () => (session.caps as unknown as { nodes?: Record<string, unknown> }).nodes || {},
);
const canModifyServices = computed(() => Boolean(nodeCaps.value['Sys.Modify']));
const columns: QTableColumn<PveService>[] = [
  { name: 'name', label: gettext('Name'), align: 'left', field: (row) => row.service || row.name },
  { name: 'state', label: gettext('Status'), align: 'left', field: 'state' },
  { name: 'desc', label: gettext('Description'), align: 'left', field: 'desc' },
];

function serviceId(service?: PveService) {
  return service?.service || service?.name || '';
}

function statusLabel(state?: string) {
  const normalized = state || 'unknown';
  const labels: Record<string, string> = {
    running: gettext('Running'),
    stopped: gettext('Stopped'),
    failed: gettext('Failed'),
    unknown: gettext('Unknown'),
  };

  return labels[normalized] || gettext('Unknown');
}

function statusColor(state?: string) {
  if (state === 'running') return 'green';
  if (state === 'stopped') return 'red';
  if (state === 'failed') return 'negative';
  return 'grey';
}

async function loadServices() {
  if (!node) return;
  loading.value = true;
  try {
    const response = await getNodeServices(node);
    rows.value = response.data || [];
    const name = serviceId(selectedService.value);
    selected.value = name ? rows.value.filter((row) => serviceId(row) === name) : [];
  } finally {
    loading.value = false;
  }
}

async function changeService(action: 'start' | 'stop' | 'restart') {
  const service = serviceId(selectedService.value);
  if (!service || !canModifyServices.value) return;
  actionLoading.value = true;
  try {
    const response =
      action === 'start'
        ? await startNodeService(node, service)
        : action === 'stop'
          ? await stopNodeService(node, service)
          : await restartNodeService(node, service);
    taskUpid.value = response.data || '';
    taskTitle.value = `${service}: ${gettext(action === 'restart' ? 'Restart' : action === 'start' ? 'Start' : 'Stop')}`;
    taskVisible.value = Boolean(taskUpid.value);
  } finally {
    actionLoading.value = false;
  }
}

function selectRow(_event: Event, row: PveService) {
  selected.value =
    serviceId(selectedService.value) === serviceId(row)
      ? []
      : [row];
}

watch(
  () => node,
  () => {
    void loadServices();
  },
  { immediate: true },
);
</script>

<template>
  <q-table
    flat
    row-key="service"
    selection="single"
    hide-selected-banner
    table-header-class="u-table-header"
    :rows="rows"
    :columns="columns"
    :loading="loading"
    :selected="selected"
    :rows-per-page-options="[0]"
    :no-data-label="gettext('no record can be found')"
    @row-click="selectRow"
    @update:selected="selected = [...$event]"
  >
    <template #top
      ><div class="row q-gutter-sm">
        <q-btn
          no-caps
          outline
          size="12px"
          class="u-button"
          :color="selectedService && canModifyServices ? 'primary' : 'grey'"
          :disable="!selectedService || !canModifyServices"
          :loading="actionLoading"
          :label="gettext('Start')"
          @click="changeService('start')"
        />
        <q-btn
          no-caps
          outline
          size="12px"
          class="u-button"
          :color="selectedService && canModifyServices ? 'red' : 'grey'"
          :disable="!selectedService || !canModifyServices"
          :loading="actionLoading"
          :label="gettext('Stop')"
          @click="changeService('stop')"
        />
        <q-btn
          no-caps
          outline
          size="12px"
          class="u-button"
          :color="selectedService && canModifyServices ? 'primary' : 'grey'"
          :disable="!selectedService || !canModifyServices"
          :loading="actionLoading"
          :label="gettext('Restart')"
          @click="changeService('restart')"
        />
        <q-btn
          no-caps
          outline
          size="12px"
          color="primary"
          class="u-button"
          :loading="loading"
          :label="gettext('Reload')"
          @click="loadServices"
        /></div
    ></template>
    <template #body-cell-state="props"
      ><q-td :props="props"
        ><q-badge
          :color="statusColor(props.value)"
          :label="statusLabel(props.value)" /></q-td
    ></template>
  </q-table>
  <TaskOutputDialog
    v-model="taskVisible"
    :node="node"
    :upid="taskUpid"
    :title="taskTitle"
    @finished="loadServices"
  />
</template>
