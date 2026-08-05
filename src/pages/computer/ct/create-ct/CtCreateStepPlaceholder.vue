<script setup lang="ts">
defineProps<{ title: string }>();
</script>

<template>
  <q-scroll-area class="q-pa-sm" style="height: 466px">
    <div class="u-border-dotted-blue bg-white q-px-md q-py-sm text-grey-7">{{ title }}</div>
  </q-scroll-area>
</template>
