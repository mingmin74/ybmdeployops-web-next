<script setup lang="ts">
import type { QTableColumn } from 'quasar';
import { Dialog } from 'quasar';
import { onMounted, ref, shallowRef, watch } from 'vue';
import UWindow from '@/components/UWindow.vue';
import type { PveRecord } from '@/api/resources';
import {
  createFirewallGroup,
  createFirewallGroupRule,
  deleteFirewallGroup,
  deleteFirewallGroupRule,
  getFirewallGroupRules,
  getFirewallGroups,
} from '@/api/firewall';
import { gettext } from '@/locale';
import { textValue } from '@/utils/pveFormat';

const loading = ref(false);
const ruleLoading = ref(false);
const selectedGroup = ref<PveRecord[]>([]);
const selectedRule = ref<PveRecord[]>([]);
const groups = shallowRef<PveRecord[]>([]);
const rules = shallowRef<PveRecord[]>([]);
const groupDialog = ref(false);
const ruleDialog = ref(false);
const groupForm = ref<Record<string, string | number | null | undefined>>({});
const ruleForm = ref<Record<string, string | number | null | undefined>>({});

const groupColumns: QTableColumn<PveRecord>[] = [
  { name: 'group', required: true, label: gettext('Group'), align: 'left', field: (row) => row.group || '-', sortable: true },
  { name: 'comment', label: gettext('Comment'), align: 'left', field: (row) => row.comment || '-', sortable: true },
];

const ruleColumns: QTableColumn<PveRecord>[] = [
  { name: 'enable', label: gettext('Enable'), align: 'left', field: (row) => (row.enable ? gettext('Yes') : gettext('No')), sortable: true },
  { name: 'type', label: gettext('Type'), align: 'left', field: (row) => row.type || '-', sortable: true },
  { name: 'action', label: gettext('Action'), align: 'left', field: (row) => row.action || '-', sortable: true },
  { name: 'macro', label: gettext('Macro'), align: 'left', field: (row) => row.macro || '-', sortable: true },
  { name: 'proto', label: gettext('Protocol'), align: 'left', field: (row) => row.proto || '-', sortable: true },
  { name: 'dport', label: gettext('Dest. port'), align: 'left', field: (row) => row.dport || '-', sortable: true },
  { name: 'comment', label: gettext('Comment'), align: 'left', field: (row) => row.comment || '-', sortable: true },
];

async function refreshGroups() {
  loading.value = true;
  try {
    const response = await getFirewallGroups();
    groups.value = response.data || [];
    selectedGroup.value = groups.value[0] ? [groups.value[0]] : [];
  } finally {
    loading.value = false;
  }
}

async function refreshRules() {
  const group = textValue(selectedGroup.value[0]?.group);
  if (!group) {
    rules.value = [];
    return;
  }
  ruleLoading.value = true;
  try {
    const response = await getFirewallGroupRules(group);
    rules.value = response.data || [];
    selectedRule.value = [];
  } finally {
    ruleLoading.value = false;
  }
}

function removeGroup() {
  const group = textValue(selectedGroup.value[0]?.group);
  if (!group) return;
  Dialog.create({ title: gettext('Confirm'), message: gettext('Are you sure to delete [%s]?').replace('%s', group), cancel: true, persistent: true }).onOk(() => {
    loading.value = true;
    void deleteFirewallGroup(group).then(refreshGroups).finally(() => {
      loading.value = false;
    });
  });
}

function removeRule() {
  const group = textValue(selectedGroup.value[0]?.group);
  const pos = textValue(selectedRule.value[0]?.pos);
  if (!group || !pos) return;
  Dialog.create({ title: gettext('Confirm'), message: gettext('Are you sure to delete [%s]?').replace('%s', pos), cancel: true, persistent: true }).onOk(() => {
    ruleLoading.value = true;
    void deleteFirewallGroupRule(group, pos).then(refreshRules).finally(() => {
      ruleLoading.value = false;
    });
  });
}

async function submitGroup() {
  loading.value = true;
  try {
    await createFirewallGroup(groupForm.value);
    groupDialog.value = false;
    await refreshGroups();
  } finally {
    loading.value = false;
  }
}

