<script setup lang="ts">
import { reactive } from 'vue';
import { gettext } from '@/locale';
import UWindow from '@/components/UWindow.vue';
import { useVmHardwareContext } from '../context/vmHardwareContext';
import AddCdromForm from '../add/forms/AddCdromForm.vue';
import AddDiskForm from '../add/forms/AddDiskForm.vue';
import AddNetworkForm from '../add/forms/AddNetworkForm.vue';

type DeviceKind = 'disk' | 'cdrom' | 'net';
type DiskBus = 'scsi' | 'virtio' | 'sata' | 'ide';

const visible = defineModel<boolean>({ default: false });
const { hasVmCapability, loading, nextDeviceKey, updateConfig } = useVmHardwareContext();
const form = reactive({
  kind: 'disk' as DeviceKind,
  storage: '',
  size: 32,
  diskBus: 'scsi' as DiskBus,
  diskFormat: '__default__',
  diskCache: '__default__',
  diskBackup: true,
  diskReplicate: true,
  diskDiscard: false,
  diskIothread: false,
  diskSsd: false,
  diskReadOnly: false,
  bridge: 'vmbr0',
  model: 'virtio',
  vlanTag: '',
  firewall: false,
  macaddr: '',
  rate: '',
  queues: '',
  mtu: '',
  linkDown: false,
  cdrom: '',
  usbMode: 'spice',
  usbValue: '',
  usbMapping: '',
  usb3: false,
  pciMode: 'raw',
  pciAddress: '',
  pciMapping: '',
  pcie: false,
  pciAllFunctions: false,
  pciPrimaryGpu: false,
  pciRomBar: true,
  audioDevice: 'ich9-intel-hda',
  audioDriver: 'spice',
});

const kindOptions: { label: string; value: DeviceKind }[] = [
  { label: gettext('Hard Disk'), value: 'disk' },
  { label: gettext('CD/DVD Drive'), value: 'cdrom' },
  { label: gettext('Network Device'), value: 'net' },
];

async function addDevice() {
  const requiredCapability: Record<DeviceKind, string> = {
    disk: 'VM.Config.Disk',
    cdrom: 'VM.Config.CDROM',
    net: 'VM.Config.Network',
  };
  const capability = requiredCapability[form.kind];
  if (!hasVmCapability(capability)) return;

  const diskOptions = [`${form.storage}:${form.size}`];
  if (form.diskFormat !== '__default__') diskOptions.push(`format=${form.diskFormat}`);
  if (form.diskCache !== '__default__') diskOptions.push(`cache=${form.diskCache}`);
  if (!form.diskBackup) diskOptions.push('backup=0');
  if (!form.diskReplicate) diskOptions.push('replicate=0');
  if (form.diskDiscard) diskOptions.push('discard=on');
  if (form.diskIothread) diskOptions.push('iothread=on');
  if (form.diskSsd) diskOptions.push('ssd=on');
  if (form.diskReadOnly) diskOptions.push('ro=on');
  const networkOptions = [form.model, `bridge=${form.bridge}`];
  if (form.vlanTag.trim()) networkOptions.push(`tag=${form.vlanTag.trim()}`);
  if (form.firewall) networkOptions.push('firewall=1');
  if (form.macaddr.trim()) networkOptions.push(`macaddr=${form.macaddr.trim()}`);
  if (form.rate.trim()) networkOptions.push(`rate=${form.rate.trim()}`);
  if (form.queues.trim()) networkOptions.push(`queues=${form.queues.trim()}`);
  if (form.mtu.trim()) networkOptions.push(`mtu=${form.mtu.trim()}`);
  if (form.linkDown) networkOptions.push('link_down=1');

  const keys: Record<DeviceKind, string> = {
    disk: nextDeviceKey(form.diskBus),
    net: nextDeviceKey('net'),
    cdrom: nextDeviceKey('ide', 4),
  };
  const values: Record<DeviceKind, string> = {
    disk: form.storage ? diskOptions.join(',') : '',
    net: networkOptions.join(','),
    cdrom: form.cdrom
      ? `${form.cdrom}${form.cdrom.includes('media=cdrom') ? '' : ',media=cdrom'}`
      : 'none,media=cdrom',
  };
  const key = keys[form.kind];
  const value = values[form.kind];
  if (!key || !value) return;
  await updateConfig({ [key]: value });
  visible.value = false;
}
</script>

<template>
  <q-dialog v-model="visible" persistent>
    <UWindow :title="gettext('Add Hardware')" width="560px" :loading="loading">
      <div class="q-pa-md q-gutter-md">
        <q-select
          v-model="form.kind"
          dense
          square
          outlined
          emit-value
          map-options
          :label="gettext('Type')"
          :options="kindOptions"
        />
        <AddDiskForm v-if="form.kind === 'disk'" v-model:form="form" />
        <AddNetworkForm v-else-if="form.kind === 'net'" v-model:form="form" />
        <AddCdromForm v-else-if="form.kind === 'cdrom'" v-model:form="form" />
      </div>
      <template #foot>
        <q-btn v-close-popup no-caps outline size="12px" class="u-button" :label="gettext('Cancel')" />
        <q-btn
          no-caps
          flat
          size="12px"
          class="bg-primary text-grey-1 u-button"
          :label="gettext('Add')"
          @click="addDevice"
        />
      </template>
    </UWindow>
  </q-dialog>
</template>
