<script setup lang="ts">
import type { QTableColumn } from 'quasar';
import SimpleTablePage from '@/components/SimpleTablePage.vue';
import { getRoles, type PveRecord } from '@/api/resources';
import { gettext } from '@/locale';
import { yesNo } from '@/utils/format';

defineProps<{
  embedded?: boolean;
}>();

const columns: QTableColumn<PveRecord>[] = [
  {
    name: 'special',
    label: gettext('Built-In'),
    align: 'left',
    field: (row) => yesNo(row.special),
    sortable: true,
  },
  {
    name: 'roleid',
    required: true,
    label: gettext('Name'),
    align: 'left',
    field: 'roleid',
    sortable: true,
  },
  { name: 'privs', label: gettext('Privileges'), align: 'left', field: 'privs', sortable: false },
];

async function loadRows() {
  const response = await getRoles();
  return [...(response.data || [])].sort((left, right) => left.roleid.localeCompare(right.roleid));
}
</script>

<template>
  <SimpleTablePage :columns="columns" :load-rows="loadRows" row-key="roleid" :embedded="embedded" />
</template>
