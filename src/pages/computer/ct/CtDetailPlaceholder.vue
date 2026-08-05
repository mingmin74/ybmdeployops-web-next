<script setup lang="ts">
defineProps<{ title: string }>();
</script>

<template>
  <div class="ct-detail-placeholder">
    <div class="text-subtitle2">{{ title }}</div>
    <div class="text-grey-7 text-caption">Coming Soon</div>
  </div>
</template>

<style scoped>
.ct-detail-placeholder {
  min-height: 240px;
  display: grid;
  place-content: center;
  gap: 8px;
  text-align: center;
}
</style>
