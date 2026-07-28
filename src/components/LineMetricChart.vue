<script setup lang="ts">
import { LineChart } from 'echarts/charts';
import { GridComponent, LegendComponent, TooltipComponent } from 'echarts/components';
import { getInstanceByDom, init, use, type ECharts, type EChartsCoreOption } from 'echarts/core';
import { CanvasRenderer } from 'echarts/renderers';
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  shallowRef,
  useTemplateRef,
  watch,
} from 'vue';

use([LineChart, GridComponent, LegendComponent, TooltipComponent, CanvasRenderer]);

type MetricSeries = {
  name: string;
  data: number[];
  color: string;
};

type UnitType = 'bytes' | 'bytespersecond' | 'percent';

const props = withDefaults(
  defineProps<{
    xData: string[];
    series: MetricSeries[];
    yUnit?: string;
    unitType?: UnitType;
    powerOfTwo?: boolean;
    height?: number;
  }>(),
  {
    yUnit: '',
    powerOfTwo: false,
    height: 260,
  },
);

const chartRef = useTemplateRef<HTMLDivElement>('chart');
const chartInstance = shallowRef<ECharts | null>(null);
let resizeTimer: number | undefined;

const hasData = computed(() =>
  props.series.some((item) => item.data.some((value) => Number.isFinite(Number(value)))),
);
const xAxisData = computed(() => (props.xData.length ? props.xData : ['', '', '', '', '']));

function convertToUnits(value: number) {
  const units = ['', 'k', 'M', 'G', 'T', 'P'];
  let scaledValue = Math.max(0, Number(value) || 0);
  let unitIndex = 0;
  const baseValue = props.powerOfTwo ? 1024 : 1000;

  while (scaledValue >= baseValue && unitIndex < units.length - 1) {
    scaledValue /= baseValue;
    unitIndex += 1;
  }

  const digits = scaledValue < 0.1 ? 3 : 2;
  const formattedValue = Number(scaledValue.toFixed(digits)).toString();
  let unit = units[unitIndex];
  if (unit && props.powerOfTwo) {
    unit += 'i';
  }

  return unit ? `${formattedValue} ${unit}` : formattedValue;
}

function axisTitle() {
  if (props.unitType === 'percent') return '%';
  if (props.unitType === 'bytes') return 'Bytes';
  if (props.unitType === 'bytespersecond') return 'Bytes/s';
  if (props.yUnit) return props.yUnit;
  const firstSeries = props.series[0];
  if (props.series.length === 1 && firstSeries) return firstSeries.name;
  return '';
}

function tooltipSuffix() {
  if (props.unitType === 'percent') return '%';
  if (props.unitType === 'bytes') return 'B';
  if (props.unitType === 'bytespersecond') return 'B/s';
  return '';
}

function ensureChart() {
  if (!chartRef.value) return null;
  chartInstance.value = getInstanceByDom(chartRef.value) || init(chartRef.value);
  return chartInstance.value;
}

function resizeChart() {
  if (resizeTimer) window.clearTimeout(resizeTimer);
  resizeTimer = window.setTimeout(() => {
    chartInstance.value?.resize();
  }, 100);
}

async function updateChart() {
  await nextTick();
  const chart = ensureChart();
  if (!chart || !chartRef.value?.clientWidth || !chartRef.value?.clientHeight) return;

  const option: EChartsCoreOption = {
    animation: false,
    color: props.series.map((item) => item.color),
    textStyle: {
      color: '#333333',
      fontSize: 12,
    },
    tooltip: {
      trigger: 'axis',
      confine: true,
      axisPointer: {
        type: 'line',
      },
      valueFormatter: (value: unknown) => {
        const numericValue = Number(value);
        if (!Number.isFinite(numericValue)) return '';
        return `${convertToUnits(numericValue)}${tooltipSuffix()}`;
      },
    },
    legend: {
      show: props.series.length > 1,
      right: 8,
      top: 10,
      itemWidth: 14,
      itemHeight: 8,
      textStyle: {
        color: '#666666',
        fontSize: 12,
      },
    },
    grid: {
      top: props.series.length > 1 ? 46 : 22,
      right: 18,
      bottom: 24,
      left: 56,
    },
    xAxis: {
      type: 'category',
      boundaryGap: false,
      data: xAxisData.value,
      axisLine: {
        lineStyle: {
          color: '#cfd6e2',
        },
      },
      axisTick: {
        show: false,
      },
      axisLabel: {
        color: '#666666',
        hideOverlap: true,
      },
      splitLine: {
        show: false,
      },
    },
    yAxis: {
      type: 'value',
      name: axisTitle(),
      nameLocation: 'middle',
      nameGap: 42,
      nameRotate: 90,
      nameTextStyle: {
        color: '#666666',
        fontSize: 12,
      },
      axisLine: {
        show: true,
        lineStyle: {
          color: '#cfd6e2',
        },
      },
      axisTick: {
        show: false,
      },
      axisLabel: {
        color: '#666666',
        formatter: (value: number) => convertToUnits(value),
      },
      splitLine: {
        lineStyle: {
          color: '#eef1f6',
        },
      },
      min: 0,
      max: hasData.value ? undefined : 100,
    },
    series: hasData.value
      ? props.series.map((item) => ({
          name: item.name,
          type: 'line',
          smooth: true,
          symbol: 'none',
          lineStyle: {
            width: 2,
            color: item.color,
          },
          itemStyle: {
            color: item.color,
          },
          areaStyle:
            props.series.length === 1
              ? {
                  opacity: 0.1,
                }
              : undefined,
          data: item.data,
        }))
      : [],
  };

  chart.setOption(option, true);
}

watch(
  () => [props.xData, props.series, props.yUnit, props.unitType, props.powerOfTwo],
  updateChart,
  { deep: true },
);

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
  <div ref="chart" class="line-metric-chart" :style="{ height: `${height}px` }"></div>
</template>

<style scoped>
.line-metric-chart {
  width: 100%;
}
</style>
