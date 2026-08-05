<script setup lang="ts">
import VmPermissionsTab from '@/pages/computer/vm/VmPermissionsTab.vue';

defineProps<{ vmid: string }>();
</script>

<template>
  <VmPermissionsTab :vmid="vmid" />
</template>
