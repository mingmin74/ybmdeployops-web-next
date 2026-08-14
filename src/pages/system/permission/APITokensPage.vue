<script setup lang="ts">
import { Dialog, Notify, type QTableColumn } from 'quasar';
import { computed, onMounted, reactive, shallowRef } from 'vue';
import { getApiTokens, type PveRecord } from '@/api/resources';
import { createApiToken, getUsers, removeApiToken, updateApiToken } from '@/api/users';
import UWindow from '@/components/UWindow.vue';
import GrantedPermissionsDialog from './GrantedPermissionsDialog.vue';
import { gettext } from '@/locale';
import { useSessionStore } from '@/stores/session';
import { formatDate, yesNo } from '@/utils/format';

type TokenRow = { id: string; userid: string; tokenid: string; expire?: number; comment?: string; privsep: boolean };
type UserOption = { label: string; value: string; name: string; comment: string };
const { embedded = false } = defineProps<{ embedded?: boolean }>();
const session = useSessionStore();
const loading = shallowRef(false); const selected = shallowRef<TokenRow[]>([]); const rows = shallowRef<TokenRow[]>([]);
const editorVisible = shallowRef(false); const secretVisible = shallowRef(false); const editing = shallowRef(false); const secret = shallowRef('');
const permissionsVisible = shallowRef(false);
const fullTokenId = shallowRef('');
const userOptions = shallowRef<UserOption[]>([]);
const filteredUserOptions = shallowRef<UserOption[]>([]);
const form = reactive({ userid: '', tokenid: '', privsep: true, expire: '', comment: '' });
const selectedRow = computed(() => selected.value[0]);
const canModify = computed(() => Boolean((session.caps.access as Record<string, unknown> | undefined)?.['User.Modify']));
const canManageSelected = computed(() => Boolean(selectedRow.value && (canModify.value || selectedRow.value.userid === session.userid)));
const columns: QTableColumn<TokenRow>[] = [
  { name: 'userid', label: gettext('Username'), field: 'userid', align: 'left', sortable: true },
  { name: 'tokenid', label: gettext('Token Name'), field: 'tokenid', align: 'left', sortable: true },
  { name: 'expire', label: gettext('Expire'), field: row => formatDate(row.expire), align: 'left' },
  { name: 'comment', label: gettext('Comment'), field: 'comment', align: 'left' },
  { name: 'privsep', label: gettext('Privilege Separation'), field: row => yesNo(row.privsep), align: 'left' },
];
function resetForm() { Object.assign(form, { userid: session.userid, tokenid: '', privsep: true, expire: '', comment: '' }); }
function fillForm(row: TokenRow) { Object.assign(form, { userid: row.userid, tokenid: row.tokenid, privsep: row.privsep, expire: row.expire ? new Date(row.expire * 1000).toISOString().slice(0, 10) : '', comment: row.comment || '' }); }
function payload() { return { privsep: form.privsep ? 1 as const : 0 as const, expire: form.expire ? Math.floor(new Date(form.expire).getTime() / 1000) : 0, comment: form.comment }; }
async function reload() { loading.value = true; try { const response = await getApiTokens(); rows.value = (response.data || []).flatMap(user => Array.isArray(user.tokens) ? (user.tokens as PveRecord[]).map(token => ({ id: `${String(user.userid)}!${String(token.tokenid)}`, userid: String(user.userid), tokenid: String(token.tokenid), expire: Number(token.expire) || 0, comment: String(token.comment || ''), privsep: Number(token.privsep) === 1 })) : []).sort((a,b) => a.id.localeCompare(b.id)); } finally { loading.value = false; } }
async function loadUserOptions() { const response = await getUsers(); const users = (response.data || []).filter((user) => user.enable !== 0 && user.enable !== false).map((user) => ({ label: user.userid, value: user.userid, name: `${user.firstname || ''} ${user.lastname || ''}`.trim(), comment: user.comment || '' })); if (session.userid && !users.some((user) => user.value === session.userid)) users.unshift({ label: session.userid, value: session.userid, name: '', comment: '' }); userOptions.value = users; filteredUserOptions.value = users; }
function filterUserOptions(value: string, update: (callback: () => void) => void) { update(() => { const keyword = value.trim().toLowerCase(); filteredUserOptions.value = !keyword ? userOptions.value : userOptions.value.filter((user) => [user.value, user.name, user.comment].join(' ').toLowerCase().includes(keyword)); }); }
async function openAdd() { resetForm(); editing.value = false; editorVisible.value = true; await loadUserOptions(); }
function openEdit() { if (!selectedRow.value || !canManageSelected.value) return; fillForm(selectedRow.value); editing.value = true; editorVisible.value = true; }
async function save() { if (!form.userid || form.tokenid.length < 2) { Notify.create({ type: 'warning', message: gettext('Token ID must be at least 2 characters long.') }); return; } loading.value = true; try { const result = editing.value ? await updateApiToken(form.userid, form.tokenid, payload()) : await createApiToken(form.userid, form.tokenid, payload()); editorVisible.value = false; if (!editing.value && result.data?.value) { secret.value = result.data.value; fullTokenId.value = result.data['full-tokenid'] || `${form.userid}!${form.tokenid}`; secretVisible.value = true; } await reload(); } finally { loading.value = false; } }
function remove() { const row = selectedRow.value; if (!row || !canManageSelected.value) return; Dialog.create({ title: gettext('Remove'), message: gettext('Are you sure you want to remove this?'), cancel: true }).onOk(() => void (async () => { await removeApiToken(row.userid, row.tokenid); await reload(); })()); }
function regenerate() { const row = selectedRow.value; if (!row || !canManageSelected.value) return; Dialog.create({ title: gettext('Regenerate Secret'), message: gettext('The old secret will immediately become invalid.'), cancel: true }).onOk(() => void (async () => { const result = await updateApiToken(row.userid, row.tokenid, { regenerate: 1 }); secret.value = result.data?.value || ''; fullTokenId.value = result.data?.['full-tokenid'] || row.id; secretVisible.value = Boolean(secret.value); await reload(); })()); }
async function copySecret() { await navigator.clipboard?.writeText(secret.value); Notify.create({ type: 'positive', message: gettext('Copied') }); }
function openGrantedPermissions() { if (selectedRow.value) permissionsVisible.value = true; }
onMounted(() => void reload()); defineExpose({ reload });
</script>
<template><q-card class="no-border-radius no-shadow" :class="embedded ? 'q-ma-none' : 'q-ma-md'"><q-card-section><q-table v-model:selected="selected" flat selection="single" row-key="id" :rows="rows" :columns="columns" :loading="loading" @row-dblclick="openEdit"><template #top><q-btn no-caps outline color="primary" :label="gettext('Add')" @click="openAdd"/><q-btn no-caps outline class="q-ml-sm" :disable="!canManageSelected" :label="gettext('Edit')" @click="openEdit"/><q-btn no-caps outline class="q-ml-sm" color="negative" :disable="!canManageSelected" :label="gettext('Remove')" @click="remove"/><q-btn no-caps outline class="q-ml-sm" :disable="!canManageSelected" :label="gettext('Regenerate Secret')" @click="regenerate"/><q-btn no-caps outline class="q-ml-sm" :disable="!selectedRow" :label="gettext('Show Permissions')" @click="openGrantedPermissions"/><q-space/><q-btn flat icon="refresh" :loading="loading" @click="reload"/></template></q-table></q-card-section>
<q-dialog v-model="editorVisible" persistent><UWindow width="420px" :title="`${gettext(editing ? 'Edit' : 'Add')}: ${gettext('API Token')}`"><div class="q-pa-md u-dense"><q-select v-if="!editing" v-model="form.userid" dense use-input fill-input hide-selected emit-value map-options :options="filteredUserOptions" :label="`${gettext('User')} *`" @filter="filterUserOptions"><template #option="scope"><q-item v-bind="scope.itemProps"><q-item-section><q-item-label>{{ scope.opt.value }}</q-item-label><q-item-label caption>{{ scope.opt.name || gettext('None') }} · {{ scope.opt.comment || gettext('None') }}</q-item-label></q-item-section></q-item></template></q-select><q-input v-else v-model="form.userid" dense disable :label="gettext('User')"/><q-input v-model="form.tokenid" dense :disable="editing" :label="`${gettext('Token ID')} *`" hint="minimum 2 characters"/><q-checkbox v-model="form.privsep" :label="gettext('Privilege Separation')"/><q-input v-model="form.expire" dense type="date" :label="gettext('Expire')"/><q-input v-model="form.comment" dense :label="gettext('Comment')"/></div><template #foot><q-btn no-caps color="primary" :label="gettext('OK')" @click="save"/></template></UWindow></q-dialog>
<q-dialog v-model="secretVisible" persistent><UWindow width="460px" :title="gettext('Token Secret')"><div class="q-pa-md"><p>{{ gettext('Please record the API token secret - it will only be displayed now') }}</p><q-input :model-value="fullTokenId" readonly :label="gettext('Token ID')"/><q-input :model-value="secret" readonly type="textarea" :label="gettext('Secret')"/></div><template #foot><q-btn no-caps color="primary" :label="gettext('Copy Secret Value')" @click="copySecret"/></template></UWindow></q-dialog><GrantedPermissionsDialog v-model="permissionsVisible" :userid="selectedRow ? `${selectedRow.userid}!${selectedRow.tokenid}` : ''" /></q-card></template>
