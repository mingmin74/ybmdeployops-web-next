<script setup lang="ts">
import { gettext } from '@/locale';

export interface AddDiskFormModel {
  diskBus: 'scsi' | 'virtio' | 'sata' | 'ide';
  storage: string;
  size: number;
  diskFormat: string;
  diskCache: string;
  diskBackup: boolean;
  diskReplicate: boolean;
  diskDiscard: boolean;
  diskIothread: boolean;
  diskSsd: boolean;
  diskReadOnly: boolean;
}

const form = defineModel<AddDiskFormModel>('form', { required: true });
</script>

<template>
  <div class="row q-col-gutter-md">
    <div class="col-4"><q-select v-model="form.diskBus" dense square outlined emit-value map-options :label="gettext('Bus')" :options="[{ label: 'SCSI', value: 'scsi' }, { label: 'VirtIO', value: 'virtio' }, { label: 'SATA', value: 'sata' }, { label: 'IDE', value: 'ide' }]" /></div>
    <div class="col-4"><q-input v-model="form.storage" dense square outlined :label="gettext('Storage')" /></div>
    <div class="col-4"><q-input v-model.number="form.size" dense square outlined type="number" :label="gettext('Disk Size (GiB)')" /></div>
    <div class="col-6"><q-select v-model="form.diskFormat" dense square outlined emit-value map-options :label="gettext('Disk Format')" :options="[{ label: gettext('Default'), value: '__default__' }, { label: 'raw', value: 'raw' }, { label: 'qcow2', value: 'qcow2' }, { label: 'vmdk', value: 'vmdk' }]" /></div>
    <div class="col-6"><q-select v-model="form.diskCache" dense square outlined emit-value map-options :label="gettext('Cache')" :options="[{ label: gettext('Default'), value: '__default__' }, { label: 'none', value: 'none' }, { label: 'writethrough', value: 'writethrough' }, { label: 'writeback', value: 'writeback' }, { label: 'directsync', value: 'directsync' }, { label: 'unsafe', value: 'unsafe' }]" /></div>
    <div class="col-12 q-gutter-sm"><q-checkbox v-model="form.diskBackup" :label="gettext('Include in backup')" /><q-checkbox v-model="form.diskReplicate" :label="gettext('Replicate')" /><q-checkbox v-model="form.diskDiscard" :label="gettext('Discard')" /><q-checkbox v-model="form.diskIothread" label="IO thread" /><q-checkbox v-model="form.diskSsd" :label="gettext('SSD emulation')" /><q-checkbox v-model="form.diskReadOnly" :label="gettext('Read-only')" /></div>
  </div>
</template>
