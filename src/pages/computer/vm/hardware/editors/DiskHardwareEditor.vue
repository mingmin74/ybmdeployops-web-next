<script setup lang="ts">
import { computed, reactive, shallowRef, watch } from 'vue';
import { gettext } from '@/locale';
import { textValue } from '@/utils/pveFormat';
import { useVmHardwareContext } from '../context/vmHardwareContext';
import { getGuestArchitecture } from '../vmHardwareUtils';
import type { HardwareRow } from '../types';

type DriveForm = {
  file: string;
  cache: string;
  discard: boolean;
  iothread: boolean;
  ssd: boolean;
  readOnly: boolean;
  backup: boolean;
  skipReplication: boolean;
  aio: string;
  mbps_rd: string;
  mbps_wr: string;
  iops_rd: string;
  iops_wr: string;
  mbps_rd_max: string;
  mbps_wr_max: string;
  iops_rd_max: string;
  iops_wr_max: string;
};

const { device } = defineProps<{ device: HardwareRow }>();
const { config, canEditRow, updateConfig } = useVmHardwareContext();
const managedDriveKeys = new Set([
  'volume',
  'backup',
  'replicate',
  'cache',
  'discard',
  'iothread',
  'ssd',
  'ro',
  'aio',
  'mbps_rd',
  'mbps_wr',
  'iops_rd',
  'iops_wr',
  'mbps_rd_max',
  'mbps_wr_max',
  'iops_rd_max',
  'iops_wr_max',
]);
const bandwidthKeys = [
  'mbps_rd',
  'mbps_wr',
  'iops_rd',
  'iops_wr',
  'mbps_rd_max',
  'mbps_wr_max',
  'iops_rd_max',
  'iops_wr_max',
] as const;

function parseEnabled(value: string | undefined, fallback = false) {
  if (value === undefined || value === '') return fallback;
  return ['1', 'on', 'yes', 'true'].includes(value.toLowerCase());
}

function parseDrive(value: unknown) {
  const form: DriveForm = {
    file: '',
    cache: '__default__',
    discard: false,
    iothread: false,
    ssd: false,
    readOnly: false,
    backup: true,
    skipReplication: false,
    aio: '__default__',
    mbps_rd: '',
    mbps_wr: '',
    iops_rd: '',
    iops_wr: '',
    mbps_rd_max: '',
    mbps_wr_max: '',
    iops_rd_max: '',
    iops_wr_max: '',
  };
  const preserved: string[] = [];
  let hasDriveFile = false;
  let malformed = false;
  const seenKeys = new Set<string>();
  const raw = textValue(value).trim();
  raw.split(',').forEach((part) => {
    if (!part) {
      malformed = true;
      return;
    }
    const separator = part.indexOf('=');
    if (separator === -1) {
      if (hasDriveFile) {
        malformed = true;
        return;
      }
      form.file = part;
      hasDriveFile = true;
      return;
    }
    const key = part.slice(0, separator);
    const optionValue = part.slice(separator + 1);
    if (!/^[A-Za-z][A-Za-z0-9_-]*$/.test(key) || !optionValue || seenKeys.has(key)) {
      malformed = true;
      return;
    }
    seenKeys.add(key);
    if (key === 'volume') {
      if (hasDriveFile) malformed = true;
      else {
        form.file = optionValue;
        hasDriveFile = true;
      }
    } else if (key === 'cache') {
      form.cache = optionValue === 'off' ? 'none' : optionValue || '__default__';
    } else if (key === 'discard') form.discard = optionValue === 'on' || parseEnabled(optionValue);
    else if (key === 'iothread') form.iothread = parseEnabled(optionValue);
    else if (key === 'ssd') form.ssd = parseEnabled(optionValue);
    else if (key === 'ro') form.readOnly = parseEnabled(optionValue);
    else if (key === 'backup') form.backup = parseEnabled(optionValue, true);
    else if (key === 'replicate') form.skipReplication = !parseEnabled(optionValue, true);
    else if (key === 'aio') form.aio = optionValue || '__default__';
    else if (bandwidthKeys.includes(key as (typeof bandwidthKeys)[number])) {
      form[key as (typeof bandwidthKeys)[number]] = optionValue;
    } else if (!managedDriveKeys.has(key)) preserved.push(part);
  });
  return { form, preserved, malformed: Boolean(raw && (!hasDriveFile || malformed)) };
}

