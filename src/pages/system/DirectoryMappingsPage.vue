<script setup lang="ts">
import { shallowRef } from 'vue';
import type { PveRecord } from '@/api/resources';
import MappingTable from './mappings/MappingTable.vue';

const rows = shallowRef<PveRecord[]>([]);
</script>

<template>
  <div class="q-ma-md bg-white q-pa-md">
    <MappingTable
      v-model:rows="rows"
      kind="dir"
      title="Directory Mapping"
    />
  </div>
</template>
