<script setup lang="ts">
import { computed } from 'vue';
import RulesPage from '@/pages/system/permission/RulesPage.vue';
const props = defineProps<{ vmid: string }>();
const resourcePath = computed(() => `/vms/${props.vmid}`);
</script>
<template><RulesPage :resource-path="resourcePath" /></template>
