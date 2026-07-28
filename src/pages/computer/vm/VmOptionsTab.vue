<script setup lang="ts">
import { computed, reactive, shallowRef, watch } from 'vue';
import { updateVmConfig } from '@/api/overview';
import type { PveRecord } from '@/api/resources';
import { gettext } from '@/locale';
import { useSessionStore } from '@/stores/session';

const props = defineProps<{ node: string; vmid: string; config: PveRecord }>();
const emit = defineEmits<{ updated: [] }>();
const session = useSessionStore();
const loading = shallowRef(false);
const form = reactive({
  name: '',
  description: '',
  onboot: false,
  protection: false,
  agent: false,
  acpi: true,
  kvm: true,
  tablet: true,
  hotplug: '',
  startup: '',
  ostype: 'other',
  boot: '',
  freeze: false,
  localtime: '__default__',
  startdate: 'now',
  vmstatestorage: '',
  smbios1: '',
  spiceFolderSharing: false,
  spiceVideoStreaming: 'off',
  sevType: '__default__',
  sevDebug: true,
  sevKeySharing: true,
  sevSmt: true,
  sevKernelHashes: false,
  tdxType: '__default__',
  tdxAttestation: true,
  tdxVsockCid: '2',
  tdxVsockPort: '4050',
});
const original = shallowRef({
  name: '',
  description: '',
  onboot: false,
  protection: false,
  agent: false,
  acpi: true,
  kvm: true,
  tablet: true,
  hotplug: '',
  startup: '',
  ostype: 'other',
  boot: '',
  freeze: false,
  localtime: '__default__',
  startdate: 'now',
  vmstatestorage: '',
  smbios1: '',
  spiceFolderSharing: false,
  spiceVideoStreaming: 'off',
  sevType: '__default__',
  sevDebug: true,
  sevKeySharing: true,
  sevSmt: true,
  sevKernelHashes: false,
  tdxType: '__default__',
  tdxAttestation: true,
  tdxVsockCid: '2',
  tdxVsockPort: '4050',
});
const canConfigureOptions = computed(() =>
  Boolean(
    (session.caps as unknown as { vms?: Record<string, unknown> }).vms?.['VM.Config.Options'],
  ),
);
const canConfigureHardware = computed(() =>
  Boolean((session.caps as unknown as { vms?: Record<string, unknown> }).vms?.['VM.Config.HWType']),
);
const hardwareFields = new Set([
  'smbios1',
  'sevType',
  'sevDebug',
  'sevKeySharing',
  'sevSmt',
  'sevKernelHashes',
  'tdxType',
  'tdxAttestation',
  'tdxVsockCid',
  'tdxVsockPort',
]);
const optionsChanged = computed(() =>
  Object.entries(form).some(
    ([key, value]) =>
      !hardwareFields.has(key) && value !== original.value[key as keyof typeof original.value],
  ),
);
const hardwareChanged = computed(() =>
  [...hardwareFields].some(
    (key) => form[key as keyof typeof form] !== original.value[key as keyof typeof original.value],
  ),
);
const canSave = computed(
  () =>
    (optionsChanged.value || hardwareChanged.value) &&
    (!optionsChanged.value || canConfigureOptions.value) &&
    (!hardwareChanged.value || canConfigureHardware.value),
);

function parseProperties(value: unknown) {
  const textValue = typeof value === 'string' || typeof value === 'number' ? String(value) : '';
  return Object.fromEntries(
    textValue
      .split(',')
      .filter(Boolean)
      .map((part) => {
        const [key, ...parts] = part.split('=');
        return [key, parts.join('=') || '1'];
      }),
  );
}

