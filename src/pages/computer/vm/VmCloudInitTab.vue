<script setup lang="ts">
import { computed, reactive, shallowRef, watch } from 'vue';
import { updateVmConfig } from '@/api/overview';
import { regenerateVmCloudInitImage } from '@/api/vm';
import type { PveRecord } from '@/api/resources';
import { gettext } from '@/locale';
import { useSessionStore } from '@/stores/session';
const props = defineProps<{ node: string; vmid: string; config: PveRecord }>();
const emit = defineEmits<{ updated: [] }>();
const session = useSessionStore();
const loading = shallowRef(false);
const form = reactive({
  ciuser: '',
  cipassword: '',
  sshkeys: '',
  nameserver: '',
  searchdomain: '',
  ciupgrade: false,
});
const original = shallowRef({ ...form });
const ipconfigs = reactive<Record<string, string>>({});
const originalIpconfigs = shallowRef<Record<string, string>>({});
function textValue(value: unknown) {
  return typeof value === 'string' || typeof value === 'number' ? String(value) : '';
}
const networkIndexes = computed(() => {
  const indexes = new Set<number>([0, 1]);
  Object.keys(props.config).forEach((key) => {
    const match = key.match(/^(?:net|ipconfig)(\d+)$/);
    if (match) indexes.add(Number(match[1]));
  });
  return [...indexes].sort((left, right) => left - right);
});
const canConfigureCloudInit = computed(() => {
  const caps = (session.caps as unknown as { vms?: Record<string, unknown> }).vms || {};
  return Boolean(caps['VM.Config.Cloudinit'] || caps['VM.Config.Network']);
});
const canRegenerateImage = computed(
  () =>
    Boolean(
      (session.caps as unknown as { vms?: Record<string, unknown> }).vms?.['VM.Config.Cloudinit'],
    ) &&
    Object.entries(props.config).some(
      ([key, value]) => /^(ide|scsi|sata)\d+$/.test(key) && String(value).includes('cloudinit'),
    ),
);
const canSave = computed(
  () =>
    canConfigureCloudInit.value &&
    (JSON.stringify(form) !== JSON.stringify(original.value) ||
      JSON.stringify(ipconfigs) !== JSON.stringify(originalIpconfigs.value)),
);
function decodeSshKeys(value: unknown) {
  const text = textValue(value);
  try {
    return decodeURIComponent(text);
  } catch {
    return text;
  }
}
function sync() {
  const next = {
    ciuser: textValue(props.config.ciuser),
    cipassword: '',
    sshkeys: decodeSshKeys(props.config.sshkeys),
    nameserver: textValue(props.config.nameserver),
    searchdomain: textValue(props.config.searchdomain),
    ciupgrade: Number(props.config.ciupgrade || 0) === 1,
  };
  Object.assign(form, next);
  original.value = { ...next };
  const nextIpconfigs = Object.fromEntries(
    networkIndexes.value.map((index) => [
      `ipconfig${index}`,
      textValue(props.config[`ipconfig${index}`]),
    ]),
  );
  Object.keys(ipconfigs).forEach((key) => delete ipconfigs[key]);
  Object.assign(ipconfigs, nextIpconfigs);
  originalIpconfigs.value = { ...nextIpconfigs };
}
async function save() {
  if (!canConfigureCloudInit.value) return;
  const data: PveRecord = { digest: props.config.digest };
  const deletedKeys: string[] = [];
  Object.entries(form).forEach(([key, value]) => {
    if (key === 'cipassword') {
      if (value) data[key] = value;
      return;
    }
    if (value === original.value[key as keyof typeof original.value]) return;
    if (key === 'ciupgrade') {
      data[key] = value ? 1 : 0;
      return;
    }
    if (key === 'sshkeys') {
      if (String(value).trim()) data.sshkeys = encodeURIComponent(String(value).trim());
      else deletedKeys.push(key);
      return;
    }
    if (String(value).trim()) data[key] = String(value).trim();
    else deletedKeys.push(key);
  });
  Object.entries(ipconfigs).forEach(([key, value]) => {
    if (value === originalIpconfigs.value[key]) return;
    if (value.trim()) data[key] = value.trim();
    else deletedKeys.push(key);
  });
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
async function regenerateImage() {
  if (!canRegenerateImage.value) return;
  loading.value = true;
  try {
    await regenerateVmCloudInitImage(props.node, props.vmid);
    emit('updated');
  } finally {
    loading.value = false;
  }
}
watch(() => props.config, sync, { immediate: true });
</script>
<template>
  <q-form class="q-pa-md u-hidden-error" @submit.prevent="save"
    ><div class="row q-col-gutter-md">
      <div class="col-12 col-md-6">
        <q-input v-model="form.ciuser" dense square outlined :label="gettext('User')" />
      </div>
      <div class="col-12 col-md-6">
        <q-input
          v-model="form.cipassword"
          dense
          square
          outlined
          type="password"
          :label="gettext('Password')"
          :hint="gettext('Leave empty to keep unchanged')"
        />
      </div>
      <div class="col-12">
        <q-input
          v-model="form.sshkeys"
          dense
          square
          outlined
          type="textarea"
          autogrow
          :label="gettext('SSH public key')"
        />
      </div>
      <template v-for="index in networkIndexes" :key="index"
        ><div class="col-12 col-md-6">
          <q-input
            v-model="ipconfigs[`ipconfig${index}`]"
            dense
            square
            outlined
            :label="`${gettext('IP Config')} (net${index})`"
          /></div
      ></template>
      <div class="col-12 col-md-6">
        <q-input v-model="form.nameserver" dense square outlined :label="gettext('DNS Server')" />
      </div>
      <div class="col-12 col-md-6">
        <q-input
          v-model="form.searchdomain"
          dense
          square
          outlined
          :label="gettext('DNS Search Domain')"
        />
      </div>
      <div class="col-12">
        <q-checkbox
          v-model="form.ciupgrade"
          dense
          color="primary"
          :label="gettext('Upgrade packages on boot')"
        />
      </div>
      <div class="col-12 q-gutter-sm">
        <q-btn
          no-caps
          flat
          size="12px"
          class="bg-primary text-grey-1 u-button"
          type="submit"
          :disable="!canSave"
          :loading="loading"
          :label="gettext('Save')"
        /><q-btn
          no-caps
          outline
          size="12px"
          color="primary"
          class="u-button"
          :disable="!canRegenerateImage"
          :loading="loading"
          :label="gettext('Regenerate Image')"
          @click="regenerateImage"
        />
      </div></div
  ></q-form>
</template>
