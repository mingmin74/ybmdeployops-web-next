<script setup lang="ts">
import type { QTableColumn } from 'quasar';
import { Dialog } from 'quasar';
import { computed, onMounted, ref, shallowRef } from 'vue';
import UWindow from '@/components/UWindow.vue';
import FirewallRulesPage from './FirewallRulesPage.vue';
import type { PveRecord } from '@/api/resources';
import {
  createFirewallGroup,
  deleteFirewallGroup,
  getFirewallGroups,
  updateFirewallGroup,
} from '@/api/firewall';
import { gettext } from '@/locale';
import { textValue } from '@/utils/pveFormat';

const loading = shallowRef(false);
const selected = ref<PveRecord[]>([]);
const groups = shallowRef<PveRecord[]>([]);
const dialog = shallowRef(false);
const editing = shallowRef(false);
const form = ref<Record<string, string | number | undefined>>({});
const originalName = shallowRef('');

const selectedGroup = computed(() => selected.value[0] || groups.value[0]);
const rulesBaseUrl = computed(() => {
  const group = textValue(selectedGroup.value?.group);
  return group ? `/cluster/firewall/groups/${encodeURIComponent(group)}` : '';
});
const columns: QTableColumn<PveRecord>[] = [
  {
    name: 'group',
    required: true,
    label: gettext('Group'),
    align: 'left',
    field: (row) => row.group || '-',
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

async function refreshGroups() {
  loading.value = true;
  try {
    groups.value = (await getFirewallGroups()).data || [];
    const current = groups.value.find(
      (item) => textValue(item.group) === textValue(selectedGroup.value?.group)
    );
    selected.value = current ? [current] : groups.value[0] ? [groups.value[0]] : [];
  } finally {
    loading.value = false;
  }
}

function openDialog(mode: 'add' | 'edit') {
  editing.value = mode === 'edit';
  const record = selectedGroup.value;
  originalName.value = textValue(record?.group);
  form.value = editing.value
    ? {
        group: originalName.value,
        comment: textValue(record?.comment),
        digest: textValue(record?.digest),
      }
    : { group: '', comment: '' };
  dialog.value = true;
}

async function submitForm() {
  const group = textValue(form.value.group);
  if (!group) return;
  loading.value = true;
  try {
    if (editing.value) {
      await updateFirewallGroup({ ...form.value, rename: originalName.value });
    } else {
      await createFirewallGroup(form.value);
    }
    dialog.value = false;
    await refreshGroups();
  } finally {
    loading.value = false;
  }
}

function removeSelected() {
  const record = selectedGroup.value;
  const group = textValue(record?.group);
  if (!group) return;
  Dialog.create({
    title: gettext('Confirm'),
    message: gettext('Are you sure to delete [%s]?').replace('%s', group),
    cancel: true,
    persistent: true,
  }).onOk(() => {
    loading.value = true;
    void deleteFirewallGroup(group, record?.digest)
      .then(refreshGroups)
      .finally(() => {
        loading.value = false;
      });
  });
}

onMounted(() => {
  void refreshGroups();
});
</script>

<template>
  <div class="row q-col-gutter-md">
    <div class="col-4">
      <q-table
        flat
        row-key="group"
        table-header-class="u-table-header"
        selection="single"
        :rows="groups"
        :columns="columns"
        :selected="selected"
        :loading="loading"
        :pagination="{ page: 1, rowsPerPage: 10 }"
        :rows-per-page-options="[10]"
        @update:selected="selected = [...$event]"
        @row-click="(_, row) => (selected = [row])"
        @row-dblclick="
          (_, row) => {
            selected = [row];
            openDialog('edit');
          }
        "
      >
        <template #top>
          <div class="row q-gutter-sm">
            <q-btn
              no-caps
              outline
              size="12px"
              color="primary"
              class="u-button"
              :label="gettext('Add')"
              @click="openDialog('add')"
            />
            <q-btn
              no-caps
              outline
              size="12px"
              color="primary"
              class="u-button"
              :disable="!selectedGroup"
              :label="gettext('Edit')"
              @click="openDialog('edit')"
            />
            <q-btn
              no-caps
              outline
              size="12px"
              :color="selectedGroup ? 'red' : 'grey'"
              class="u-button"
              :disable="!selectedGroup"
              :label="gettext('Remove')"
              @click="removeSelected"
            />
            <q-btn
              no-caps
              outline
              size="12px"
              color="primary"
              class="u-button"
              :label="gettext('Refresh')"
              @click="refreshGroups"
            />
          </div>
        </template>
      </q-table>
    </div>
    <div class="col-8">
      <FirewallRulesPage
        v-if="rulesBaseUrl"
        :base-url="rulesBaseUrl"
        firewall-type="group"
        :allow-groups="false"
        list-refs-url="/cluster/firewall/refs"
      />
    </div>
    <q-dialog
      v-model="dialog"
      persistent
      transition-show="scale"
      transition-hide="scale"
    >
      <UWindow
        :title="gettext(editing ? 'Edit' : 'Add')"
        width="420px"
        :loading="loading"
      >
        <div class="u-border q-ma-sm q-pa-md u-dense">
          <q-input
            v-model="form.group"
            dense
            class="q-field--with-bottom"
            :label="gettext('Group')"
            :rules="[(value) => !!value || gettext('This field is required')]"
          />
          <q-input
            v-model="form.comment"
            dense
            class="q-field--with-bottom"
            :label="gettext('Comment')"
          />
        </div>
        <template #foot>
          <q-btn
            v-close-popup
            no-caps
            flat
            size="12px"
            class="u-button"
            :label="gettext('Cancel')"
          />
          <q-btn
            no-caps
            flat
            size="12px"
            class="bg-primary text-grey-1 u-button"
            :disable="!form.group"
            :label="gettext('OK')"
            @click="submitForm"
          />
        </template>
      </UWindow>
    </q-dialog>
  </div>
</template>
