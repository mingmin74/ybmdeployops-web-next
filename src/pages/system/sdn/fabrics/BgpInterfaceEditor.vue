<script setup lang="ts">
import type { PveRecord } from '@/api/resources';
import { gettext } from '@/locale';
const rows = defineModel<PveRecord[]>('rows', { required: true });
const selected = defineModel<PveRecord[]>('selected', { required: true });
</script>
<template>
  <q-table
    flat
    bordered
    dense
    row-key="name"
    selection="multiple"
    :rows="rows"
    :selected="selected"
    @update:selected="selected = [...$event]"
    :columns="[
      { name: 'name', label: gettext('Name'), field: 'name', align: 'left' },
      { name: 'type', label: gettext('Type'), field: 'type', align: 'left' },
    ]"
    :pagination="{ rowsPerPage: 0 }"
  />
</template>
