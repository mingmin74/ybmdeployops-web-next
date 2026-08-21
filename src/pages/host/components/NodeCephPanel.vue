<script setup lang="ts">
import CephPage from '@/pages/storage/CephPage.vue';

defineProps<{ node: string }>();
</script>

<template>
  <CephPage />
</template>
