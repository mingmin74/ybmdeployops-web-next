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
const form = reactive({ name: '', description: '', onboot: false, protection: false, agent: false, acpi: true, kvm: true, tablet: true, hotplug: '', startup: '', boot: '', freeze: false, localtime: '__default__', startdate: 'now', vmstatestorage: '', smbios1: '' });
const original = shallowRef({ name: '', description: '', onboot: false, protection: false, agent: false, acpi: true, kvm: true, tablet: true, hotplug: '', startup: '', boot: '', freeze: false, localtime: '__default__', startdate: 'now', vmstatestorage: '', smbios1: '' });
const canConfigureOptions = computed(() => Boolean((session.caps as unknown as { vms?: Record<string, unknown> }).vms?.['VM.Config.Options']));
const canConfigureHardware = computed(() => Boolean((session.caps as unknown as { vms?: Record<string, unknown> }).vms?.['VM.Config.HWType']));
const optionsChanged = computed(() => Object.entries(form).some(([key, value]) => key !== 'smbios1' && value !== original.value[key as keyof typeof original.value]));
const smbiosChanged = computed(() => form.smbios1 !== original.value.smbios1);
const canSave = computed(() => (optionsChanged.value || smbiosChanged.value) && (!optionsChanged.value || canConfigureOptions.value) && (!smbiosChanged.value || canConfigureHardware.value));

function syncForm() {
  const next = {
    name: String(props.config.name || ''),
    description: String(props.config.description || ''),
    onboot: Number(props.config.onboot || 0) === 1,
    protection: Number(props.config.protection || 0) === 1,
    agent: String(props.config.agent || '').includes('enabled=1'),
    acpi: Number(props.config.acpi ?? 1) === 1,
    kvm: Number(props.config.kvm ?? 1) === 1,
    tablet: Number(props.config.tablet ?? 1) === 1,
    hotplug: String(props.config.hotplug || ''),
    startup: String(props.config.startup || ''),
    boot: String(props.config.boot || ''),
    freeze: Number(props.config.freeze || 0) === 1,
    localtime: props.config.localtime === undefined ? '__default__' : String(props.config.localtime),
    startdate: String(props.config.startdate || 'now'),
    vmstatestorage: String(props.config.vmstatestorage || ''),
    smbios1: String(props.config.smbios1 || ''),
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
  if (form.boot !== original.value.boot) setOptional('boot', form.boot);
  if (form.freeze !== original.value.freeze) data.freeze = form.freeze ? 1 : 0;
  if (form.localtime !== original.value.localtime) {
    if (form.localtime === '__default__') deletedKeys.push('localtime');
    else data.localtime = form.localtime;
  }
  if (form.startdate !== original.value.startdate) setOptional('startdate', form.startdate);
  if (form.vmstatestorage !== original.value.vmstatestorage) setOptional('vmstatestorage', form.vmstatestorage);
  if (form.smbios1 !== original.value.smbios1) setOptional('smbios1', form.smbios1);
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
      <div class="col-12 col-md-6"><q-input v-model="form.name" dense outlined square :label="gettext('Name')" /></div>
      <div class="col-12"><q-input v-model="form.description" dense outlined square type="textarea" autogrow :label="gettext('Description')" /></div>
      <div class="col-12"><q-checkbox v-model="form.onboot" dense color="primary" :label="gettext('Start at boot')" /><q-checkbox v-model="form.protection" dense color="primary" class="q-ml-md" :label="gettext('Protection')" /><q-checkbox v-model="form.agent" dense color="primary" class="q-ml-md" :label="gettext('QEMU Guest Agent')" /><q-checkbox v-model="form.acpi" dense color="primary" class="q-ml-md" :label="gettext('ACPI support')" /><q-checkbox v-model="form.kvm" dense color="primary" class="q-ml-md" :label="gettext('KVM hardware virtualization')" /><q-checkbox v-model="form.tablet" dense color="primary" class="q-ml-md" :label="gettext('USB Tablet')" /></div>
      <div class="col-12 col-md-6"><q-input v-model="form.hotplug" dense outlined square :label="gettext('Hotplug')" hint="disk,network,usb" /></div>
      <div class="col-12 col-md-6"><q-input v-model="form.startup" dense outlined square :label="gettext('Startup/Shutdown order')" hint="order=1,up=30,down=30" /></div>
      <div class="col-12 col-md-6"><q-input v-model="form.boot" dense outlined square :label="gettext('Boot Order')" hint="order=scsi0;ide2;net0" /></div>
      <div class="col-12 col-md-6"><q-checkbox v-model="form.freeze" dense color="primary" :label="gettext('Freeze CPU at startup')" /></div>
      <div class="col-12 col-md-6"><q-select v-model="form.localtime" dense outlined square emit-value map-options :label="gettext('Use local time for RTC')" :options="[{ label: gettext('Default'), value: '__default__' }, { label: gettext('Yes'), value: '1' }, { label: gettext('No'), value: '0' }]" /></div>
      <div class="col-12 col-md-6"><q-input v-model="form.startdate" dense outlined square :label="gettext('RTC start date')" hint="now or YYYY-MM-DDTHH:MM:SS" /></div>
      <div class="col-12 col-md-6"><q-input v-model="form.vmstatestorage" dense outlined square :label="gettext('VM State storage')" hint="Leave empty for automatic" /></div>
      <div class="col-12"><q-input v-model="form.smbios1" dense outlined square :label="gettext('SMBIOS settings (type1)')" hint="uuid=...,manufacturer=...,product=..." /></div>
      <div class="col-12"><q-btn no-caps flat size="12px" class="bg-primary text-grey-1 u-button" type="submit" :disable="!canSave" :loading="loading" :label="gettext('Save')" /></div>
    </div>
  </q-form>
</template>
