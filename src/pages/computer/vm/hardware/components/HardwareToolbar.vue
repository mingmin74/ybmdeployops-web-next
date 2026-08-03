<script setup lang="ts">
import { gettext } from '@/locale';

defineProps<{
  isDisk: boolean;
  canRemove: boolean;
  canRevert: boolean;
}>();

const emit = defineEmits<{
  add: [kind: 'disk' | 'cdrom' | 'net' | 'usb' | 'pci' | 'serial' | 'audio'];
  addFirmware: [kind: 'efi' | 'tpm'];
  addCloudInit: [];
  addRng: [];
  addVirtiofs: [];
  importDisk: [];
  remove: [];
  resize: [];
  move: [];
  revert: [];
}>();

const addItems: { label: string; action: () => void }[] = [
  { label: gettext('Hard Disk'), action: () => emit('add', 'disk') },
  { label: gettext('Import Hard Disk'), action: () => emit('importDisk') },
  { label: gettext('CD/DVD Drive'), action: () => emit('add', 'cdrom') },
  { label: gettext('Network Device'), action: () => emit('add', 'net') },
  { label: gettext('EFI Disk'), action: () => emit('addFirmware', 'efi') },
  { label: gettext('TPM State'), action: () => emit('addFirmware', 'tpm') },
  { label: gettext('USB Device'), action: () => emit('add', 'usb') },
  { label: gettext('PCI Device'), action: () => emit('add', 'pci') },
  { label: gettext('Serial Port'), action: () => emit('add', 'serial') },
  { label: gettext('CloudInit Drive'), action: () => emit('addCloudInit') },
  { label: gettext('Audio Device'), action: () => emit('add', 'audio') },
  { label: gettext('VirtIO RNG'), action: () => emit('addRng') },
  { label: gettext('Virtiofs'), action: () => emit('addVirtiofs') },
];
</script>

<template>
  <div class="row q-gutter-sm q-py-sm hardware-toolbar">
    <q-btn-dropdown no-caps outline size="12px" color="primary" class="u-button" :label="gettext('Add')">
      <q-list>
        <q-item v-for="item in addItems" :key="item.label" v-close-popup clickable dense @click="item.action">
          <q-item-section>{{ item.label }}</q-item-section>
        </q-item>
      </q-list>
    </q-btn-dropdown>
    <q-btn no-caps outline size="12px" color="negative" class="u-button" :disable="!canRemove" :label="gettext('Remove')" @click="emit('remove')" />
    <q-btn no-caps outline size="12px" color="primary" class="u-button" :disable="!isDisk" :label="gettext('Resize disk')" @click="emit('resize')" />
    <q-btn no-caps outline size="12px" color="primary" class="u-button" :disable="!isDisk" :label="gettext('Move disk')" @click="emit('move')" />
    <q-btn no-caps outline size="12px" color="primary" class="u-button" :disable="!canRevert" :label="gettext('Revert pending changes')" @click="emit('revert')" />
  </div>
</template>

<style scoped lang="scss">
.hardware-toolbar { margin-top: 0; margin-bottom: 4px; }
</style>
