<script setup lang="ts">
import { computed, reactive, shallowRef } from 'vue';
import { gettext } from '@/locale';
import { textValue } from '@/utils/pveFormat';
import { useVmHardwareContext } from '../context/vmHardwareContext';
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
const preservedKeys = new Set([
  'size',
  'format',
  'media',
  'serial',
  'wwn',
  'snapshot',
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
const bandwidthKeys = ['mbps_rd', 'mbps_wr', 'iops_rd', 'iops_wr', 'mbps_rd_max', 'mbps_wr_max', 'iops_rd_max', 'iops_wr_max'] as const;

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
  textValue(value).split(',').forEach((part) => {
    if (!part) return;
    const segments = part.split('=', 2);
    const key = segments[0] || '';
    const optionValue = segments[1];
    if (!key) return;
    if (optionValue === undefined) {
      form.file = key;
      return;
    }
    if (key === 'cache') form.cache = optionValue || '__default__';
    else if (key === 'discard') form.discard = optionValue === 'on' || parseEnabled(optionValue);
    else if (key === 'iothread') form.iothread = parseEnabled(optionValue);
    else if (key === 'ssd') form.ssd = parseEnabled(optionValue);
    else if (key === 'ro') form.readOnly = parseEnabled(optionValue);
    else if (key === 'backup') form.backup = parseEnabled(optionValue, true);
    else if (key === 'replicate') form.skipReplication = !parseEnabled(optionValue, true);
    else if (key === 'aio') form.aio = optionValue || '__default__';
    else if (bandwidthKeys.includes(key as (typeof bandwidthKeys)[number])) form[key as (typeof bandwidthKeys)[number]] = optionValue;
    else if (!preservedKeys.has(key)) preserved.push(part);
    else preserved.push(part);
  });
  return { form, preserved };
}

const parsedDrive = parseDrive(config.value[device.key]);
const form = reactive(parsedDrive.form);
const preservedOptions = shallowRef(parsedDrive.preserved);
const bus = computed(() => device.key.replace(/\d+$/, ''));
const supportsIoThread = computed(() => bus.value === 'scsi' || bus.value === 'virtio');
const advanced = shallowRef(
  Boolean(
    form.ssd ||
      form.readOnly ||
      !form.backup ||
      form.skipReplication ||
      form.aio !== '__default__' ||
      bandwidthKeys.some((key) => form[key])
  )
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

function optionalNumberValid(value: string, min: number) {
  if (!value.trim()) return true;
  const number = Number(value);
  return Number.isFinite(number) && number >= min;
}

const canSave = computed(() =>
  Boolean(
    form.file.trim() &&
      optionalNumberValid(form.mbps_rd, 1) &&
      optionalNumberValid(form.mbps_wr, 1) &&
      optionalNumberValid(form.iops_rd, 10) &&
      optionalNumberValid(form.iops_wr, 10) &&
      optionalNumberValid(form.mbps_rd_max, 1) &&
      optionalNumberValid(form.mbps_wr_max, 1) &&
      optionalNumberValid(form.iops_rd_max, 10) &&
      optionalNumberValid(form.iops_wr_max, 10)
  )
);

function pushOptional(parts: string[], key: string, value: string) {
  if (value.trim()) parts.push(`${key}=${value.trim()}`);
}

function diskValue() {
  const parts = [form.file.trim(), ...preservedOptions.value];
  if (form.cache !== '__default__') parts.push(`cache=${form.cache}`);
  if (form.discard) parts.push('discard=on');
  if (supportsIoThread.value && form.iothread) parts.push('iothread=on');
  if (advanced.value) {
    if (bus.value !== 'virtio' && form.ssd) parts.push('ssd=on');
    if (supportsIoThread.value && form.readOnly) parts.push('ro=on');
    if (!form.backup) parts.push('backup=0');
    if (form.skipReplication) parts.push('replicate=no');
    if (form.aio !== '__default__') parts.push(`aio=${form.aio}`);
    bandwidthKeys.forEach((key) => pushOptional(parts, key, form[key]));
  }
  return parts.join(',');
}

async function save() {
  if (!canEditRow(device) || !canSave.value) return;
  await updateConfig({ [device.key]: diskValue() });
}
</script>

<template>
  <div class="hardware-special-editor">
    <div class="row q-col-gutter-sm hardware-special-editor__fields">
      <div class="col-12">
        <q-input v-model="form.file" dense disable :label="gettext('Disk image')" />
      </div>
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
          <q-checkbox v-model="form.ssd" dense color="primary" :disable="bus === 'virtio'" :label="gettext('SSD emulation')" />
        </div>
        <div class="col-6">
          <q-checkbox v-model="form.readOnly" dense color="primary" :disable="!supportsIoThread" :label="gettext('Readonly')" />
        </div>
        <div class="col-6">
          <q-checkbox v-model="form.backup" dense color="primary" :label="gettext('Backup')" />
        </div>
        <div class="col-6">
          <q-checkbox v-model="form.skipReplication" dense color="primary" :label="gettext('Skip replication')" />
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
          <q-input v-model="form.mbps_rd" dense type="number" min="1" :label="`${gettext('Read limit')} (MB/s)`" />
        </div>
        <div class="col-6">
          <q-input v-model="form.mbps_wr" dense type="number" min="1" :label="`${gettext('Write limit')} (MB/s)`" />
        </div>
        <div class="col-6">
          <q-input v-model="form.iops_rd" dense type="number" min="10" step="10" :label="`${gettext('Read limit')} (ops/s)`" />
        </div>
        <div class="col-6">
          <q-input v-model="form.iops_wr" dense type="number" min="10" step="10" :label="`${gettext('Write limit')} (ops/s)`" />
        </div>
        <div class="col-6">
          <q-input v-model="form.mbps_rd_max" dense type="number" min="1" :label="`${gettext('Read max burst')} (MB)`" />
        </div>
        <div class="col-6">
          <q-input v-model="form.mbps_wr_max" dense type="number" min="1" :label="`${gettext('Write max burst')} (MB)`" />
        </div>
        <div class="col-6">
          <q-input v-model="form.iops_rd_max" dense type="number" min="10" step="10" :label="`${gettext('Read max burst')} (ops)`" />
        </div>
        <div class="col-6">
          <q-input v-model="form.iops_wr_max" dense type="number" min="10" step="10" :label="`${gettext('Write max burst')} (ops)`" />
        </div>
      </template>
    </div>
    <div class="hardware-special-editor__footer row items-center justify-between">
      <q-checkbox v-model="advanced" dense color="primary" :label="gettext('Advanced')" />
      <q-btn
        no-caps
        size="12px"
        class="bg-primary text-grey-1 u-button"
        :disable="!canSave"
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
</style>
