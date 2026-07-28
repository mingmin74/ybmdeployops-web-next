<script setup lang="ts">
import { computed, shallowRef, watch } from 'vue';
import type { PveRecord } from '@/api/resources';
import { getVmRrd } from '@/api/overview';
import LineMetricChart from '@/components/LineMetricChart.vue';
import { gettext } from '@/locale';

const props = defineProps<{ node: string; vmid: string }>();
const loading = shallowRef(false);
const timeframe = shallowRef<'hour' | 'day' | 'week' | 'month' | 'year'>('hour');
const rows = shallowRef<PveRecord[]>([]);
const xData = computed(() => rows.value.map((item) => formatTime(item.time)));
const cpuSeries = computed(() => [{ name: gettext('CPU Usage'), data: rows.value.map((item) => Number(item.cpu || 0) * 100), color: '#1976d2' }]);
const memorySeries = computed(() => [
  { name: gettext('Total'), data: rows.value.map((item) => Number(item.maxmem || 0)), color: '#8c96a8' },
  { name: gettext('RAM Used'), data: rows.value.map((item) => Number(item.mem || 0)), color: '#2e7d32' },
]);
const networkSeries = computed(() => [
  { name: gettext('NetIn'), data: rows.value.map((item) => Number(item.netin || 0)), color: '#00838f' },
  { name: gettext('NetOut'), data: rows.value.map((item) => Number(item.netout || 0)), color: '#1976d2' },
]);
const diskSeries = computed(() => [
  { name: gettext('Disk Read Speed'), data: rows.value.map((item) => Number(item.diskread || 0)), color: '#ef6c00' },
  { name: gettext('Disk Write Speed'), data: rows.value.map((item) => Number(item.diskwrite || 0)), color: '#c62828' },
]);

function formatTime(value: unknown) {
  const seconds = Number(value);
  if (!Number.isFinite(seconds) || seconds <= 0) return '';
  const date = new Date(seconds * 1000);
  return timeframe.value === 'hour' ? date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : date.toLocaleString([], { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
}

async function reload() {
  if (!props.node || !props.vmid) return;
  loading.value = true;
  try {
    const response = await getVmRrd(props.node, props.vmid, timeframe.value, 'AVERAGE');
    rows.value = response.data || [];
  } finally {
    loading.value = false;
  }
}

watch(() => [props.node, props.vmid, timeframe.value], () => { void reload(); }, { immediate: true });
</script>

<template>
  <div class="vm-monitor-tab q-pa-md">
    <div class="row items-center q-gutter-sm q-mb-sm">
      <q-btn-toggle v-model="timeframe" dense no-caps unelevated toggle-color="primary" color="white" text-color="primary" :options="[{ label: gettext('Hour'), value: 'hour' }, { label: gettext('Day'), value: 'day' }, { label: gettext('Week'), value: 'week' }, { label: gettext('Month'), value: 'month' }, { label: gettext('Year'), value: 'year' }]" />
      <q-space />
      <q-btn no-caps outline size="12px" color="primary" class="u-button" icon="refresh" :label="gettext('Refresh')" :loading="loading" @click="reload" />
    </div>
    <q-inner-loading :showing="loading" />
    <div class="row q-col-gutter-sm">
      <div class="col-12 col-lg-6"><q-card flat bordered square><q-card-section class="q-pb-none text-weight-medium text-caption">{{ gettext('CPU Usage') }}</q-card-section><LineMetricChart :x-data="xData" :series="cpuSeries" unit-type="percent" :height="250" /></q-card></div>
      <div class="col-12 col-lg-6"><q-card flat bordered square><q-card-section class="q-pb-none text-weight-medium text-caption">{{ gettext('Memory Usage') }}</q-card-section><LineMetricChart :x-data="xData" :series="memorySeries" unit-type="bytes" power-of-two :height="250" /></q-card></div>
      <div class="col-12 col-lg-6"><q-card flat bordered square><q-card-section class="q-pb-none text-weight-medium text-caption">{{ gettext('Network Traffic') }}</q-card-section><LineMetricChart :x-data="xData" :series="networkSeries" unit-type="bytespersecond" power-of-two :height="250" /></q-card></div>
      <div class="col-12 col-lg-6"><q-card flat bordered square><q-card-section class="q-pb-none text-weight-medium text-caption">{{ gettext('Disk IO') }}</q-card-section><LineMetricChart :x-data="xData" :series="diskSeries" unit-type="bytespersecond" power-of-two :height="250" /></q-card></div>
    </div>
  </div>
</template>
