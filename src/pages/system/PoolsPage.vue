<script setup lang="ts">
import type { QTableColumn } from 'quasar';
import SimpleTablePage from '@/components/SimpleTablePage.vue';
import { getPools, type PveRecord } from '@/api/resources';
import { gettext } from '@/locale';

const columns: QTableColumn<PveRecord>[] = [
  {
    name: 'poolid',
    required: true,
    label: gettext('Name'),
    align: 'left',
    field: 'poolid',
    sortable: true,
  },
  { name: 'comment', label: gettext('Comment'), align: 'left', field: 'comment', sortable: false },
];

async function loadRows() {
  const response = await getPools();
  return [...(response.data || [])].sort((left, right) => left.poolid.localeCompare(right.poolid));
}
</script>

<template>
  <SimpleTablePage :columns="columns" :load-rows="loadRows" row-key="poolid" />
</template>
