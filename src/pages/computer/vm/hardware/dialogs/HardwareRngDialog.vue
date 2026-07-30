<script setup lang="ts">
import { reactive, watch } from 'vue';
import UWindow from '@/components/UWindow.vue';
import { gettext } from '@/locale';
import { useVmHardwareContext } from '../context/vmHardwareContext';
const visible = defineModel<boolean>({ default: false });
const form = reactive({ source: '/dev/urandom', maxBytes: '1024', period: '' });
const { config, hasVmCapability, loading, updateConfig } = useVmHardwareContext();
watch(visible, (open) => { if (open) Object.assign(form, { source: '/dev/urandom', maxBytes: '1024', period: '' }); });
async function save() { if (!hasVmCapability('VM.Config.HWType') || config.value.rng0) return; const v = [`source=${form.source}`]; if (form.maxBytes.trim()) v.push(`max_bytes=${form.maxBytes.trim()}`); if (form.period.trim()) v.push(`period=${form.period.trim()}`); await updateConfig({ rng0: v.join(',') }); visible.value = false; }
</script>
<template><q-dialog v-model="visible" persistent><UWindow :title="gettext('VirtIO RNG')" width="440px" :loading="loading"><div class="q-pa-md q-gutter-md"><q-select v-model="form.source" dense square outlined :options="['/dev/urandom','/dev/random','/dev/hwrng']" :label="gettext('Entropy source')" /><q-input v-model="form.maxBytes" dense square outlined type="number" min="0" :label="gettext('Limit (Bytes/Period)')" /><q-input v-model="form.period" dense square outlined type="number" min="1" :label="`${gettext('Period')} (ms)`" /></div><template #foot><q-btn v-close-popup no-caps outline size="12px" class="u-button" :label="gettext('Cancel')" /><q-btn no-caps flat size="12px" class="bg-primary text-grey-1 u-button" :label="gettext('Add')" @click="save" /></template></UWindow></q-dialog></template>
