<script setup lang="ts">
import { useTemplateRef } from 'vue';
import GroupsPage from '@/pages/system/GroupsPage.vue';

const groupsPage = useTemplateRef<{ reload: () => Promise<void> }>('groupsPage');
defineExpose({ reload: () => groupsPage.value?.reload() ?? Promise.resolve() });
</script>

<template>
  <GroupsPage ref="groupsPage" embedded />
</template>