function syncForm() {
  const spiceEnhancements = parseProperties(props.config.spice_enhancements);
  const sev = parseProperties(props.config['amd-sev']);
  const tdx = parseProperties(props.config['intel-tdx']);
  const textValue = (value: unknown, fallback = '') =>
    typeof value === 'string' || typeof value === 'number' ? String(value) : fallback;
  const next = {
    name: textValue(props.config.name),
    description: textValue(props.config.description),
    onboot: Number(props.config.onboot || 0) === 1,
    protection: Number(props.config.protection || 0) === 1,
    agent: textValue(props.config.agent).includes('enabled=1'),
    acpi: Number(props.config.acpi ?? 1) === 1,
    kvm: Number(props.config.kvm ?? 1) === 1,
    tablet: Number(props.config.tablet ?? 1) === 1,
    hotplug: textValue(props.config.hotplug),
    startup: textValue(props.config.startup),
    ostype: textValue(props.config.ostype, 'other'),
    boot: textValue(props.config.boot),
    freeze: Number(props.config.freeze || 0) === 1,
    localtime:
      props.config.localtime === undefined ? '__default__' : textValue(props.config.localtime),
    startdate: textValue(props.config.startdate, 'now'),
    vmstatestorage: textValue(props.config.vmstatestorage),
    smbios1: textValue(props.config.smbios1),
    spiceFolderSharing: String(spiceEnhancements.foldersharing || '0') === '1',
    spiceVideoStreaming: ['all', 'filter'].includes(String(spiceEnhancements.videostreaming || ''))
      ? String(spiceEnhancements.videostreaming)
      : 'off',
    sevType: ['std', 'es', 'snp'].includes(String(sev.type || ''))
      ? String(sev.type)
      : '__default__',
    sevDebug: String(sev['no-debug'] || '0') !== '1',
    sevKeySharing: String(sev['no-key-sharing'] || '0') !== '1',
    sevSmt: String(sev['allow-smt'] || '1') !== '0',
    sevKernelHashes: String(sev['kernel-hashes'] || '0') === '1',
    tdxType: String(tdx.type || '') === 'tdx' ? 'tdx' : '__default__',
    tdxAttestation: String(tdx.attestation || '1') !== '0',
    tdxVsockCid: String(tdx['vsock-cid'] || '2'),
    tdxVsockPort: String(tdx['vsock-port'] || '4050'),
  };
  Object.assign(form, next);
  original.value = { ...next };
}

async function save() {
  if (!canSave.value) return;
  const data: PveRecord = { digest: props.config.digest };
  const deletedKeys: string[] = [];
  const setOptional = (key: string, value: string) => {
    if (value.trim()) data[key] = value.trim();
    else deletedKeys.push(key);
  };
  if (form.name !== original.value.name) setOptional('name', form.name);
  if (form.description !== original.value.description) {
    if (form.description.trim()) data.description = form.description.trim();
    else deletedKeys.push('description');
  }
  if (form.onboot !== original.value.onboot) data.onboot = form.onboot ? 1 : 0;
  if (form.protection !== original.value.protection) data.protection = form.protection ? 1 : 0;
  if (form.agent !== original.value.agent) data.agent = form.agent ? 'enabled=1' : 'enabled=0';
  if (form.acpi !== original.value.acpi) data.acpi = form.acpi ? 1 : 0;
  if (form.kvm !== original.value.kvm) data.kvm = form.kvm ? 1 : 0;
  if (form.tablet !== original.value.tablet) data.tablet = form.tablet ? 1 : 0;
  if (form.hotplug !== original.value.hotplug) setOptional('hotplug', form.hotplug);
  if (form.startup !== original.value.startup) setOptional('startup', form.startup);
  if (form.ostype !== original.value.ostype) data.ostype = form.ostype;
  if (form.boot !== original.value.boot) setOptional('boot', form.boot);
  if (form.freeze !== original.value.freeze) data.freeze = form.freeze ? 1 : 0;
  if (form.localtime !== original.value.localtime) {
    if (form.localtime === '__default__') deletedKeys.push('localtime');
    else data.localtime = form.localtime;
  }
  if (form.startdate !== original.value.startdate) setOptional('startdate', form.startdate);
  if (form.vmstatestorage !== original.value.vmstatestorage)
    setOptional('vmstatestorage', form.vmstatestorage);
  if (
    form.spiceFolderSharing !== original.value.spiceFolderSharing ||
    form.spiceVideoStreaming !== original.value.spiceVideoStreaming
  ) {
    const enhancements: string[] = [];
    if (form.spiceFolderSharing) enhancements.push('foldersharing=1');
    if (form.spiceVideoStreaming !== 'off')
      enhancements.push(`videostreaming=${form.spiceVideoStreaming}`);
    if (enhancements.length) data.spice_enhancements = enhancements.join(',');
    else deletedKeys.push('spice_enhancements');
  }
  if (form.smbios1 !== original.value.smbios1) setOptional('smbios1', form.smbios1);
  if (
    form.sevType !== original.value.sevType ||
    form.sevDebug !== original.value.sevDebug ||
    form.sevKeySharing !== original.value.sevKeySharing ||
    form.sevSmt !== original.value.sevSmt ||
    form.sevKernelHashes !== original.value.sevKernelHashes
  ) {
    if (form.sevType === '__default__') deletedKeys.push('amd-sev');
    else {
      const sev = [`type=${form.sevType}`];
      if (!form.sevDebug) sev.push('no-debug=1');
      if (form.sevType === 'snp' && !form.sevSmt) sev.push('allow-smt=0');
      if (form.sevType !== 'snp' && !form.sevKeySharing) sev.push('no-key-sharing=1');
      if (form.sevKernelHashes) sev.push('kernel-hashes=1');
      data['amd-sev'] = sev.join(',');
    }
  }
  if (
    form.tdxType !== original.value.tdxType ||
    form.tdxAttestation !== original.value.tdxAttestation ||
    form.tdxVsockCid !== original.value.tdxVsockCid ||
    form.tdxVsockPort !== original.value.tdxVsockPort
  ) {
    if (form.tdxType === '__default__') deletedKeys.push('intel-tdx');
    else
      data['intel-tdx'] = [
        `type=${form.tdxType}`,
        `attestation=${form.tdxAttestation ? 1 : 0}`,
        `vsock-cid=${form.tdxVsockCid || '2'}`,
        `vsock-port=${form.tdxVsockPort || '4050'}`,
      ].join(',');
  }
  if (deletedKeys.length) data.delete = deletedKeys.join(',');
  if (Object.keys(data).length === 1) return;
  loading.value = true;
  try {
    await updateVmConfig(props.node, props.vmid, data);
    emit('updated');
  } finally {
    loading.value = false;
  }
}

