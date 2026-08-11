<script setup lang="ts">
import type { PveRecord } from '@/api/resources';
import { gettext } from '@/locale';
const rows = defineModel<PveRecord[]>('rows', { required: true });
const selected = defineModel<PveRecord[]>('selected', { required: true });
</script>
<template>
  <q-table flat bordered dense row-key="name" selection="multiple" :rows="rows" :selected="selected"
    @update:selected="selected = [...$event]" :columns="[
      { name: 'name', label: gettext('Name'), field: 'name', align: 'left' },
      { name: 'type', label: gettext('Type'), field: 'type', align: 'left' },
      { name: 'ip', label: gettext('IPv4'), field: 'ip', align: 'left' },
      { name: 'ip6', label: gettext('IPv6'), field: 'ip6', align: 'left' },
      {
        name: 'hello_multiplier',
        label: gettext('Hello Multiplier'),
        field: 'hello_multiplier',
        align: 'left',
      },
    ]" :pagination="{ rowsPerPage: 0 }"><template #body-cell-ip="scope"><q-td :props="scope"><q-input
          v-model="scope.row.ip" dense borderless :disable="Boolean(scope.row.cidr)" /></q-td></template><template
      #body-cell-ip6="scope"><q-td :props="scope"><q-input v-model="scope.row.ip6" dense borderless
          :disable="Boolean(scope.row.cidr6)" /></q-td></template><template #body-cell-hello_multiplier="scope"><q-td
        :props="scope"><q-input v-model="scope.row.hello_multiplier" dense borderless type="number"
          placeholder="10" /></q-td></template></q-table>
</template>