const parsedDrive = parseDrive(config.value[device.key]);
const form = reactive(parsedDrive.form);
const preservedOptions = shallowRef(parsedDrive.preserved);
const malformed = shallowRef(parsedDrive.malformed);
const editable = computed(() => canEditRow(device));
const isUnused = computed(() => /^unused\d+$/.test(device.key));
const selectedUnusedKey = shallowRef(device.key);
const unusedDiskOptions = computed(() =>
  Object.keys(config.value)
    .filter((key) => /^unused\d+$/.test(key))
    .map((key) => ({ label: key, value: key })),
);
const controllerOptions = computed(() => {
  const options = [
    { label: 'SCSI', value: 'scsi', limit: 31 },
    { label: 'VirtIO Block', value: 'virtio', limit: 16 },
    { label: 'SATA', value: 'sata', limit: 6 },
  ];
  if (getGuestArchitecture(config.value) !== 'aarch64') {
    options.unshift({ label: 'IDE', value: 'ide', limit: 4 });
  }
  return options;
});
const attachment = reactive({ controller: 'scsi', deviceid: 0 });
const attachmentController = computed(
  () =>
    controllerOptions.value.find((option) => option.value === attachment.controller) ||
    controllerOptions.value[0]!,
);
const attachmentOptions = computed(() =>
  Array.from({ length: attachmentController.value.limit }, (_, value) => ({
    label: String(value),
    value,
    disable: Boolean(config.value[`${attachment.controller}${value}`]),
  })),
);
const attachmentKey = computed(() => `${attachment.controller}${attachment.deviceid}`);
const attachmentFree = computed(() => !config.value[attachmentKey.value]);
const bus = computed(() => device.key.replace(/\d+$/, ''));
const supportsIoThread = computed(() => bus.value === 'scsi' || bus.value === 'virtio');
const advanced = shallowRef(
  Boolean(
    form.ssd ||
    form.readOnly ||
    !form.backup ||
    form.skipReplication ||
    form.aio !== '__default__' ||
    bandwidthKeys.some((key) => form[key]),
  ),
);
const cacheOptions = [
  { label: `${gettext('Default')} (${gettext('No cache')})`, value: '__default__' },
  { label: 'No cache', value: 'none' },
  { label: 'Write through', value: 'writethrough' },
  { label: 'Write back', value: 'writeback' },
  { label: 'Direct sync', value: 'directsync' },
  { label: 'Unsafe', value: 'unsafe' },
];
const aioOptions = [
  { label: `${gettext('Default')} (io_uring)`, value: '__default__' },
  { label: 'native', value: 'native' },
  { label: 'threads', value: 'threads' },
  { label: 'io_uring', value: 'io_uring' },
];

function optionalNumberValid(value: string, min: number, integer = false) {
  if (!value.trim()) return true;
  const number = Number(value);
  return Number.isFinite(number) && number >= min && (!integer || Number.isInteger(number));
}

const canSave = computed(() =>
  Boolean(
    !malformed.value &&
    form.file.trim() &&
    (!isUnused.value || attachmentFree.value) &&
    optionalNumberValid(form.mbps_rd, 1) &&
    optionalNumberValid(form.mbps_wr, 1) &&
    optionalNumberValid(form.iops_rd, 10, true) &&
    optionalNumberValid(form.iops_wr, 10, true) &&
    optionalNumberValid(form.mbps_rd_max, 1) &&
    optionalNumberValid(form.mbps_wr_max, 1) &&
    optionalNumberValid(form.iops_rd_max, 10, true) &&
    optionalNumberValid(form.iops_wr_max, 10, true),
  ),
);

function pushOptional(parts: string[], key: string, value: string) {
  if (value.trim()) parts.push(`${key}=${value.trim()}`);
}

function diskValue() {
  const parts = [form.file.trim(), ...preservedOptions.value];
  if (form.cache !== '__default__') parts.push(`cache=${form.cache}`);
  if (form.discard) parts.push('discard=on');
  if (supportsIoThread.value && form.iothread) parts.push('iothread=on');
  if (bus.value !== 'virtio' && form.ssd) parts.push('ssd=on');
  if (supportsIoThread.value && form.readOnly) parts.push('ro=on');
  if (!form.backup) parts.push('backup=0');
  if (form.skipReplication) parts.push('replicate=no');
  if (form.aio !== '__default__') parts.push(`aio=${form.aio}`);
  bandwidthKeys.forEach((key) => pushOptional(parts, key, form[key]));
  return parts.join(',');
}

function loadUnusedDrive(key: string) {
  const parsed = parseDrive(config.value[key]);
  Object.assign(form, parsed.form);
  preservedOptions.value = parsed.preserved;
  malformed.value = parsed.malformed;
}

watch(selectedUnusedKey, loadUnusedDrive);
watch(
  () => attachment.controller,
  () => {
    attachment.deviceid = attachmentOptions.value.find((option) => !option.disable)?.value ?? 0;
  },
  { immediate: true },
);

async function save() {
  if (!editable.value || !canSave.value) return;
  await updateConfig(
    { [isUnused.value ? attachmentKey.value : device.key]: diskValue(), background_delay: 5 },
    'POST',
    gettext('Update disk'),
  );
}
</script>

