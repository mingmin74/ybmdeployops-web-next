<script setup lang="ts">
import { reactive, watch } from 'vue';
import type { PveRecord } from '@/api/resources';
import UWindow from '@/components/UWindow.vue';
import { gettext } from '@/locale';
import { textValue } from '@/utils/pveFormat';
import { useVmHardwareContext } from '../context/vmHardwareContext';

const visible = defineModel<boolean>({ default: false });
const form = reactive({
  sevType: '__default__',
  sevDebug: true,
  sevKeySharing: true,
  sevSmt: true,
  sevKernelHashes: false,
  tdxType: '__default__',
  tdxAttestation: true,
  tdxCid: '2',
  tdxPort: '4050',
});
const { config, hasVmCapability, loading, updateConfig } = useVmHardwareContext();

function parsePropertyString(value: unknown) {
  return Object.fromEntries(
    textValue(value)
      .split(',')
      .filter(Boolean)
      .map((part) => {
        const [key, ...rest] = part.split('=');
        return [key, rest.join('=') || '1'];
      }),
  );
}

watch(visible, (isVisible) => {
  if (!isVisible) return;
  const sev = parsePropertyString(config.value['amd-sev']);
  const tdx = parsePropertyString(config.value['intel-tdx']);
  form.sevType = ['std', 'es', 'snp'].includes(String(sev.type || '')) ? String(sev.type) : '__default__';
  form.sevDebug = String(sev['no-debug'] || '0') !== '1';
  form.sevKeySharing = String(sev['no-key-sharing'] || '0') !== '1';
  form.sevSmt = String(sev['allow-smt'] || '1') !== '0';
  form.sevKernelHashes = String(sev['kernel-hashes'] || '0') === '1';
  form.tdxType = String(tdx.type || '') === 'tdx' ? 'tdx' : '__default__';
  form.tdxAttestation = String(tdx.attestation || '1') !== '0';
  form.tdxCid = String(tdx['vsock-cid'] || '2');
  form.tdxPort = String(tdx['vsock-port'] || '4050');
});

async function saveConfidentialComputing() {
  if (!hasVmCapability('VM.Config.HWType')) return;
  const data: PveRecord = {};
  const deleted: string[] = [];
  if (form.sevType === '__default__') deleted.push('amd-sev');
  else {
    const values = [`type=${form.sevType}`];
    if (!form.sevDebug) values.push('no-debug=1');
    if (form.sevType === 'snp' && !form.sevSmt) values.push('allow-smt=0');
    if (form.sevType !== 'snp' && !form.sevKeySharing) values.push('no-key-sharing=1');
    if (form.sevKernelHashes) values.push('kernel-hashes=1');
    data['amd-sev'] = values.join(',');
  }
  if (form.tdxType === '__default__') deleted.push('intel-tdx');
  else
    data['intel-tdx'] = [
      'type=tdx',
      `attestation=${form.tdxAttestation ? 1 : 0}`,
      ...(form.tdxAttestation
        ? [`vsock-cid=${form.tdxCid || '2'}`, `vsock-port=${form.tdxPort || '4050'}`]
        : []),
    ].join(',');
  if (deleted.length) data.delete = deleted.join(',');
  await updateConfig(data);
  visible.value = false;
}
</script>

<template>
  <q-dialog v-model="visible" persistent>
    <UWindow :title="gettext('Confidential Computing')" width="580px" :loading="loading">
      <div class="q-pa-md q-gutter-md">
        <q-select
          v-model="form.sevType"
          dense
          square
          outlined
          emit-value
          map-options
          :label="gettext('AMD SEV Type')"
          :options="[
            { label: `${gettext('Default')} (${gettext('Disabled')})`, value: '__default__' },
            { label: 'AMD SEV', value: 'std' },
            { label: 'AMD SEV-ES', value: 'es' },
            { label: 'AMD SEV-SNP', value: 'snp' },
          ]"
        />
        <div v-if="form.sevType !== '__default__'" class="q-gutter-sm">
          <q-checkbox v-model="form.sevDebug" :label="gettext('Allow Debugging')" />
          <q-checkbox v-if="form.sevType !== 'snp'" v-model="form.sevKeySharing" :label="gettext('Allow Key-Sharing')" />
          <q-checkbox v-if="form.sevType === 'snp'" v-model="form.sevSmt" :label="gettext('Allow SMT')" />
          <q-checkbox v-model="form.sevKernelHashes" :label="gettext('Enable Kernel Hashes')" />
        </div>
        <q-separator />
        <q-select
          v-model="form.tdxType"
          dense
          square
          outlined
          emit-value
          map-options
          :label="gettext('Intel TDX Type')"
          :options="[
            { label: `${gettext('Default')} (${gettext('Disabled')})`, value: '__default__' },
            { label: 'Intel TDX', value: 'tdx' },
          ]"
        />
        <template v-if="form.tdxType === 'tdx'">
          <q-checkbox v-model="form.tdxAttestation" :label="gettext('Enable Attestation')" />
          <div class="row q-col-gutter-md">
            <q-input v-model="form.tdxCid" class="col-6" dense square outlined type="number" min="2" :disable="!form.tdxAttestation" label="CID" />
            <q-input v-model="form.tdxPort" class="col-6" dense square outlined type="number" min="0" :disable="!form.tdxAttestation" :label="gettext('Port')" />
          </div>
        </template>
      </div>
      <template #foot>
        <q-btn v-close-popup no-caps outline size="12px" class="u-button" :label="gettext('Cancel')" />
        <q-btn no-caps flat size="12px" class="bg-primary text-grey-1 u-button" :label="gettext('Save')" @click="saveConfidentialComputing" />
      </template>
    </UWindow>
  </q-dialog>
</template>
