<script setup lang="ts">
import type { QTableColumn } from 'quasar';
import { Dialog } from 'quasar';
import { computed, onMounted, ref, shallowRef } from 'vue';
import type { PveRecord } from '@/api/resources';
import {
  createNodeFirewallRule,
  deleteNodeFirewallRule,
  getFirewallGroups,
  getNodeFirewallRules,
  updateNodeFirewallRule,
} from '@/api/firewall';
import UWindow from '@/components/UWindow.vue';
import { gettext } from '@/locale';
import { textValue } from '@/utils/pveFormat';

type FirewallRuleForm = Record<string, string | number | undefined>;

const { node } = defineProps<{ node: string }>();
const loading = shallowRef(false);
const dialog = shallowRef(false);
const mode = shallowRef<'add' | 'copy' | 'edit' | 'group'>('add');
const selected = ref<PveRecord[]>([]);
const rows = shallowRef<PveRecord[]>([]);
const groups = shallowRef<PveRecord[]>([]);
const form = ref<FirewallRuleForm>({});
const selectedRule = computed(() => selected.value[0]);
const isGroup = computed(() => mode.value === 'group');
const columns: QTableColumn<PveRecord>[] = [
  {
    name: 'enable',
    label: gettext('Enable'),
    align: 'left',
    field: (row) => row.enable,
    sortable: true,
  },
  {
    name: 'type',
    label: gettext('Type'),
    align: 'left',
    field: (row) => row.type || '-',
    sortable: true,
  },
  {
    name: 'action',
    label: gettext('Action'),
    align: 'left',
    field: (row) => row.action || '-',
    sortable: true,
  },
  {
    name: 'macro',
    label: gettext('Macro'),
    align: 'left',
    field: (row) => row.macro || '-',
    sortable: true,
  },
  {
    name: 'iface',
    label: gettext('Interface'),
    align: 'left',
    field: (row) => row.iface || '-',
    sortable: true,
  },
  {
    name: 'source',
    label: gettext('Source'),
    align: 'left',
    field: (row) => row.source || '-',
    sortable: true,
  },
  {
    name: 'dest',
    label: gettext('Destination'),
    align: 'left',
    field: (row) => row.dest || '-',
    sortable: true,
  },
  {
    name: 'proto',
    label: gettext('Protocol'),
    align: 'left',
    field: (row) => row.proto || '-',
    sortable: true,
  },
  {
    name: 'dport',
    label: gettext('Dest. port'),
    align: 'left',
    field: (row) => row.dport || '-',
    sortable: true,
  },
  {
    name: 'sport',
    label: gettext('Source port'),
    align: 'left',
    field: (row) => row.sport || '-',
    sortable: true,
  },
  {
    name: 'log',
    label: gettext('Log level'),
    align: 'left',
    field: (row) => row.log || '-',
    sortable: true,
  },
  {
    name: 'comment',
    label: gettext('Comment'),
    align: 'left',
    field: (row) => row.comment || '-',
    sortable: true,
  },
];

async function refreshData() {
  loading.value = true;
  try {
    rows.value = (await getNodeFirewallRules(node)).data || [];
    selected.value = [];
  } finally {
    loading.value = false;
  }
}
async function openDialog(nextMode: typeof mode.value) {
  mode.value = nextMode;
  form.value =
    nextMode === 'group'
      ? { type: 'group', action: '', enable: 1, iface: '', comment: '' }
      : nextMode === 'add'
        ? {
            type: 'in',
            action: 'ACCEPT',
            enable: 1,
            macro: '',
            iface: '',
            source: '',
            dest: '',
            proto: '',
            sport: '',
            dport: '',
            log: 'nolog',
            comment: '',
          }
        : Object.fromEntries(
            Object.entries(selectedRule.value || {}).map(([key, value]) => [
              key,
              value == null ? '' : textValue(value),
            ]),
          );
  if (nextMode === 'copy') {
    delete form.value.pos;
    delete form.value.digest;
  }
  if (nextMode === 'group') groups.value = (await getFirewallGroups()).data || [];
  dialog.value = true;
}
async function submitForm() {
  loading.value = true;
  try {
    if (mode.value === 'edit')
      await updateNodeFirewallRule(node, textValue(form.value.pos), form.value);
    else await createNodeFirewallRule(node, form.value);
    dialog.value = false;
    await refreshData();
  } finally {
    loading.value = false;
  }
}
async function setEnabled(enable: number) {
  const row = selectedRule.value;
  if (!row) return;
  loading.value = true;
  try {
    await updateNodeFirewallRule(node, textValue(row.pos), { enable, digest: row.digest });
    await refreshData();
  } finally {
    loading.value = false;
  }
}
function removeSelected() {
  const row = selectedRule.value;
  if (!row) return;
  Dialog.create({
    title: gettext('Confirm'),
    message: gettext('Are you sure to delete [%s]?').replace('%s', textValue(row.pos)),
    cancel: true,
    persistent: true,
  }).onOk(() => {
    void deleteNodeFirewallRule(node, textValue(row.pos), row.digest).then(refreshData);
  });
}
onMounted(refreshData);
</script>

