<script setup lang="ts">
import { gettext } from '@/locale';

const props = withDefaults(
  defineProps<{
    title: string;
    width?: string;
    height?: string;
    loading?: boolean;
    icon?: string;
  }>(),
  {
    width: '600px',
    height: 'auto',
    loading: false,
  }
);
</script>

<template>
  <q-card
    class="u-window-card"
    :style="{ maxWidth: props.width, width: props.width, height: props.height }"
  >
    <q-card-section class="row no-wrap items-center bg-blue-8 text-grey-1 shadow-down-10 q-pa-sm">
      <q-icon
        v-if="props.icon"
        :name="props.icon"
        size="18px"
      />
      <q-spinner-bars
        v-else
        size="14px"
        color="white"
      />
      <div class="u-window-title text-weight-bold q-mx-sm">{{ props.title }}</div>
      <q-btn
        v-close-popup
        class="u-window-close"
        icon="close"
        size="sm"
        flat
        dense
        :aria-label="gettext('Close')"
      />
    </q-card-section>
    <q-card-section class="q-pa-none u-hidden-error">
      <slot />
    </q-card-section>
    <q-card-actions
      align="right"
      class="bg-grey-2 overflow-hidden"
    >
      <slot name="foot" />
    </q-card-actions>
  </q-card>
</template>

<style scoped>
.u-window-card {
  border-radius: 0;
}
.u-window-title {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.u-window-close {
  flex: 0 0 auto;
  background: rgba(255, 255, 255, 0.16) !important;
  color: #ffffff;
  opacity: 1;
}
</style>
