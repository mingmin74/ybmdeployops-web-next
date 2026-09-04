<script setup lang="ts">
import { computed, shallowRef, watch } from 'vue';
import { createCluster, joinCluster } from '@/api/cluster';
import UWindow from '@/components/UWindow.vue';
import { gettext } from '@/locale';
import type { PveRecord } from '@/api/resources';

type Mode = 'create' | 'information' | 'join' | null;
const mode = defineModel<Mode>({ required: true });
const props = defineProps<{ joinInfo: PveRecord }>();
const emit = defineEmits<{ task: [upid: string, title: string] }>();
const clusterName = shallowRef('');
const serializedInfo = shallowRef('');
const hostname = shallowRef('');
const password = shallowRef('');
const fingerprint = shallowRef('');
const link0 = shallowRef('');
const link1 = shallowRef('');
const saving = shallowRef(false);
const parseError = shallowRef(false);
const preferred = computed(() => (Array.isArray(props.joinInfo.nodelist) ? props.joinInfo.nodelist as PveRecord[] : []).find((row) => row.name === props.joinInfo.preferred_node) || {});
const encodedJoinInfo = computed(() => btoa(JSON.stringify({ ipAddress: preferred.value.pve_addr || '', fingerprint: preferred.value.pve_fp || '', ring_addr: [preferred.value.ring0_addr, preferred.value.ring1_addr].filter(Boolean), totem: props.joinInfo.totem || {} })));
const canCreate = computed(() => /^[A-Za-z0-9][A-Za-z0-9-]{0,14}$/.test(clusterName.value));
const canJoin = computed(() => !!hostname.value && !!password.value && !!fingerprint.value && !parseError.value);

function parseJoinInfo() {
  parseError.value = false;
  if (!serializedInfo.value) return;
  try {
    const info = JSON.parse(atob(serializedInfo.value.trim())) as { ipAddress?: string; fingerprint?: string; ring_addr?: string[] };
    hostname.value = info.ipAddress || '';
    fingerprint.value = info.fingerprint || '';
    link0.value = info.ring_addr?.[0] || '';
    link1.value = info.ring_addr?.[1] || '';
  } catch { parseError.value = true; }
}
async function submitCreate() { if (!canCreate.value) return; saving.value = true; try { const response = await createCluster({ clustername: clusterName.value }); mode.value = null; if (response.data) emit('task', response.data, gettext('Create Cluster')); } finally { saving.value = false; } }
async function submitJoin() { if (!canJoin.value) return; saving.value = true; try { const response = await joinCluster({ hostname: hostname.value, password: password.value, fingerprint: fingerprint.value, link0: link0.value, link1: link1.value }); mode.value = null; if (response.data) emit('task', response.data, gettext('Join Cluster')); } finally { saving.value = false; } }
async function copyInfo() { await navigator.clipboard?.writeText(encodedJoinInfo.value); }
watch(mode, (value) => { if (value === 'create') clusterName.value = ''; if (value === 'join') { serializedInfo.value = ''; hostname.value = ''; password.value = ''; fingerprint.value = ''; link0.value = ''; link1.value = ''; parseError.value = false; } });
</script>

<template>
  <q-dialog :model-value="mode === 'create'" persistent transition-show="scale" transition-hide="scale" @update:model-value="!$event && (mode = null)"><UWindow :title="gettext('Create Cluster')" width="460px" :loading="saving"><div class="q-pa-md"><q-input v-model="clusterName" dense maxlength="15" class="q-field--with-bottom" :label="gettext('Cluster Name')" :error="!!clusterName && !canCreate" /></div><template #foot><q-btn no-caps flat size="12px" :label="gettext('Cancel')" @click="mode = null" /><q-btn no-caps flat size="12px" class="bg-primary text-grey-1 u-button" :disable="!canCreate" :loading="saving" :label="gettext('Create Cluster')" @click="submitCreate" /></template></UWindow></q-dialog>
  <q-dialog :model-value="mode === 'information'" persistent transition-show="scale" transition-hide="scale" @update:model-value="!$event && (mode = null)"><UWindow :title="gettext('Cluster Join Information')" width="760px"><div class="q-pa-md q-gutter-sm"><div class="text-caption text-grey-8">{{ gettext('Copy the Join Information here and use it on the node you want to add.') }}</div><q-input dense readonly class="q-field--with-bottom" :model-value="String(preferred.pve_addr || '')" :label="gettext('IP Address')" /><q-input dense readonly class="q-field--with-bottom" :model-value="String(preferred.pve_fp || '')" :label="gettext('Fingerprint')" /><q-input dense readonly type="textarea" rows="5" class="q-field--with-bottom join-information-value" input-style="overflow-wrap:anywhere; word-break:break-all; white-space:pre-wrap" :model-value="encodedJoinInfo" :label="gettext('Join Information')" /></div><template #foot><q-btn no-caps flat size="12px" :label="gettext('Close')" @click="mode = null" /><q-btn no-caps flat size="12px" class="bg-primary text-grey-1 u-button" :label="gettext('Copy Information')" @click="copyInfo" /></template></UWindow></q-dialog>
  <q-dialog :model-value="mode === 'join'" persistent transition-show="scale" transition-hide="scale" @update:model-value="!$event && (mode = null)"><UWindow :title="gettext('Cluster Join')" width="760px" :loading="saving"><div class="q-pa-md"><q-input v-model="serializedInfo" dense type="textarea" autogrow class="q-field--with-bottom" :label="gettext('Join Information')" :error="parseError" :error-message="gettext('Does not seem like a valid encoded Cluster Information!')" @update:model-value="parseJoinInfo" /><div class="row q-col-gutter-lg"><q-input v-model="hostname" dense class="q-field--with-bottom col" :label="gettext('Peer Address')" /><q-input v-model="password" dense type="password" class="q-field--with-bottom col" :label="gettext('Password')" /></div><q-input v-model="fingerprint" dense class="q-field--with-bottom" :label="gettext('Fingerprint')" /><div class="row q-col-gutter-lg"><q-input v-model="link0" dense class="q-field--with-bottom col" :label="gettext('Link 0')" /><q-input v-model="link1" dense class="q-field--with-bottom col" :label="gettext('Link 1')" /></div></div><template #foot><q-btn no-caps flat size="12px" :label="gettext('Cancel')" @click="mode = null" /><q-btn no-caps flat size="12px" class="bg-primary text-grey-1 u-button" :disable="!canJoin" :loading="saving" :label="gettext('Join')" @click="submitJoin" /></template></UWindow></q-dialog>
</template>

<style scoped>
:deep(.join-information-value textarea) {
  max-width: 100%;
  overflow-wrap: anywhere;
  word-break: break-all;
}
</style>
