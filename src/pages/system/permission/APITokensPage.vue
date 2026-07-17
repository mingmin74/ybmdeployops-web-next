<script setup lang="ts">
import type { QTableColumn } from 'quasar';
import SimpleTablePage from '@/components/SimpleTablePage.vue';
import { getApiTokens, type PveRecord } from '@/api/resources';
import { gettext } from '@/locale';
import { formatDate, yesNo } from '@/utils/format';

defineProps<{
  embedded?: boolean;
}>();

const columns: QTableColumn<PveRecord>[] = [
  {
    name: 'username',
    required: true,
    label: gettext('Username'),
    align: 'left',
    field: 'userid',
    sortable: true,
  },
  {
    name: 'tokenid',
    required: true,
    label: gettext('Tokenid'),
    align: 'left',
    field: 'tokenid',
    sortable: true,
  },
  {
    name: 'expire',
    label: gettext('Expire'),
    align: 'left',
    field: (row) => formatDate(row.expire),
    sortable: true,
  },
  { name: 'comment', label: gettext('Comment'), align: 'left', field: 'comment', sortable: true },
  {
    name: 'privsep',
    required: true,
    label: gettext('Privilege Separation'),
    align: 'left',
    field: (row) => yesNo(row.privsep),
    sortable: true,
  },
];

function toText(value: unknown) {
  if (typeof value === 'string' || typeof value === 'number') {
    return String(value);
  }
  return '';
}

async function loadRows() {
  const response = await getApiTokens();
  return [...(response.data || [])].sort((left, right) =>
    toText(left.userid).localeCompare(toText(right.userid)),
  );
}
</script>

<template>
  <SimpleTablePage
    :columns="columns"
    :load-rows="loadRows"
    row-key="tokenid"
    :embedded="embedded"
  />
</template>
