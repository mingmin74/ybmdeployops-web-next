<script setup lang="ts">
import { computed } from 'vue';

const props = withDefaults(
  defineProps<{
    values: Array<number | string | undefined>;
    color?: string;
    height?: number;
  }>(),
  {
    color: '#1976d2',
    height: 120,
  },
);

const points = computed(() =>
  props.values.map((item) => Number(item)).filter((item) => Number.isFinite(item)),
);
const path = computed(() => {
  if (points.value.length < 2) return '';
  const width = 420;
  const height = props.height;
  const max = Math.max(...points.value);
  const min = Math.min(...points.value);
  const range = max - min;

  return points.value
    .map((value, index) => {
      const x = (index / (points.value.length - 1)) * width;
      const y = range === 0 ? height / 2 : height - ((value - min) / range) * (height - 16) - 8;
      return `${index === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(' ');
});
</script>

<template>
  <div class="metric-sparkline" :style="{ height: `${height}px` }">
    <svg v-if="path" :viewBox="`0 0 420 ${height}`" preserveAspectRatio="none" aria-hidden="true">
      <line x1="0" :y1="height / 2" x2="420" :y2="height / 2" class="baseline" />
      <path
        :d="path"
        fill="none"
        :stroke="color"
        stroke-width="2.5"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
    </svg>
    <div v-else class="empty-line">--</div>
  </div>
</template>

<style scoped>
.metric-sparkline {
  width: 100%;
  border: 1px solid #eeeeee;
  background: #fafafa;
}

svg {
  display: block;
  width: 100%;
  height: 100%;
}

.baseline {
  stroke: #e0e0e0;
  stroke-width: 1;
}

.empty-line {
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #9e9e9e;
}
</style>