<template>
  <div class="q-ma-sm node-firewall-rules">
    <q-table
      flat
      row-key="pos"
      table-header-class="u-table-header"
      selection="single"
      :rows="rows"
      :columns="columns"
      :selected="selected"
      :loading="loading"
      :rows-per-page-options="[0]"
      :no-data-label="gettext('no record can be found')"
      @update:selected="selected = [...$event]"
    >
      <template #top
        ><div class="row q-gutter-sm">
          <q-btn
            no-caps
            outline
            size="12px"
            color="primary"
            class="u-button"
            :label="gettext('Add')"
            @click="openDialog('add')"
          /><q-btn
            no-caps
            outline
            size="12px"
            :color="selected.length === 1 && selectedRule?.type !== 'group' ? 'primary' : 'grey'"
            class="u-button"
            :disable="selected.length !== 1 || selectedRule?.type === 'group'"
            :label="gettext('Copy')"
            @click="openDialog('copy')"
          /><q-btn
            no-caps
            outline
            size="12px"
            color="primary"
            class="u-button"
            :label="gettext('Insert')"
            @click="openDialog('group')"
          /><q-btn
            no-caps
            outline
            size="12px"
            :color="selected.length === 1 ? 'primary' : 'grey'"
            class="u-button"
            :disable="selected.length !== 1"
            :label="gettext('Edit')"
            @click="openDialog('edit')"
          /><q-btn
            no-caps
            outline
            size="12px"
            :color="selected.length === 1 && !selectedRule?.enable ? 'primary' : 'grey'"
            class="u-button"
            :disable="selected.length !== 1 || Boolean(selectedRule?.enable)"
            :label="gettext('Enable')"
            @click="setEnabled(1)"
          /><q-btn
            no-caps
            outline
            size="12px"
            :color="selected.length === 1 && Boolean(selectedRule?.enable) ? 'red' : 'grey'"
            class="u-button"
            :disable="selected.length !== 1 || !selectedRule?.enable"
            :label="gettext('Disable')"
            @click="setEnabled(0)"
          /><q-btn
            no-caps
            outline
            size="12px"
            :color="selected.length === 1 ? 'red' : 'grey'"
            class="u-button"
            :disable="selected.length !== 1"
            :label="gettext('Remove')"
            @click="removeSelected"
          /><q-btn
            no-caps
            outline
            size="12px"
            color="primary"
            class="u-button"
            :label="gettext('Refresh')"
            @click="refreshData"
          /></div
      ></template>
      <template #body-cell-enable="scope"
        ><q-td :props="scope"
          ><q-badge
            :color="scope.value ? 'green' : 'red'"
            :label="scope.value ? gettext('Enabled') : gettext('Disabled')" /></q-td
      ></template>
    </q-table>
    <q-dialog v-model="dialog" persistent transition-show="scale" transition-hide="scale"
      ><UWindow
        :title="
          gettext(
            mode === 'edit' ? 'Edit Rule' : mode === 'group' ? 'Insert Security Group' : 'Add Rule',
          )
        "
        width="620px"
        :loading="loading"
        ><div class="q-pa-md row q-col-gutter-md u-hidden-error">
          <template v-if="isGroup"
            ><q-select
              v-model="form.action"
              class="col-12"
              square
              outlined
              dense
              options-dense
              emit-value
              map-options
              :label="gettext('Security Group')"
              :options="
                groups.map((group) => ({
                  label: textValue(group.group),
                  value: textValue(group.group),
                }))
              " /><q-input
              v-model="form.iface"
              class="col-6"
              square
              outlined
              dense
              :label="gettext('Interface')" /><q-input
              v-model="form.comment"
              class="col-6"
              square
              outlined
              dense
              :label="gettext('Comment')" /></template
          ><template v-else
            ><q-select
              v-model="form.type"
              class="col-6"
              square
              outlined
              dense
              options-dense
              emit-value
              map-options
              :label="gettext('Direction')"
              :options="[
                { label: gettext('In'), value: 'in' },
                { label: gettext('Out'), value: 'out' },
              ]" /><q-select
              v-model="form.action"
              class="col-6"
              square
              outlined
              dense
              :label="gettext('Action')"
              :options="['ACCEPT', 'DROP', 'REJECT']" /><q-input
              v-model="form.macro"
              class="col-6"
              square
              outlined
              dense
              :label="gettext('Macro')" /><q-input
              v-model="form.iface"
              class="col-6"
              square
              outlined
              dense
              :label="gettext('Interface')" /><q-input
              v-model="form.source"
              class="col-6"
              square
              outlined
              dense
              :label="gettext('Source')" /><q-input
              v-model="form.dest"
              class="col-6"
              square
              outlined
              dense
              :label="gettext('Destination')" /><q-input
              v-model="form.proto"
              class="col-4"
              square
              outlined
              dense
              :label="gettext('Protocol')" /><q-input
              v-model="form.sport"
              class="col-4"
              square
              outlined
              dense
              :label="gettext('Source port')" /><q-input
              v-model="form.dport"
              class="col-4"
              square
              outlined
              dense
              :label="gettext('Dest. port')" /><q-select
              v-model="form.log"
              class="col-6"
              square
              outlined
              dense
              :label="gettext('Log level')"
              :options="[
                'nolog',
                'emerg',
                'alert',
                'crit',
                'err',
                'warning',
                'notice',
                'info',
                'debug',
              ]" /><q-input
              v-model="form.comment"
              class="col-6"
              square
              outlined
              dense
              :label="gettext('Comment')" /></template
          ><q-checkbox
            v-model="form.enable"
            class="col-12"
            :true-value="1"
            :false-value="0"
            :label="gettext('Enable')"
          />
        </div>
        <template #foot
          ><q-btn
            v-close-popup
            no-caps
            flat
            size="12px"
            class="u-button"
            :label="gettext('Cancel')" /><q-btn
            no-caps
            flat
            size="12px"
            class="bg-primary text-grey-1 u-button"
            :disable="isGroup && !form.action"
            :label="gettext('Save')"
            @click="submitForm" /></template></UWindow
    ></q-dialog>
  </div>
</template>
