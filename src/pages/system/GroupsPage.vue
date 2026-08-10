<script setup lang="ts">
import { Dialog } from 'quasar';
import type { QTableColumn } from 'quasar';
import { computed, onMounted, reactive, ref, watch } from 'vue';
import {
  createGroup,
  getGroup,
  getGroups,
  removeGroup,
  updateGroup,
  type EditGroupPayload,
  type PveGroup,
} from '@/api/users';
import { gettext } from '@/locale';

defineProps<{
  embedded?: boolean;
}>();

type GroupFormAction = 'add' | 'edit';

type GroupFormModel = {
  action: GroupFormAction;
  groupid: string;
  comment: string;
};

const loading = ref(false);
const dialogLoading = ref(false);
const filter = ref('');
const groups = ref<PveGroup[]>([]);
const selectedGroups = ref<PveGroup[]>([]);
const dialogVisible = ref(false);
const groupidRef = ref();

const formData = reactive<GroupFormModel>(createDefaultForm());
const selectedGroup = computed(() => selectedGroups.value[0]);
const canEdit = computed(() => selectedGroups.value.length === 1);
const canRemove = computed(() => selectedGroups.value.length === 1);
const dialogTitle = computed(
  () => `${gettext(formData.action === 'add' ? 'Add' : 'Edit')}: ${gettext('Group')}`,
);
const filteredGroups = computed(() => {
  const keyword = filter.value.trim().toLowerCase();
  if (!keyword) return groups.value;

  return groups.value.filter((item) =>
    [item.groupid, item.comment || ''].join(' ').toLowerCase().includes(keyword),
  );
});

const tableColumns: QTableColumn<PveGroup>[] = [
  {
    name: 'groupid',
    required: true,
    label: gettext('Group Name'),
    align: 'left',
    field: 'groupid',
    sortable: true,
  },
  {
    name: 'comment',
    label: gettext('Comment'),
    align: 'left',
    field: 'comment',
    sortable: false,
  },
];
const visibleColumns = ['groupid', 'comment'];

function createDefaultForm(): GroupFormModel {
  return {
    action: 'add',
    groupid: '',
    comment: '',
  };
}

function resetForm(action: GroupFormAction) {
  Object.assign(formData, createDefaultForm(), { action });
}

function groupNameRules(value: string) {
  if (!value) return gettext('This field is required');
  return /^[a-zA-Z][a-zA-Z0-9\-_.]{0,30}[a-zA-Z0-9]$/.test(value)
    ? true
    : gettext('Allowed name characters are letters, numbers, "-", "_" and "."');
}

function rowClick(_: Event, row: PveGroup) {
  selectedGroups.value = selectedGroup.value === row ? [] : [row];
}

function sortByGroupid(items: PveGroup[]) {
  return [...items].sort((left, right) => left.groupid.localeCompare(right.groupid));
}

async function loadGroupsData() {
  loading.value = true;
  try {
    const response = await getGroups();
    groups.value = sortByGroupid(response.data || []);
    selectedGroups.value = selectedGroup.value
      ? groups.value.filter((item) => item.groupid === selectedGroup.value?.groupid)
      : [];
  } finally {
    loading.value = false;
  }
}

async function openDialog(action: GroupFormAction) {
  resetForm(action);
  dialogVisible.value = true;

  if (action === 'edit' && selectedGroup.value) {
    dialogLoading.value = true;
    try {
      const response = await getGroup(selectedGroup.value.groupid);
      formData.groupid = selectedGroup.value.groupid;
      formData.comment = response.data?.comment || '';
    } finally {
      dialogLoading.value = false;
    }
  }
}

function buildPayload(): EditGroupPayload {
  return {
    groupid: formData.groupid,
    comment: formData.comment,
  };
}

async function submitGroupForm() {
  if (dialogLoading.value || groupidRef.value?.validate?.() === false) return;

  dialogLoading.value = true;
  try {
    const payload = buildPayload();
    if (formData.action === 'add') {
      await createGroup(payload);
    } else if (selectedGroup.value) {
      await updateGroup(selectedGroup.value.groupid, { comment: formData.comment });
    }

    dialogVisible.value = false;
    await loadGroupsData();
  } finally {
    dialogLoading.value = false;
  }
}

function confirmRemoveGroup() {
  if (!selectedGroup.value) return;

  Dialog.create({
    title: gettext('Confirm'),
    message: gettext('Are you sure to delete [%s]?').replace('%s', selectedGroup.value.groupid),
    html: true,
    cancel: { flat: true, label: gettext('Cancel') },
    ok: { flat: true, label: gettext('Confirm'), color: 'primary' },
    persistent: true,
  }).onOk(() => {
    void removeSelectedGroup();
  });
}

