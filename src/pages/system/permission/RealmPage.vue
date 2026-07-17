<script setup lang="ts">
import type { QTableColumn } from 'quasar';
import SimpleTablePage from '@/components/SimpleTablePage.vue';
import { getRealms, type PveRecord } from '@/api/resources';
import { gettext } from '@/locale';

defineProps<{
  embedded?: boolean;
}>();

const columns: QTableColumn<PveRecord>[] = [
  {
    name: 'realm',
    required: true,
    label: gettext('Realm'),
    align: 'left',
    field: 'realm',
    sortable: true,
  },
  { name: 'type', label: gettext('Type'), align: 'left', field: 'type', sortable: true },
  { name: 'comment', label: gettext('Comment'), align: 'left', field: 'comment', sortable: false },
];

async function loadRows() {
  const response = await getRealms();
  return [...(response.data || [])].sort((left, right) => left.realm.localeCompare(right.realm));
}
</script>

<template>
  <SimpleTablePage :columns="columns" :load-rows="loadRows" row-key="realm" :embedded="embedded" />
</template>
