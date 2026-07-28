<script setup lang="ts">
import { GaugeChart } from 'echarts/charts';
import { GridComponent, TooltipComponent } from 'echarts/components';
import { getInstanceByDom, init, use, type ECharts } from 'echarts/core';
import { CanvasRenderer } from 'echarts/renderers';
import { nextTick, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue';

use([GaugeChart, GridComponent, TooltipComponent, CanvasRenderer]);

type GaugeData = {
  value: number;
  name?: string;
};

type GaugeOptions = {
  width?: number;
  startAngle?: number;
  endAngle?: number;
  percentFontSize?: number;
  textPosition?: 'top' | 'bottom' | 'center';
  center?: [string, string];
};

const props = withDefaults(
  defineProps<{
    chartData: GaugeData;
    chartOptions?: GaugeOptions;
  }>(),
  {
    chartOptions: () => ({}),
  },
);

const chartRef = ref<HTMLDivElement | null>(null);
const chartInstance = shallowRef<ECharts | null>(null);
let resizeTimer: number | undefined;

function healthColor(value: number) {
  if (value < 80) return '#21BF4B';
  if (value < 90) return '#ffcc00';
  return '#FF0000';
}

function titlePosition(position: GaugeOptions['textPosition']) {
  if (position === 'top') return ['0%', '-130%'];
  if (position === 'bottom') return ['0%', '130%'];
  return ['0%', '0%'];
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

  const chartOptions = props.chartOptions || {};
  const width = chartOptions.width || 15;
  const startAngle = chartOptions.startAngle || 360;
  const endAngle = chartOptions.endAngle || 0;
  const percentFontSize = chartOptions.percentFontSize || 30;
  const textPosition = chartOptions.textPosition || 'bottom';
  const center = chartOptions.center || ['50%', '45%'];
  const value = Math.max(0, Math.min(100, Math.round(Number(props.chartData.value || 0))));

  chart.setOption(
    {
      textStyle: {
        color: '#333333',
      },
      tooltip: {
        trigger: 'item',
      },
      grid: {
        containLabel: true,
      },
      series: [
        {
          type: 'gauge',
          center,
          startAngle,
          endAngle,
          min: 0,
          max: 100,
          itemStyle: {
            color: healthColor(value),
          },
          progress: {
            show: true,
            width,
          },
          pointer: {
            show: false,
          },
          axisLine: {
            lineStyle: {
              width,
              color: [[1, '#e6f1fc']],
            },
          },
          axisTick: {
            show: false,
          },
          splitLine: {
            show: false,
          },
          axisLabel: {
            show: false,
          },
          anchor: {
            show: false,
          },
          title: {
            show: true,
            fontSize: 13,
          },
          detail: {
            valueAnimation: true,
            width: '40%',
            lineHeight: 40,
            height: '150%',
            borderRadius: 8,
            offsetCenter: ['0%', '0%'],
            fontSize: percentFontSize,
            fontWeight: 'bolder',
            formatter: (detailValue: number) => `${Math.round(Number(detailValue || 0))} %`,
            color: 'inherit',
          },
          data: [
            {
              value,
              name: props.chartData.name || '',
              title: {
                fontWeight: 'bolder',
                offsetCenter: titlePosition(textPosition),
              },
              detail: {
                offsetCenter: ['0%', '0%'],
                fontSize: percentFontSize,
              },
            },
          ],
        },
      ],
    },
    true,
  );
}

watch(() => [props.chartData.value, props.chartData.name, props.chartOptions], updateChart, {
  deep: true,
});

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
  <div ref="chartRef" class="legacy-gauge-chart"></div>
</template>

<style scoped>
.legacy-gauge-chart {
  width: 100%;
  height: 100%;
}
</style>