watch(() => props.config, syncForm, { immediate: true });
</script>

<template>
  <q-form class="q-pa-md u-hidden-error" @submit.prevent="save">
    <div class="row q-col-gutter-md">
      <div class="col-12 col-md-6">
        <q-input v-model="form.name" dense outlined square :label="gettext('Name')" />
      </div>
      <div class="col-12">
        <q-input
          v-model="form.description"
          dense
          outlined
          square
          type="textarea"
          autogrow
          :label="gettext('Description')"
        />
      </div>
      <div class="col-12">
        <q-checkbox
          v-model="form.onboot"
          dense
          color="primary"
          :label="gettext('Start at boot')"
        /><q-checkbox
          v-model="form.protection"
          dense
          color="primary"
          class="q-ml-md"
          :label="gettext('Protection')"
        /><q-checkbox
          v-model="form.agent"
          dense
          color="primary"
          class="q-ml-md"
          :label="gettext('QEMU Guest Agent')"
        /><q-checkbox
          v-model="form.acpi"
          dense
          color="primary"
          class="q-ml-md"
          :label="gettext('ACPI support')"
        /><q-checkbox
          v-model="form.kvm"
          dense
          color="primary"
          class="q-ml-md"
          :label="gettext('KVM hardware virtualization')"
        /><q-checkbox
          v-model="form.tablet"
          dense
          color="primary"
          class="q-ml-md"
          :label="gettext('USB Tablet')"
        />
      </div>
      <div class="col-12 col-md-6">
        <q-input
          v-model="form.hotplug"
          dense
          outlined
          square
          :label="gettext('Hotplug')"
          hint="disk,network,usb"
        />
      </div>
      <div class="col-12 col-md-6">
        <q-input
          v-model="form.startup"
          dense
          outlined
          square
          :label="gettext('Startup/Shutdown order')"
          hint="order=1,up=30,down=30"
        />
      </div>
      <div class="col-12 col-md-6">
        <q-select
          v-model="form.ostype"
          dense
          outlined
          square
          emit-value
          map-options
          :options="[
            { label: gettext('Linux'), value: 'l26' },
            { label: gettext('Windows 11'), value: 'win11' },
            { label: gettext('Windows 10'), value: 'win10' },
            { label: gettext('Windows 8/2012'), value: 'win8' },
            { label: gettext('Windows 7/2008'), value: 'win7' },
            { label: gettext('Other'), value: 'other' },
          ]"
          :label="gettext('OS Type')"
        />
      </div>
      <div class="col-12 col-md-6">
        <q-input
          v-model="form.boot"
          dense
          outlined
          square
          :label="gettext('Boot Order')"
          hint="order=scsi0;ide2;net0"
        />
      </div>
      <div class="col-12 col-md-6">
        <q-checkbox
          v-model="form.freeze"
          dense
          color="primary"
          :label="gettext('Freeze CPU at startup')"
        />
      </div>
      <div class="col-12 col-md-6">
        <q-select
          v-model="form.localtime"
          dense
          outlined
          square
          emit-value
          map-options
          :label="gettext('Use local time for RTC')"
          :options="[
            { label: gettext('Default'), value: '__default__' },
            { label: gettext('Yes'), value: '1' },
            { label: gettext('No'), value: '0' },
          ]"
        />
      </div>
      <div class="col-12 col-md-6">
        <q-input
          v-model="form.startdate"
          dense
          outlined
          square
          :label="gettext('RTC start date')"
          hint="now or YYYY-MM-DDTHH:MM:SS"
        />
      </div>
      <div class="col-12 col-md-6">
        <q-input
          v-model="form.vmstatestorage"
          dense
          outlined
          square
          :label="gettext('VM State storage')"
          hint="Leave empty for automatic"
        />
      </div>
      <div class="col-12 col-md-6">
        <q-checkbox
          v-model="form.spiceFolderSharing"
          dense
          color="primary"
          :label="gettext('SPICE Folder Sharing')"
        /><q-select
          v-model="form.spiceVideoStreaming"
          dense
          outlined
          square
          emit-value
          map-options
          class="q-mt-sm"
          :label="gettext('SPICE Video Streaming')"
          :options="[
            { label: gettext('Off'), value: 'off' },
            { label: gettext('All'), value: 'all' },
            { label: gettext('Filter'), value: 'filter' },
          ]"
        />
      </div>
      <div class="col-12">
        <q-input
          v-model="form.smbios1"
          dense
          outlined
          square
          :label="gettext('SMBIOS settings (type1)')"
          hint="uuid=...,manufacturer=...,product=..."
        />
      </div>
      <div class="col-12 col-md-6">
        <q-select
          v-model="form.sevType"
          dense
          outlined
          square
          emit-value
          map-options
          :disable="!canConfigureHardware"
          :label="gettext('AMD SEV Type')"
          :options="[
            { label: `${gettext('Default')} (${gettext('Disabled')})`, value: '__default__' },
            { label: gettext('AMD SEV'), value: 'std' },
            { label: gettext('AMD SEV-ES'), value: 'es' },
            { label: gettext('AMD SEV-SNP'), value: 'snp' },
          ]"
        />
        <div v-if="form.sevType !== '__default__'" class="q-mt-sm">
          <q-checkbox
            v-model="form.sevDebug"
            dense
            color="primary"
            :disable="!canConfigureHardware"
            :label="gettext('Allow Debugging')"
          /><q-checkbox
            v-if="form.sevType !== 'snp'"
            v-model="form.sevKeySharing"
            dense
            color="primary"
            class="q-ml-md"
            :disable="!canConfigureHardware"
            :label="gettext('Allow Key-Sharing')"
          /><q-checkbox
            v-if="form.sevType === 'snp'"
            v-model="form.sevSmt"
            dense
            color="primary"
            class="q-ml-md"
            :disable="!canConfigureHardware"
            :label="gettext('Allow SMT')"
          /><q-checkbox
            v-model="form.sevKernelHashes"
            dense
            color="primary"
            class="q-ml-md"
            :disable="!canConfigureHardware"
            :label="gettext('Enable Kernel Hashes')"
          />
        </div>
      </div>
      <div class="col-12 col-md-6">
        <q-select
          v-model="form.tdxType"
          dense
          outlined
          square
          emit-value
          map-options
          :disable="!canConfigureHardware"
          :label="gettext('Intel TDX Type')"
          :options="[
            { label: `${gettext('Default')} (${gettext('Disabled')})`, value: '__default__' },
            { label: gettext('Intel TDX'), value: 'tdx' },
          ]"
        />
        <div v-if="form.tdxType === 'tdx'" class="q-mt-sm">
          <q-checkbox
            v-model="form.tdxAttestation"
            dense
            color="primary"
            :disable="!canConfigureHardware"
            :label="gettext('Enable Attestation')"
          />
          <div class="row q-col-gutter-sm q-mt-xs">
            <div class="col-6">
              <q-input
                v-model="form.tdxVsockCid"
                dense
                outlined
                square
                type="number"
                min="2"
                :disable="!canConfigureHardware || !form.tdxAttestation"
                :label="gettext('CID')"
              />
            </div>
            <div class="col-6">
              <q-input
                v-model="form.tdxVsockPort"
                dense
                outlined
                square
                type="number"
                min="0"
                :disable="!canConfigureHardware || !form.tdxAttestation"
                :label="gettext('Port')"
              />
            </div>
          </div>
        </div>
      </div>
      <div class="col-12">
        <q-btn
          no-caps
          flat
          size="12px"
          class="bg-primary text-grey-1 u-button"
          type="submit"
          :disable="!canSave"
          :loading="loading"
          :label="gettext('Save')"
        />
      </div>
    </div>
  </q-form>
</template>
