<script setup lang="ts">
import { PieChart } from 'echarts/charts';
import { LegendComponent, TooltipComponent } from 'echarts/components';
import { getInstanceByDom, init, use, type ECharts, type EChartsCoreOption } from 'echarts/core';
import { CanvasRenderer } from 'echarts/renderers';
import { nextTick, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue';

use([PieChart, LegendComponent, TooltipComponent, CanvasRenderer]);

type RingData = {
  cls: 'faded' | 'good' | 'warning' | 'critical';
  count: number;
  state_name?: string;
};

type RingOptions = {
  radius?: string | [string, string];
  legend?: Record<string, unknown>;
};

const props = withDefaults(
  defineProps<{
    chartData: RingData[];
    chartOption?: RingOptions;
  }>(),
  {
    chartOption: () => ({
      radius: ['40%', '80%'],
    }),
  },
);

const chartRef = ref<HTMLDivElement | null>(null);
const chartInstance = shallowRef<ECharts | null>(null);
let resizeTimer: number | undefined;

function colorMap(cls: RingData['cls']) {
  if (cls === 'faded') return '#CFCFCF';
  if (cls === 'good') return '#21BF4B';
  if (cls === 'warning') return '#FFCC00';
  return '#FF6C59';
}

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

  const chartData = props.chartData || [];
  const option: EChartsCoreOption = {
    color: chartData.map((item) => colorMap(item.cls)),
    textStyle: {
      color: '#333333',
    },
    tooltip: {
      trigger: 'item',
    },
    series: [
      {
        name: '',
        type: 'pie',
        label: {
          show: false,
        },
        radius: props.chartOption?.radius,
        data: chartData.map((item) => ({
          value: item.count,
          name: item.state_name || '',
        })),
      },
    ],
  };

  if (props.chartOption?.legend) {
    option.legend = {
      ...props.chartOption.legend,
      textStyle: {
        color: '#333333',
        ...((props.chartOption.legend.textStyle as Record<string, unknown> | undefined) || {}),
      },
    };
  }

  chart.setOption(option, true);
}

watch(() => [props.chartData, props.chartOption], updateChart, { deep: true });

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
  <div ref="chartRef" class="legacy-ring-chart"></div>
</template>

<style scoped>
.legacy-ring-chart {
  width: 100%;
  height: 100%;
}
</style>