async function submitRule() {
  const group = textValue(selectedGroup.value[0]?.group);
  if (!group) return;
  ruleLoading.value = true;
  try {
    await createFirewallGroupRule(group, ruleForm.value);
    ruleDialog.value = false;
    await refreshRules();
  } finally {
    ruleLoading.value = false;
  }
}

watch(selectedGroup, refreshRules);
onMounted(refreshGroups);
</script>

<template>
  <div class="row q-col-gutter-md">
    <div class="col-4">
      <q-table flat row-key="group" table-header-class="u-table-header" selection="single" :rows="groups" :columns="groupColumns" :selected="selectedGroup" :loading="loading" :pagination="{ page: 1, rowsPerPage: 10 }" :rows-per-page-options="[10]" @update:selected="selectedGroup = [...$event]">
        <template #top><div class="row q-gutter-sm"><q-btn no-caps outline size="12px" color="primary" class="u-button" :label="gettext('Add')" @click="groupForm = {}; groupDialog = true" /><q-btn no-caps outline size="12px" :color="selectedGroup.length !== 1 ? 'grey' : 'red'" class="u-button" :disable="selectedGroup.length !== 1" :label="gettext('Remove')" @click="removeGroup" /><q-btn no-caps outline size="12px" color="primary" class="u-button" :label="gettext('Refresh')" @click="refreshGroups" /></div></template>
      </q-table>
    </div>
    <div class="col-8">
      <q-table flat row-key="pos" table-header-class="u-table-header" selection="single" :rows="rules" :columns="ruleColumns" :selected="selectedRule" :loading="ruleLoading" :pagination="{ page: 1, rowsPerPage: 10 }" :rows-per-page-options="[10]" @update:selected="selectedRule = [...$event]">
        <template #top><div class="row q-gutter-sm"><q-btn no-caps outline size="12px" color="primary" class="u-button" :disable="selectedGroup.length !== 1" :label="gettext('Add')" @click="ruleForm = { enable: 1, type: 'in', action: 'ACCEPT' }; ruleDialog = true" /><q-btn no-caps outline size="12px" :color="selectedRule.length !== 1 ? 'grey' : 'red'" class="u-button" :disable="selectedRule.length !== 1" :label="gettext('Remove')" @click="removeRule" /></div></template>
      </q-table>
    </div>
    <q-dialog v-model="groupDialog" persistent>
      <UWindow :title="gettext('Add')" width="420px" :loading="loading">
        <div class="q-pa-md q-gutter-sm"><q-input v-model="groupForm.group" square outlined dense :label="gettext('Group')" /><q-input v-model="groupForm.comment" square outlined dense :label="gettext('Comment')" /></div>
        <template #foot><q-btn v-close-popup no-caps flat size="12px" class="u-button" :label="gettext('Cancel')" /><q-btn no-caps flat size="12px" class="bg-primary text-grey-1 u-button" :label="gettext('OK')" @click="submitGroup" /></template>
      </UWindow>
    </q-dialog>
    <q-dialog v-model="ruleDialog" persistent>
      <UWindow :title="gettext('Add')" width="560px" :loading="ruleLoading">
        <div class="q-pa-md row q-col-gutter-sm"><q-select v-model="ruleForm.type" class="col-6" square outlined dense :label="gettext('Type')" :options="['in', 'out']" /><q-select v-model="ruleForm.action" class="col-6" square outlined dense :label="gettext('Action')" :options="['ACCEPT', 'DROP', 'REJECT']" /><q-input v-model="ruleForm.macro" class="col-6" square outlined dense :label="gettext('Macro')" /><q-input v-model="ruleForm.proto" class="col-6" square outlined dense :label="gettext('Protocol')" /><q-input v-model="ruleForm.dport" class="col-6" square outlined dense :label="gettext('Dest. port')" /><q-input v-model="ruleForm.comment" class="col-6" square outlined dense :label="gettext('Comment')" /><q-checkbox v-model="ruleForm.enable" class="col-12" :true-value="1" :false-value="0" :label="gettext('Enable')" /></div>
        <template #foot><q-btn v-close-popup no-caps flat size="12px" class="u-button" :label="gettext('Cancel')" /><q-btn no-caps flat size="12px" class="bg-primary text-grey-1 u-button" :label="gettext('OK')" @click="submitRule" /></template>
      </UWindow>
    </q-dialog>
  </div>
</template>