async function removeSelectedGroup() {
  if (!selectedGroup.value) return;

  loading.value = true;
  try {
    await removeGroup(selectedGroup.value.groupid);
    selectedGroups.value = [];
    await loadGroupsData();
  } finally {
    loading.value = false;
  }
}

watch(dialogVisible, (visible) => {
  if (!visible) {
    resetForm('add');
  }
});

onMounted(() => {
  void loadGroupsData();
});
</script>

<template>
  <q-card
    class="no-border-radius no-shadow groups-page-card"
    :class="embedded ? 'q-ma-none' : 'q-ma-md q-mt-sm'"
  >
    <q-card-section :class="embedded ? 'q-pa-none' : undefined">
      <q-table
        v-model:selected="selectedGroups"
        flat
        selection="single"
        hide-selected-banner
        row-key="groupid"
        table-header-class="u-table-header"
        :rows="filteredGroups"
        :columns="tableColumns"
        :visible-columns="visibleColumns"
        :pagination="{ page: 1, rowsPerPage: 10 }"
        :rows-per-page-options="[10]"
        :loading="loading"
        :no-data-label="gettext('no record can be found')"
        @row-click="rowClick"
      >
        <template #top>
          <div class="q-gutter-sm">
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
              class="u-button"
              :color="canEdit ? 'primary' : 'grey'"
              :disable="!canEdit"
              :label="gettext('Edit')"
              @click="openDialog('edit')"
            />
            <q-btn
              no-caps
              outline
              size="12px"
              class="u-button"
              :color="canRemove ? 'red' : 'grey'"
              :disable="!canRemove"
              :label="gettext('Remove')"
              @click="confirmRemoveGroup"
            />
          </div>
          <q-space />
          <q-input
            v-model="filter"
            borderless
            dense
            debounce="300"
            :placeholder="gettext('Search')"
          >
            <template #append>
              <q-icon name="search" />
            </template>
          </q-input>
        </template>

        <template #body-cell-comment="props">
          <q-td :props="props">
            <div class="groups-comment text-overflow" :title="props.value">
              {{ props.value }}
            </div>
          </q-td>
        </template>

        <template #no-data="{ message }">
          <div class="full-width row flex-center text-accent q-gutter-sm">
            <span class="text-grey-6">{{ message }}</span>
          </div>
        </template>
      </q-table>
    </q-card-section>

    <q-dialog v-model="dialogVisible" persistent transition-show="scale" transition-hide="scale">
      <q-card class="u-window-card groups-dialog-card">
        <q-card-section class="row items-center bg-blue-8 text-grey-1 shadow-down-10 q-pa-sm">
          <q-spinner-bars size="14px" color="white" />
          <div class="text-weight-bold q-mx-sm text-overflow">{{ dialogTitle }}</div>
          <q-space />
          <q-btn v-close-popup class="bg-negative" icon="close" size="sm" flat dense />
        </q-card-section>
        <q-card-section class="q-pa-none u-hidden-error">
          <div class="u-border q-ma-sm q-pa-md column dialog-body">
            <q-input
              ref="groupidRef"
              v-model="formData.groupid"
              dense
              autofocus
              :disable="formData.action !== 'add'"
              :label="`${gettext('Group Name')} *`"
              :rules="[groupNameRules]"
            />
            <q-input
              v-model="formData.comment"
              dense
              class="q-field--with-bottom"
              :label="gettext('Comment')"
            />
            <q-inner-loading :showing="dialogLoading" />
          </div>
        </q-card-section>
        <q-card-actions align="right" class="bg-grey-2 overflow-hidden">
          <q-btn
            no-caps
            flat
            size="12px"
            :disable="dialogLoading"
            :label="gettext('OK')"
            :class="
              dialogLoading ? 'bg-grey-4 text-grey-6 u-button' : 'bg-primary text-grey-1 u-button'
            "
            @click="submitGroupForm"
          />
        </q-card-actions>
      </q-card>
    </q-dialog>
  </q-card>
</template>

<style scoped>
.groups-page-card {
  position: relative;
}

.groups-comment {
  max-width: 700px;
}

.u-window-card {
  border-radius: 0;
}

.groups-dialog-card {
  width: 400px;
  max-width: 400px;
}

.dialog-body {
  position: relative;
}
</style>
