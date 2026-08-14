<script setup lang="ts">
import { Dialog, type QTableColumn } from 'quasar';
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { createRole, getAvailablePrivileges, getRole, getRoles, removeRole, updateRole, type PveRole } from '@/api/resources';
import { gettext } from '@/locale';
import { yesNo } from '@/utils/format';

defineProps<{ embedded?: boolean }>();
type Action = 'add' | 'edit';
type RoleForm = { action: Action; roleid: string; privs: string[] };
const loading = ref(false);
const dialogLoading = ref(false);
const filter = ref('');
const roles = ref<PveRole[]>([]);
const selectedRoles = ref<PveRole[]>([]);
const privilegeOptions = ref<string[]>([]);
const dialogVisible = ref(false);
const roleidRef = ref();
const privsRef = ref();
const formData = reactive<RoleForm>({ action: 'add', roleid: '', privs: [] });
const selectedRole = computed(() => selectedRoles.value[0]);
const editableSelectedRole = computed(() => selectedRole.value && !selectedRole.value.special ? selectedRole.value : undefined);
const canEdit = computed(() => Boolean(editableSelectedRole.value));
const dialogTitle = computed(() => `${gettext(formData.action === 'add' ? 'Create' : 'Edit')}: ${gettext('Role')}`);
const filteredRoles = computed(() => {
  const key = filter.value.trim().toLowerCase();
  return key ? roles.value.filter((role) => [role.roleid, role.privs || ''].join(' ').toLowerCase().includes(key)) : roles.value;
});
const columns: QTableColumn<PveRole>[] = [
  { name: 'special', label: gettext('Built-In'), align: 'left', field: (row) => yesNo(row.special), sortable: true },
  { name: 'roleid', required: true, label: gettext('Name'), align: 'left', field: 'roleid', sortable: true },
  { name: 'privs', label: gettext('Privileges'), align: 'left', field: 'privs', sortable: false },
];
function resetForm(action: Action) { Object.assign(formData, { action, roleid: '', privs: [] }); }
function requiredRule(value: string) { return value ? true : gettext('This field is required'); }
function privilegesRule(value: string[]) { return value.length ? true : gettext('This field is required'); }
function rowClick(_: Event, row: PveRole) { selectedRoles.value = [row]; }
async function reload() {
  loading.value = true;
  try {
    const response = await getRoles();
    roles.value = [...(response.data || [])].sort((a, b) => a.roleid.localeCompare(b.roleid));
    selectedRoles.value = selectedRole.value ? roles.value.filter((role) => role.roleid === selectedRole.value?.roleid) : [];
  } finally { loading.value = false; }
}
async function loadPrivilegeOptions() {
  const response = await getAvailablePrivileges();
  privilegeOptions.value = Object.keys(response.data || {}).sort();
}
async function openDialog(action: Action) {
  if (action === 'edit' && !editableSelectedRole.value) return;
  resetForm(action);
  dialogVisible.value = true;
  dialogLoading.value = true;
  try {
    await loadPrivilegeOptions();
    if (action === 'edit' && editableSelectedRole.value) {
      const response = await getRole(editableSelectedRole.value.roleid);
      formData.roleid = editableSelectedRole.value.roleid;
      formData.privs = Object.keys(response.data || {}).sort();
    }
  } finally { dialogLoading.value = false; }
}
async function submit() {
  if (dialogLoading.value || roleidRef.value?.validate?.() === false || privsRef.value?.validate?.() === false) return;
  dialogLoading.value = true;
  try {
    const privs = formData.privs.join(',');
    if (formData.action === 'add') await createRole({ roleid: formData.roleid, privs });
    else if (editableSelectedRole.value) await updateRole(editableSelectedRole.value.roleid, { privs });
    dialogVisible.value = false;
    await reload();
  } finally { dialogLoading.value = false; }
}
function confirmRemove() {
  if (!editableSelectedRole.value) return;
  Dialog.create({ title: gettext('Confirm'), message: gettext('Are you sure to delete [%s]?').replace('%s', editableSelectedRole.value.roleid), html: true, cancel: { flat: true, label: gettext('Cancel') }, ok: { flat: true, label: gettext('Confirm'), color: 'primary' }, persistent: true }).onOk(() => void removeSelected());
}
async function removeSelected() {
  if (!editableSelectedRole.value) return;
  loading.value = true;
  try { await removeRole(editableSelectedRole.value.roleid); selectedRoles.value = []; await reload(); } finally { loading.value = false; }
}
watch(dialogVisible, (visible) => { if (!visible) resetForm('add'); });
onMounted(() => void reload());
defineExpose({ reload });
</script>

