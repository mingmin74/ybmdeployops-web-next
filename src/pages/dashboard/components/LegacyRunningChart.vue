<script setup lang="ts">
import { LineChart } from 'echarts/charts';
import { GridComponent, TooltipComponent } from 'echarts/components';
import { getInstanceByDom, init, use, type ECharts } from 'echarts/core';
import { CanvasRenderer } from 'echarts/renderers';
import { nextTick, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue';
import { formatBytes } from '@/utils/pveFormat';

use([LineChart, GridComponent, TooltipComponent, CanvasRenderer]);

type RunningChartData = {
  xList: string[];
  yList: number[];
  xLabel: string;
  yLabel: string;
};

const props = withDefaults(
  defineProps<{
    chartData: RunningChartData;
    iops?: boolean;
  }>(),
  {
    iops: false,
  },
);

const chartRef = ref<HTMLDivElement | null>(null);
const chartInstance = shallowRef<ECharts | null>(null);
let resizeTimer: number | undefined;

function resizeChart() {
  if (resizeTimer) window.clearTimeout(resizeTimer);
  resizeTimer = window.setTimeout(() => {
    chartInstance.value?.resize();
  }, 100);
}

function ensureChart() {
  if (!chartRef.value) return null;
  chartInstance.value = getInstanceByDom(chartRef.value) || init(chartRef.value);
  return chartInstance.value;
}

async function updateChart() {
  await nextTick();
  const chart = ensureChart();
  if (!chart || !chartRef.value?.clientWidth || !chartRef.value?.clientHeight) return;

  chart.setOption(
    {
      textStyle: {
        color: '#333333',
      },
      title: {
        text: '',
      },
      tooltip: {
        trigger: 'axis',
        axisPointer: {
          type: 'cross',
          label: {
            backgroundColor: '#6a7985',
          },
        },
        formatter: (params: unknown) => {
          const first = Array.isArray(params) ? (params[0] as { name?: string; value?: number }) : undefined;
          const value = Number(first?.value || 0);
          return `${props.chartData.xLabel}${first?.name || ''}<br />${props.chartData.yLabel}${props.iops ? value : formatBytes(value)}`;
        },
      },
      grid: {
        left: '0',
        right: '0',
        bottom: '0',
        top: '0',
        containLabel: true,
      },
      xAxis: [
        {
          type: 'category',
          boundaryGap: false,
          axisLabel: {
            show: true,
            formatter: '{value}',
          },
          data: props.chartData.xList,
        },
      ],
      yAxis: [
        {
          type: 'value',
          axisLabel: {
            show: false,
          },
        },
      ],
      series: [
        {
          name: '',
          type: 'line',
          areaStyle: {
            color: 'rgba(25, 118, 210, 0.38)',
          },
          lineStyle: {
            color: '#1976d2',
            width: 2,
          },
          itemStyle: {
            color: '#1976d2',
          },
          emphasis: {
            focus: 'series',
          },
          data: props.chartData.yList,
        },
      ],
    },
    true,
  );
}

watch(() => props.chartData, updateChart, { deep: true });

onMounted(() => {
  void updateChart();
  window.addEventListener('resize', resizeChart);
});

onBeforeUnmount(() => {
  window.removeEventListener('resize', resizeChart);
  if (resizeTimer) window.clearTimeout(resizeTimer);
  chartInstance.value?.dispose();
  chartInstance.value = null;
});
</script>

<template>
  <div ref="chartRef" class="legacy-running-chart"></div>
</template>

<style scoped>
.legacy-running-chart {
  width: 100%;
  height: 100%;
}
</style>
