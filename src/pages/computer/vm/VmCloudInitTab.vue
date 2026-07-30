<script setup lang="ts">
import { computed, reactive, shallowRef, useTemplateRef, watch } from 'vue';
import { Dialog, Notify } from 'quasar';
import { updateVmConfig } from '@/api/overview';
import { regenerateVmCloudInitImage } from '@/api/vm';
import type { PveRecord } from '@/api/resources';
import { gettext } from '@/locale';
import { useSessionStore } from '@/stores/session';
const props = defineProps<{ node: string; vmid: string; config: PveRecord }>();
const emit = defineEmits<{ updated: [] }>();
const session = useSessionStore();
function optionIcon(key: string) {
  if (key === 'ciuser') return 'person';
  if (key === 'cipassword') return 'key';
  if (key === 'sshkeys') return 'vpn_key';
  if (key.startsWith('ipconfig')) return 'lan';
  if (key === 'nameserver') return 'dns';
  if (key === 'searchdomain') return 'travel_explore';
  if (key === 'ciupgrade') return 'archive';
  return 'settings';
}
const loading = shallowRef(false);
const form = reactive({
  ciuser: '',
  cipassword: '',
  sshkeys: '',
  nameserver: '',
  searchdomain: '',
  ciupgrade: true,
});
const original = shallowRef({ ...form });
const ipconfigs = reactive<Record<string, string>>({});
const originalIpconfigs = shallowRef<Record<string, string>>({});
const sshKeyFileInput = useTemplateRef<HTMLInputElement>('sshKeyFileInput');
const canLoadSshKeyFile = typeof FileReader !== 'undefined';
function textValue(value: unknown) {
  return typeof value === 'string' || typeof value === 'number' ? String(value) : '';
}
function isIpv4Address(value: string) {
  const parts = value.split('.');
  return parts.length === 4 && parts.every((part) => /^\d{1,3}$/.test(part) && Number(part) <= 255);
}
function isIpv6Address(value: string) {
  const parts = value.split('::');
  if (parts.length > 2) return false;
  const segments = parts.flatMap((part) => (part ? part.split(':') : []));
  if (!segments.every((segment) => /^[0-9a-f]{1,4}$/i.test(segment))) return false;
  return parts.length === 2 ? segments.length < 8 : segments.length === 8;
}
function normalizeNameserverList(value: string) {
  return value.trim().split(/[ ,;]+/).filter(Boolean).join(' ');
}
function isValidNameserverList(value: string) {
  return value.split(/[ ,;]+/).every((entry) => {
    if (!entry) return true;
    const parts = entry.split('%');
    const address = parts[0];
    if (parts.length > 2 || (parts.length > 1 && !address.toLowerCase().startsWith('fe80:'))) return false;
    return isIpv4Address(address) || isIpv6Address(address);
  });
}
type ParsedSshKey = { options?: string; type: string; key: string; comment?: string };
function parseSshKey(value: string): ParsedSshKey | null {
  const keyMatch = /^(?:((?:[^\s"]|"(?:\\.|[^"\\])*")+)\s+)?(\S+)\s+(\S+)(?:\s+(.*))?$/.exec(value);
  const typePattern = /^(?:(?:sk-)?(?:ssh-(?:dss|rsa|ed25519)|ecdsa-sha2-nistp\d+)(?:@(?:[a-z0-9_-]+\.)+[a-z]{2,})?)$/;
  if (!keyMatch || !keyMatch[2]) return null;
  if (keyMatch[1] && typePattern.test(keyMatch[1])) {
    return { type: keyMatch[1], key: keyMatch[2], comment: keyMatch[3] };
  }
  if (typePattern.test(keyMatch[2])) {
    return { options: keyMatch[1], type: keyMatch[2], key: keyMatch[3], comment: keyMatch[4] };
  }
  return null;
}
const sshKeyDisplayRows = computed(() =>
  form.sshkeys
    .split('\n')
    .filter(Boolean)
    .map((value, index) => {
      const key = parseSshKey(value);
      return {
        id: `${index}-${value}`,
        value: key ? key.comment || '' : value,
        hasOptions: Boolean(key?.options),
      };
    }),
);
function openSshKeyFileInput() {
  sshKeyFileInput.value?.click();
}
function readSshKeyFile(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
}
async function appendSshKeyFiles(event: Event) {
  const input = event.target as HTMLInputElement;
  const files = Array.from(input.files || []);
  input.value = '';
  for (const file of files) {
    if (file.size > 8192) {
      Notify.create({ type: 'negative', message: `${gettext('Invalid file size')}: ${file.size} > 8192` });
      continue;
    }
    try {
      form.sshkeys += await readSshKeyFile(file);
    } catch {
      Notify.create({ type: 'negative', message: gettext('Unable to read SSH key file') });
    }
  }
}
const networkIndexes = computed(() => {
  const indexes = new Set<number>();
  Object.keys(props.config).forEach((key) => {
    const match = key.match(/^net(\d+)$/);
    if (match) indexes.add(Number(match[1]));
  });
  return [...indexes].sort((left, right) => left - right);
});
const canConfigureCloudInit = computed(() => {
  const caps = (session.caps as unknown as { vms?: Record<string, unknown> }).vms || {};
  return Boolean(caps['VM.Config.Cloudinit'] || caps['VM.Config.Network']);
});
const hasCloudInitDrive = computed(() =>
  Object.entries(props.config).some(
    ([key, value]) => /^(ide|scsi|sata)\d+$/.test(key) && String(value).includes('cloudinit'),
  ),
);
const canRegenerateImage = computed(
  () =>
    Boolean(
      (session.caps as unknown as { vms?: Record<string, unknown> }).vms?.['VM.Config.Cloudinit'],
    ) && hasCloudInitDrive.value,
);
const canSave = computed(
  () =>
    hasCloudInitDrive.value &&
    canConfigureCloudInit.value &&
    (JSON.stringify(form) !== JSON.stringify(original.value) ||
      JSON.stringify(ipconfigs) !== JSON.stringify(originalIpconfigs.value)),
);
const selectedOption = shallowRef('ciuser');
const cloudInitRows = computed(() => [
  { key: 'ciuser', label: gettext('User'), value: form.ciuser || '-' },
  { key: 'cipassword', label: gettext('Password'), value: form.cipassword ? '********' : '-' },
  { key: 'sshkeys', label: gettext('SSH public key'), value: '' },
  ...networkIndexes.value.map((index) => ({
    key: `ipconfig${index}`,
    label: `${gettext('IP Config')} (net${index})`,
    value: ipconfigs[`ipconfig${index}`] || '-',
  })),
  { key: 'nameserver', label: gettext('DNS Server'), value: form.nameserver || '-' },
  { key: 'searchdomain', label: gettext('DNS Search Domain'), value: form.searchdomain || '-' },
  { key: 'ciupgrade', label: gettext('Upgrade packages'), value: form.ciupgrade ? gettext('Yes') : gettext('No') },
]);
const selectedOptionLabel = computed(
  () => cloudInitRows.value.find((row) => row.key === selectedOption.value)?.label || selectedOption.value,
);
const canRemoveSelected = computed(() => {
  if (!hasCloudInitDrive.value || !canConfigureCloudInit.value) return false;
  if (['ciuser', 'searchdomain', 'nameserver', 'sshkeys'].includes(selectedOption.value)) return false;
  if (selectedOption.value === 'cipassword') return Boolean(props.config.cipassword);
  return selectedOption.value === 'ciupgrade' || selectedOption.value.startsWith('ipconfig');
});
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
    ciupgrade: props.config.ciupgrade === undefined || props.config.ciupgrade === null || props.config.ciupgrade === ''
      ? true
      : Number(props.config.ciupgrade) === 1,
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
async function removeSelected() {
  if (!canRemoveSelected.value) return;
  loading.value = true;
  try {
    await updateVmConfig(props.node, props.vmid, {
      digest: props.config.digest,
      delete: selectedOption.value,
    });
    emit('updated');
  } finally {
    loading.value = false;
  }
}
function confirmRemoveSelected() {
  if (!canRemoveSelected.value) return;
  Dialog.create({
    title: gettext('Remove'),
    message: gettext('Are you sure you want to remove entry {0}').replace('{0}', `'${selectedOptionLabel.value}'`),
    cancel: true,
    persistent: true,
  }).onOk(() => void removeSelected());
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
    if (key === 'nameserver') {
      const nameservers = normalizeNameserverList(String(value));
      if (nameservers) data.nameserver = nameservers;
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
  <q-form class="vm-config-legacy vm-cloud-init-tab u-hidden-error" @submit.prevent="save">
    <div class="row q-gutter-sm q-py-sm options-toolbar">
      <q-btn
        no-caps
        outline
        size="12px"
        class="u-button"
        :color="canRemoveSelected ? 'primary' : 'grey'"
        :disable="!canRemoveSelected"
        :loading="loading"
        :label="gettext('Remove')"
        @click="confirmRemoveSelected"
      />
      <q-btn
        no-caps
        outline
        size="12px"
        class="u-button"
        :color="canRegenerateImage ? 'primary' : 'grey'"
        :disable="!canRegenerateImage"
        :loading="loading"
        :label="gettext('Regenerate Image')"
        @click="regenerateImage"
      />
    </div>
    <div class="row">
      <div class="col-7 options-list-column">
        <div class="u-border q-pa-sm options-scroll options-list-panel">
          <div
            v-for="row in cloudInitRows"
            :key="row.key"
            class="cursor-pointer q-px-sm row options-list-row"
            :class="{ 'bg-blue-2 text-grey-1': selectedOption === row.key }"
            @click="selectedOption = row.key"
          >
            <div class="col-4 text-grey-10 options-list-label">
              <q-icon :name="optionIcon(row.key)" size="16px" class="q-mr-xs options-list-icon" />{{ row.label }}:
            </div>
            <div class="col-8 text-grey-8 options-list-value">
              <template v-if="row.key === 'sshkeys'">
                <template v-if="sshKeyDisplayRows.length">
                  <div v-for="entry in sshKeyDisplayRows" :key="entry.id">
                    {{ entry.value }}<span v-if="entry.hasOptions" class="ssh-key-options"> ({{ gettext('with options') }})</span>
                  </div>
                </template>
                <template v-else>-</template>
              </template>
              <template v-else>{{ row.value }}</template>
            </div>
          </div>
        </div>
      </div>
      <div class="col-5 options-editor-column">
        <div class="u-border q-pa-sm u-hidden-error options-scroll options-editor">
          <div class="q-pa-sm">
            <div class="row items-center no-wrap editor-titlebar">
              <div class="editor-title text-grey-10">
                {{ cloudInitRows.find((row) => row.key === selectedOption)?.label }}
              </div>
              <q-space />
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
            <div class="row q-col-gutter-lg">
              <div v-show="selectedOption === 'ciuser'" class="col-12 col-md-6">
                <q-input v-model="form.ciuser" dense :label="gettext('User')" />
              </div>
              <div v-show="selectedOption === 'cipassword'" class="col-12 col-md-6">
                <q-input
                  v-model="form.cipassword"
                  dense
                  type="password"
                  :label="gettext('Password')"
                  :hint="gettext('Leave empty to keep unchanged')"
                />
              </div>
              <div v-show="selectedOption === 'sshkeys'" class="col-12">
                <q-input
                  v-model="form.sshkeys"
                  dense
                  type="textarea"
                  autogrow
                  :label="gettext('SSH public key')"
                />
                <input
                  v-if="canLoadSshKeyFile"
                  ref="sshKeyFileInput"
                  class="hidden"
                  type="file"
                  multiple
                  @change="appendSshKeyFiles"
                />
                <q-btn
                  v-if="canLoadSshKeyFile"
                  no-caps
                  outline
                  type="button"
                  size="12px"
                  color="primary"
                  class="u-button q-mt-sm"
                  :label="gettext('Load SSH Key File')"
                  @click="openSshKeyFileInput"
                />
              </div>
              <div v-show="selectedOption.startsWith('ipconfig')" class="col-12 col-md-6">
                <q-input
                  v-model="ipconfigs[selectedOption]"
                  dense
                  :label="cloudInitRows.find((row) => row.key === selectedOption)?.label"
                />
              </div>
              <div v-show="selectedOption === 'nameserver'" class="col-12 col-md-6">
                <q-input
                  v-model="form.nameserver"
                  dense
                  :label="gettext('DNS Server')"
                  :rules="[(value) => isValidNameserverList(value) || gettext('Enter a valid IPv4 or IPv6 address list')]"
                />
              </div>
              <div v-show="selectedOption === 'searchdomain'" class="col-12 col-md-6">
                <q-input v-model="form.searchdomain" dense :label="gettext('DNS Search Domain')" />
              </div>
              <div v-show="selectedOption === 'ciupgrade'" class="col-12">
                <q-checkbox
                  v-model="form.ciupgrade"
                  dense
                  color="primary"
                  :label="gettext('Upgrade packages')"
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
    <q-inner-loading :showing="!hasCloudInitDrive" class="cloud-init-drive-mask">
      <div class="cloud-init-drive-mask__content row items-center no-wrap">
        <q-icon name="cloud_off" size="22px" class="q-mr-sm" />
        <span>{{ gettext('No CloudInit Drive found') }}</span>
      </div>
    </q-inner-loading>
  </q-form>
</template>

<style scoped lang="scss">
.vm-config-legacy { padding: 8px; font-size: 13px; }
.vm-cloud-init-tab { position: relative; min-height: 160px; }
.options-toolbar { margin-top: 0; margin-bottom: 4px; }
.options-scroll { font-size: 13px; background: #fff; }
.options-list-column { overflow: hidden; }
.options-editor-column { display: flex; overflow: hidden; background: #fff; }
.options-list-panel { border-right: 0; }
.options-editor { flex: 1; border-left: 1px solid #d7dce2; }
.options-list-row { min-height: 30px; align-items: center; border-bottom: 1px solid #eef0f3; transition: background-color 150ms ease-out; }
.options-list-label { align-self: flex-start; padding-top: 6px; }
.options-list-icon { vertical-align: text-bottom; }
.options-list-value { min-width: 0; padding-top: 6px; padding-bottom: 6px; line-height: 18px; overflow-wrap: anywhere; word-break: break-word; white-space: normal; }
.options-list-row:last-child { border-bottom: 0; }
.options-list-row:hover { background: #f4f8fc; }
.options-list-row.bg-blue-2 { background: #e6f1fb !important; }
.options-list-row.bg-blue-2 :deep(.text-grey-10),
.options-list-row.bg-blue-2 :deep(.text-grey-8) { color: #1f4f78 !important; }
.editor-titlebar { min-height: 38px; margin: -4px -4px 10px; padding: 4px 8px; background: #f5f7fa; border-bottom: 1px solid #d7dce2; }
.editor-title { font-weight: 600; color: #334155; }
.ssh-key-options { color: #6b7280; }
.cloud-init-drive-mask { background: rgba(241, 245, 249, 0.8); backdrop-filter: blur(1px); }
.cloud-init-drive-mask__content { padding: 12px 18px; color: #52606d; font-size: 13px; font-weight: 500; background: #fff; border: 1px solid #cbd5e1; border-radius: 3px; box-shadow: 0 4px 12px rgba(51, 65, 85, 0.14); }
@media (prefers-reduced-motion: reduce) {
  .options-list-row { transition: none; }
}
</style>
