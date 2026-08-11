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
      { name: 'ip', label: gettext('IPv4'), field: 'ip', align: 'left' },
      {
        name: 'network_type',
        label: gettext('Network Type'),
        field: 'network_type',
        align: 'left',
      },
    ]"
    :pagination="{ rowsPerPage: 0 }"
    ><template #body-cell-ip="scope"
      ><q-td :props="scope"
        ><q-input
          v-model="scope.row.ip"
          dense
          borderless
          :disable="Boolean(scope.row.cidr)" /></q-td></template
    ><template #body-cell-network_type="scope"
      ><q-td :props="scope"
        ><q-select
          v-model="scope.row.network_type"
          dense
          borderless
          emit-value
          map-options
          :options="['broadcast', 'non-broadcast', 'point-to-multipoint', 'point-to-point']"
          placeholder="auto" /></q-td></template
  ></q-table>
</template>
