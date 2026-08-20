<script setup lang="ts">
import { computed, ref, shallowRef, watch } from 'vue';
import { getNodeDns, updateNodeDns, type PveNodeDns } from '@/api/host';
import UWindow from '@/components/UWindow.vue';
import { gettext } from '@/locale';
import { useSessionStore } from '@/stores/session';

const props = defineProps<{ node: string }>();
const session = useSessionStore();
const dns = shallowRef<PveNodeDns>({});
const form = ref<PveNodeDns>({});
const visible = shallowRef(false);
const saving = shallowRef(false);
const canAudit = computed(() => Boolean((session.caps as { nodes?: Record<string, unknown> }).nodes?.['Sys.Audit']));
const canModify = computed(() => Boolean((session.caps as { nodes?: Record<string, unknown> }).nodes?.['Sys.Modify']));
const rows = computed(() => [
  { label: gettext('Search domain'), value: dns.value.search || '-' },
  { label: `${gettext('DNS server')} 1`, value: dns.value.dns1 || '-' },
  { label: `${gettext('DNS server')} 2`, value: dns.value.dns2 || '-' },
  { label: `${gettext('DNS server')} 3`, value: dns.value.dns3 || '-' },
]);
let loadId = 0;
async function load() {
  const node = props.node;
  const id = ++loadId;
  if (!node || !canAudit.value) { dns.value = {}; return; }
  const response = await getNodeDns(node);
  if (id === loadId && node === props.node) dns.value = response.data || {};
}
function openEditor() { form.value = { ...dns.value }; visible.value = true; }
function payload() {
  const result: Record<string, unknown> = {}; const deleted: string[] = [];
  for (const key of ['search', 'dns1', 'dns2', 'dns3'] as const) {
    const value = form.value[key]?.trim() || '';
    if (value) result[key] = value; else if (dns.value[key] !== undefined) deleted.push(key);
  }
  if (deleted.length) result.delete = deleted.join(',');
  return result;
}
async function save() { if (!props.node) return; saving.value = true; try { await updateNodeDns(props.node, payload()); visible.value = false; await load(); } finally { saving.value = false; } }
watch([() => props.node, canAudit], () => { visible.value = false; void load(); }, { immediate: true });
</script>
<template>
  <template v-if="canAudit">
    <div v-if="canModify" class="row items-center q-mb-sm"><q-btn no-caps outline size="12px" color="primary" class="u-button" :label="gettext('Edit')" @click="openEditor" /></div>
    <div v-for="item in rows" :key="item.label" class="system-info-row"><span>{{ item.label }}</span><strong>{{ item.value }}</strong></div>
  </template>
  <div v-else class="text-grey-7">{{ gettext('No Data') }}</div>
  <q-dialog v-model="visible" persistent transition-show="scale" transition-hide="scale"><UWindow :title="`${gettext('Edit')}: DNS`" width="560px" :loading="saving"><q-form class="q-pa-md u-dense" @submit.prevent="save"><div class="u-border q-pa-md"><q-input v-model="form.search" dense outlined :label="gettext('Search domain')" /><q-input v-model="form.dns1" dense outlined class="q-mt-md" :label="`${gettext('DNS server')} 1`" /><q-input v-model="form.dns2" dense outlined class="q-mt-md" :label="`${gettext('DNS server')} 2`" /><q-input v-model="form.dns3" dense outlined class="q-mt-md" :label="`${gettext('DNS server')} 3`" /></div></q-form><template #foot><q-btn v-close-popup no-caps outline size="12px" class="u-button" :disable="saving" :label="gettext('Cancel')" /><q-btn no-caps flat size="12px" class="bg-primary text-grey-1 u-button" :loading="saving" :label="gettext('Save')" @click="save" /></template></UWindow></q-dialog>
</template>
<style scoped>.system-info-row { display:flex; justify-content:space-between; gap:24px; min-height:44px; padding:11px 0; border-bottom:1px solid #eef1f6; font-size:12px; }.system-info-row span { color:#666; }.system-info-row strong { color:#333; font-weight:600; text-align:right; }</style>