<template>
  <div class="hardware-special-editor" :class="{ 'hardware-special-editor--disabled': !editable }">
    <div class="row q-col-gutter-sm hardware-special-editor__fields">
      <div v-if="malformed" class="col-12 hardware-editor-error">
        {{ gettext('This disk configuration cannot be parsed safely and was not changed.') }}
      </div>
      <div v-if="isUnused" class="col-12">
        <q-select
          v-model="selectedUnusedKey"
          dense
          options-dense
          emit-value
          map-options
          :options="unusedDiskOptions"
          :label="gettext('Disk image')"
        />
      </div>
      <div v-else class="col-12">
        <q-input v-model="form.file" dense disable :label="gettext('Disk image')" />
      </div>
      <template v-if="isUnused">
        <div class="col-6">
          <q-select
            v-model="attachment.controller"
            dense
            options-dense
            emit-value
            map-options
            :options="controllerOptions"
            :label="gettext('Bus/Device')"
          />
        </div>
        <div class="col-6">
          <q-select
            v-model="attachment.deviceid"
            dense
            options-dense
            emit-value
            map-options
            :options="attachmentOptions"
            :label="gettext('Device')"
          />
        </div>
      </template>
      <div class="col-12">
        <q-select
          v-model="form.cache"
          dense
          options-dense
          emit-value
          map-options
          :options="cacheOptions"
          :label="gettext('Cache')"
        />
      </div>
      <div class="col-6">
        <q-checkbox v-model="form.discard" dense color="primary" :label="gettext('Discard')" />
      </div>
      <div class="col-6">
        <q-checkbox
          v-model="form.iothread"
          dense
          color="primary"
          :disable="!supportsIoThread"
          label="IO thread"
        />
      </div>
      <template v-if="advanced">
        <div class="col-6">
          <q-checkbox
            v-model="form.ssd"
            dense
            color="primary"
            :disable="bus === 'virtio'"
            :label="gettext('SSD emulation')"
          />
        </div>
        <div class="col-6">
          <q-checkbox
            v-model="form.readOnly"
            dense
            color="primary"
            :disable="!supportsIoThread"
            :label="gettext('Readonly')"
          />
        </div>
        <div class="col-6">
          <q-checkbox v-model="form.backup" dense color="primary" :label="gettext('Backup')" />
        </div>
        <div class="col-6">
          <q-checkbox
            v-model="form.skipReplication"
            dense
            color="primary"
            :label="gettext('Skip replication')"
          />
        </div>
        <div class="col-12">
          <q-select
            v-model="form.aio"
            dense
            options-dense
            emit-value
            map-options
            :options="aioOptions"
            :label="gettext('Async IO')"
          />
        </div>
        <div class="col-6">
          <q-input
            v-model="form.mbps_rd"
            dense
            type="number"
            min="1"
            :label="`${gettext('Read limit')} (MB/s)`"
          />
        </div>
        <div class="col-6">
          <q-input
            v-model="form.mbps_wr"
            dense
            type="number"
            min="1"
            :label="`${gettext('Write limit')} (MB/s)`"
          />
        </div>
        <div class="col-6">
          <q-input
            v-model="form.iops_rd"
            dense
            type="number"
            min="10"
            step="10"
            :label="`${gettext('Read limit')} (ops/s)`"
          />
        </div>
        <div class="col-6">
          <q-input
            v-model="form.iops_wr"
            dense
            type="number"
            min="10"
            step="10"
            :label="`${gettext('Write limit')} (ops/s)`"
          />
        </div>
        <div class="col-6">
          <q-input
            v-model="form.mbps_rd_max"
            dense
            type="number"
            min="1"
            :label="`${gettext('Read max burst')} (MB)`"
          />
        </div>
        <div class="col-6">
          <q-input
            v-model="form.mbps_wr_max"
            dense
            type="number"
            min="1"
            :label="`${gettext('Write max burst')} (MB)`"
          />
        </div>
        <div class="col-6">
          <q-input
            v-model="form.iops_rd_max"
            dense
            type="number"
            min="10"
            step="10"
            :label="`${gettext('Read max burst')} (ops)`"
          />
        </div>
        <div class="col-6">
          <q-input
            v-model="form.iops_wr_max"
            dense
            type="number"
            min="10"
            step="10"
            :label="`${gettext('Write max burst')} (ops)`"
          />
        </div>
      </template>
    </div>
    <div class="hardware-special-editor__footer row items-center justify-between">
      <q-checkbox v-model="advanced" dense color="primary" :label="gettext('Advanced')" />
      <q-btn
        no-caps
        size="12px"
        class="bg-primary text-grey-1 u-button"
        :disable="!canSave || !editable"
        :label="gettext('Save')"
        @click="save"
      />
    </div>
  </div>
</template>

<style scoped lang="scss">
.hardware-special-editor {
  display: flex;
  min-height: 100%;
  flex-direction: column;
}
.hardware-special-editor__fields {
  flex: 1 1 auto;
  align-content: flex-start;
}
.hardware-special-editor__footer {
  min-height: 52px;
  margin: auto -8px -8px;
  padding: 8px 12px;
  border-top: 1px solid #d7dce2;
  background: #f5f7fa;
}
.hardware-editor-error {
  padding: 8px 10px;
  border: 1px solid #ef9a9a;
  background: #ffebee;
  color: #b71c1c;
  font-size: 12px;
  line-height: 1.5;
}
.hardware-special-editor--disabled .hardware-special-editor__fields {
  pointer-events: none;
  opacity: 0.6;
}
</style>