<template>
  <q-card class="no-border-radius no-shadow" :class="embedded ? 'q-ma-none' : 'q-ma-md q-mt-sm'">
    <q-card-section :class="embedded ? 'q-pa-none' : undefined">
      <q-table v-model:selected="selectedRoles" flat selection="single" hide-selected-banner row-key="roleid" table-header-class="u-table-header" :rows="filteredRoles" :columns="columns" :pagination="{ page: 1, rowsPerPage: 10 }" :rows-per-page-options="[10]" :loading="loading" :no-data-label="gettext('no record can be found')" @row-click="rowClick" @row-dblclick="() => canEdit && openDialog('edit')">
        <template #top><div class="q-gutter-sm"><q-btn no-caps outline size="12px" color="primary" class="u-button" :label="gettext('Create')" @click="openDialog('add')" /><q-btn no-caps outline size="12px" class="u-button" :color="canEdit ? 'primary' : 'grey'" :disable="!canEdit" :label="gettext('Edit')" @click="openDialog('edit')" /><q-btn no-caps outline size="12px" class="u-button" :color="canEdit ? 'red' : 'grey'" :disable="!canEdit" :label="gettext('Remove')" @click="confirmRemove" /></div><q-space /><q-input v-model="filter" borderless dense debounce="300" :placeholder="gettext('Search')"><template #append><q-icon name="search" /></template></q-input></template>
        <template #body-cell-privs="props"><q-td :props="props"><div class="role-privileges">{{ props.value ? String(props.value).replace(/,/g, ' ') : '-' }}</div></q-td></template>
      </q-table>
    </q-card-section>
    <q-dialog v-model="dialogVisible" persistent transition-show="scale" transition-hide="scale"><q-card class="u-window-card role-dialog-card"><q-card-section class="row items-center bg-blue-8 text-grey-1 shadow-down-10 q-pa-sm"><q-spinner-bars size="14px" color="white" /><div class="text-weight-bold q-mx-sm text-overflow">{{ dialogTitle }}</div><q-space /><q-btn v-close-popup class="bg-negative" icon="close" size="sm" flat dense /></q-card-section><q-card-section class="q-pa-none u-hidden-error"><div class="u-border q-ma-sm q-pa-md column dialog-body"><q-input ref="roleidRef" v-model="formData.roleid" dense autofocus :disable="formData.action !== 'add'" :label="`${gettext('Name')} *`" :rules="[requiredRule]" /><q-select ref="privsRef" v-model="formData.privs" dense multiple use-chips options-dense :options="privilegeOptions" :label="`${gettext('Privileges')} *`" :rules="[privilegesRule]" /><q-inner-loading :showing="dialogLoading" /></div></q-card-section><q-card-actions align="right" class="bg-grey-2 overflow-hidden"><q-btn no-caps flat size="12px" :disable="dialogLoading" :label="gettext('OK')" :class="dialogLoading ? 'bg-grey-4 text-grey-6 u-button' : 'bg-primary text-grey-1 u-button'" @click="submit" /></q-card-actions></q-card></q-dialog>
  </q-card>
</template>

<style scoped>
.u-window-card { border-radius: 0; }
.role-dialog-card { width: 400px; max-width: 400px; }
.dialog-body { position: relative; }
.role-privileges { white-space: normal; }
</style>
