<script setup lang="ts">
import { computed } from 'vue';
import { formatPercent, progressColor } from '@/utils/format';

const props = withDefaults(
  defineProps<{
    percent?: number | string;
    width?: string;
  }>(),
  {
    percent: 0,
    width: '100px',
  },
);

const normalizedPercent = computed(() => {
  const number = Number(props.percent);
  if (!Number.isFinite(number)) return 0;
  return Math.min(Math.max(number, 0), 100);
});

const progressValue = computed(() => normalizedPercent.value / 100);
const color = computed(() => progressColor(normalizedPercent.value));
const label = computed(() => formatPercent(normalizedPercent.value));
</script>

<template>
  <q-linear-progress
    rounded
    size="20px"
    class="usage-progress"
    :style="{ width }"
    :value="progressValue"
    :color="color"
  >
    <div class="absolute-full flex flex-center">
      <q-badge color="white" text-color="accent" class="usage-progress__badge" :label="label" />
    </div>
  </q-linear-progress>
</template>

<style scoped>
.usage-progress {
  min-width: 80px;
}

.usage-progress__badge {
  padding: 1px 3px;
}
</style>
