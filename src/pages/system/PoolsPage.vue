<script setup lang="ts">
import { Dialog, type QTableColumn } from 'quasar';
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { createPool, getPool, getPools, removePool, updatePool, type PvePool } from '@/api/resources';
import { gettext } from '@/locale';

defineProps<{ embedded?: boolean }>();
type Action = 'add' | 'edit';
type PoolForm = { action: Action; poolid: string; comment: string };
const loading = ref(false);
const dialogLoading = ref(false);
const filter = ref('');
const pools = ref<PvePool[]>([]);
const selectedPools = ref<PvePool[]>([]);
const dialogVisible = ref(false);
const poolidRef = ref();
const formData = reactive<PoolForm>({ action: 'add', poolid: '', comment: '' });
const selectedPool = computed(() => selectedPools.value[0]);
const canEdit = computed(() => selectedPools.value.length === 1);
const dialogTitle = computed(() => `${gettext(formData.action === 'add' ? 'Create' : 'Edit')}: ${gettext('Pool')}`);
const filteredPools = computed(() => {
  const key = filter.value.trim().toLowerCase();
  return key ? pools.value.filter((pool) => [pool.poolid, pool.comment || ''].join(' ').toLowerCase().includes(key)) : pools.value;
});
const columns: QTableColumn<PvePool>[] = [
  { name: 'poolid', required: true, label: gettext('Name'), align: 'left', field: 'poolid', sortable: true },
  { name: 'comment', label: gettext('Comment'), align: 'left', field: 'comment', sortable: false },
];
function resetForm(action: Action) { Object.assign(formData, { action, poolid: '', comment: '' }); }
function requiredRule(value: string) { return value ? true : gettext('This field is required'); }
function rowClick(_: Event, row: PvePool) { selectedPools.value = [row]; }
async function reload() {
  loading.value = true;
  try {
    const response = await getPools();
    pools.value = [...(response.data || [])].sort((a, b) => a.poolid.localeCompare(b.poolid));
    selectedPools.value = selectedPool.value ? pools.value.filter((pool) => pool.poolid === selectedPool.value?.poolid) : [];
  } finally { loading.value = false; }
}
async function openDialog(action: Action) {
  resetForm(action);
  dialogVisible.value = true;
  if (action === 'edit' && selectedPool.value) {
    dialogLoading.value = true;
    try {
      const response = await getPool(selectedPool.value.poolid);
      const data = Array.isArray(response.data) ? response.data[0] : response.data;
      formData.poolid = selectedPool.value.poolid;
      formData.comment = data?.comment || '';
    } finally { dialogLoading.value = false; }
  }
}
async function submit() {
  if (dialogLoading.value || poolidRef.value?.validate?.() === false) return;
  dialogLoading.value = true;
  try {
    if (formData.action === 'add') await createPool({ poolid: formData.poolid, comment: formData.comment });
    else if (selectedPool.value) await updatePool(selectedPool.value.poolid, { comment: formData.comment });
    dialogVisible.value = false;
    await reload();
  } finally { dialogLoading.value = false; }
}
function confirmRemove() {
  if (!selectedPool.value) return;
  Dialog.create({ title: gettext('Confirm'), message: gettext('Are you sure to delete [%s]?').replace('%s', selectedPool.value.poolid), html: true, cancel: { flat: true, label: gettext('Cancel') }, ok: { flat: true, label: gettext('Confirm'), color: 'primary' }, persistent: true }).onOk(() => void removeSelected());
}
async function removeSelected() {
  if (!selectedPool.value) return;
  loading.value = true;
  try { await removePool(selectedPool.value.poolid); selectedPools.value = []; await reload(); } finally { loading.value = false; }
}
watch(dialogVisible, (visible) => { if (!visible) resetForm('add'); });
onMounted(() => void reload());
defineExpose({ reload });
</script>

<template>
  <q-card class="no-border-radius no-shadow" :class="embedded ? 'q-ma-none' : 'q-ma-md q-mt-sm'">
    <q-card-section :class="embedded ? 'q-pa-none' : undefined">
      <q-table v-model:selected="selectedPools" flat selection="single" hide-selected-banner row-key="poolid" table-header-class="u-table-header" :rows="filteredPools" :columns="columns" :pagination="{ page: 1, rowsPerPage: 10 }" :rows-per-page-options="[10]" :loading="loading" :no-data-label="gettext('no record can be found')" @row-click="rowClick" @row-dblclick="() => canEdit && openDialog('edit')">
        <template #top><div class="q-gutter-sm"><q-btn no-caps outline size="12px" color="primary" class="u-button" :label="gettext('Create')" @click="openDialog('add')" /><q-btn no-caps outline size="12px" class="u-button" :color="canEdit ? 'primary' : 'grey'" :disable="!canEdit" :label="gettext('Edit')" @click="openDialog('edit')" /><q-btn no-caps outline size="12px" class="u-button" :color="canEdit ? 'red' : 'grey'" :disable="!canEdit" :label="gettext('Remove')" @click="confirmRemove" /></div><q-space /><q-input v-model="filter" borderless dense debounce="300" :placeholder="gettext('Search')"><template #append><q-icon name="search" /></template></q-input></template>
        <template #body-cell-comment="props"><q-td :props="props"><div class="text-overflow simple-comment" :title="props.value">{{ props.value }}</div></q-td></template>
      </q-table>
    </q-card-section>
    <q-dialog v-model="dialogVisible" persistent transition-show="scale" transition-hide="scale"><q-card class="u-window-card pool-dialog-card"><q-card-section class="row items-center bg-blue-8 text-grey-1 shadow-down-10 q-pa-sm"><q-spinner-bars size="14px" color="white" /><div class="text-weight-bold q-mx-sm text-overflow">{{ dialogTitle }}</div><q-space /><q-btn v-close-popup class="bg-negative" icon="close" size="sm" flat dense /></q-card-section><q-card-section class="q-pa-none u-hidden-error"><div class="u-border q-ma-sm q-pa-md column dialog-body"><q-input ref="poolidRef" v-model="formData.poolid" dense autofocus :disable="formData.action !== 'add'" :label="`${gettext('Name')} *`" :rules="[requiredRule]" /><q-input v-model="formData.comment" dense class="q-field--with-bottom" :label="gettext('Comment')" /><q-inner-loading :showing="dialogLoading" /></div></q-card-section><q-card-actions align="right" class="bg-grey-2 overflow-hidden"><q-btn no-caps flat size="12px" :disable="dialogLoading" :label="gettext('OK')" :class="dialogLoading ? 'bg-grey-4 text-grey-6 u-button' : 'bg-primary text-grey-1 u-button'" @click="submit" /></q-card-actions></q-card></q-dialog>
  </q-card>
</template>

<style scoped>
.simple-comment { max-width: 700px; }
.u-window-card { border-radius: 0; }
.pool-dialog-card { width: 400px; max-width: 400px; }
.dialog-body { position: relative; }
</style>
