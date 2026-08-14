<script setup lang="ts">
import { computed, reactive, shallowRef, watch } from 'vue';
import { gettext } from '@/locale';
import UWindow from '@/components/UWindow.vue';
import { getVmConfig, updateVmConfig } from '@/api/overview';
import { getNodeStorage, getStorageContent } from '@/api/storageContent';
import { getNodes, type PveRecord } from '@/api/resources';
import { textValue } from '@/utils/pveFormat';
import { useVmHardwareContext } from '../context/vmHardwareContext';
import AddCdromForm from '../add/forms/AddCdromForm.vue';
import AddDiskForm from '../add/forms/AddDiskForm.vue';
import AddNetworkForm from '../add/forms/AddNetworkForm.vue';
import AddUsbForm from '../add/forms/AddUsbForm.vue';
import AddPciForm from '../add/forms/AddPciForm.vue';
import AddSerialForm from '../add/forms/AddSerialForm.vue';
import AddAudioForm from '../add/forms/AddAudioForm.vue';
import { allowedDiskBusses, nextFreeDiskSlot, nextFreeDiskSlotForBus, sortedDiskBusses, storageFormats, validDiskBandwidth, validDiskDeviceId, validDiskSize, type DiskBus } from '../utils/diskController';

type DeviceKind = 'disk' | 'cdrom' | 'net' | 'usb' | 'pci' | 'serial' | 'audio';
type CdromBus = Exclude<DiskBus, 'virtio'>;
type CdromMediaType = 'iso' | 'cdrom' | 'none';
type UsbMode = 'spice' | 'mapped' | 'hostdevice' | 'port';
type PciMode = 'mapped' | 'raw';
type AddHardwareForm = {
  kind: DeviceKind;
  storage: string;
  existingVolume: string;
  size: number;
  diskBus: DiskBus;
  diskDeviceId: number;
  diskFormat: string;
  diskCache: string;
  diskBackup: boolean;
  diskSkipReplication: boolean;
  diskDiscard: boolean;
  diskIothread: boolean;
  diskSsd: boolean;
  diskReadOnly: boolean;
  diskAio: string;
  mbps_rd: string;
  mbps_wr: string;
  iops_rd: string;
  iops_wr: string;
  mbps_rd_max: string;
  mbps_wr_max: string;
  iops_rd_max: string;
  iops_wr_max: string;
  bridge: string;
  model: string;
  vlanTag: string;
  firewall: boolean;
  macaddr: string;
  rate: string;
  queues: string;
  mtu: string;
  linkDown: boolean;
  cdromMediaType: CdromMediaType;
  cdromStorage: string;
  cdromVolid: string;
  cdromBus: CdromBus;
  cdromDeviceId: number;
  usbMode: UsbMode;
  usbValue: string;
  usbMapping: string;
  usb3: boolean;
  pciMode: PciMode;
  pciAddress: string;
  pciMapping: string;
  pciMdev: string;
  pcie: boolean;
  pciAllFunctions: boolean;
  pciPrimaryGpu: boolean;
  pciRomBar: boolean;
  pciVendorId: string;
  pciDeviceId: string;
  pciSubVendorId: string;
  pciSubDeviceId: string;
  serialId: number;
  audioDevice: string;
  audioDriver: string;
};

const visible = defineModel<boolean>({ default: false });
const { initialKind = 'disk' } = defineProps<{ initialKind?: DeviceKind }>();
const { config, hasVmCapability, loading, nextDeviceKey, updateConfig, node, vmid, notifyTask, notifyUpdated } = useVmHardwareContext();
const openedConfig = shallowRef<PveRecord | null>(null);
const openedDigest = shallowRef('');
const hostArch = shallowRef('x86_64');
const storages = shallowRef<PveRecord[]>([]);
const existingVolumes = shallowRef<PveRecord[]>([]);
const storageLoaded = shallowRef(false);
let dialogSession = 0;
let existingVolumeRequest = 0;
const addDiskFormKey = shallowRef(0);
const addCdromFormKey = shallowRef(0);
const addDiskAdvanced = shallowRef(false);
const addNetworkAdvanced = shallowRef(false);
const form = reactive<AddHardwareForm>({
  kind: 'disk',
  storage: '',
  existingVolume: '',
  size: 32,
  diskBus: 'scsi',
  diskDeviceId: 0,
  diskFormat: 'raw',
  diskCache: '__default__',
  diskBackup: true,
  diskSkipReplication: false,
  diskDiscard: false,
  diskIothread: false,
  diskSsd: false,
  diskReadOnly: false,
  diskAio: '__default__',
  mbps_rd: '',
  mbps_wr: '',
  iops_rd: '',
  iops_wr: '',
  mbps_rd_max: '',
  mbps_wr_max: '',
  iops_rd_max: '',
  iops_wr_max: '',
  bridge: 'vmbr0',
  model: 'virtio',
  vlanTag: '',
  firewall: false,
  macaddr: '',
  rate: '',
  queues: '',
  mtu: '',
  linkDown: false,
  cdromMediaType: 'iso',
  cdromStorage: '',
  cdromVolid: '',
  cdromBus: 'ide',
  cdromDeviceId: 2,
  usbMode: 'spice',
  usbValue: '',
  usbMapping: '',
  usb3: false,
  pciMode: 'raw',
  pciAddress: '',
  pciMapping: '',
  pciMdev: '',
  pcie: false,
  pciAllFunctions: false,
  pciPrimaryGpu: false,
  pciRomBar: true,
  pciVendorId: '',
  pciDeviceId: '',
  pciSubVendorId: '',
  pciSubDeviceId: '',
  serialId: 0,
  audioDevice: 'ich9-intel-hda',
  audioDriver: 'spice',
});

const diskConfig = computed(() => openedConfig.value || config.value);
const selectedStorage = computed(() => storages.value.find((item) => textValue(item.storage) === form.storage));
const diskFormatOptions = computed(() => storageFormats(selectedStorage.value).values);
const selectExisting = computed(() => Boolean(selectedStorage.value?.select_existing));
const diskBusOptions = computed(() => allowedDiskBusses(diskConfig.value, hostArch.value).map((value) => ({ label: value === 'virtio' ? 'VirtIO Block' : value.toUpperCase(), value })));
const supportsDiskIoThread = computed(() => form.diskBus === 'scsi' || form.diskBus === 'virtio');
const diskKey = computed(() => `${form.diskBus}${form.diskDeviceId}`);
const diskKeyAvailable = computed(() => validDiskDeviceId(diskConfig.value, form.diskBus, form.diskDeviceId));
const cdromKey = computed(() => `${form.cdromBus}${form.cdromDeviceId}`);
const cdromKeyAvailable = computed(() => !config.value[cdromKey.value]);
const scsiControllerOptions = [
  { label: `${gettext('Default')} (LSI 53C895A)`, value: '__default__' },
  { label: 'LSI 53C895A', value: 'lsi' },
  { label: 'LSI 53C810', value: 'lsi53c810' },
  { label: 'MegaRAID SAS 8708EM2', value: 'megasas' },
  { label: 'VirtIO SCSI', value: 'virtio-scsi-pci' },
  { label: 'VirtIO SCSI single', value: 'virtio-scsi-single' },
  { label: 'VMware PVSCSI', value: 'pvscsi' },
];
const scsiControllerLabel = computed(() => {
  const value = textValue(diskConfig.value.scsihw) || '__default__';
  return scsiControllerOptions.find((option) => option.value === value)?.label || value;
});
const addTitle = computed(() => {
  if (form.kind === 'disk') return gettext('Add Hard Disk');
  if (form.kind === 'cdrom') return `${gettext('Add')}:${gettext('CD/DVD Drive')}`;
  if (form.kind === 'net') return `${gettext('Add')}:${gettext('Network Device')}`;
  if (form.kind === 'usb') return `${gettext('Add')}:${gettext('USB Device')}`;
  if (form.kind === 'pci') return `${gettext('Add')}:${gettext('PCI Device')}`;
  if (form.kind === 'serial') return `${gettext('Add')}:${gettext('Serial Port')}`;
  if (form.kind === 'audio') return `${gettext('Add')}:${gettext('Audio Device')}`;
  return gettext('Add Hardware');
});
const canAdd = computed(() => {
  if (form.kind === 'disk') return Boolean(storageLoaded.value && selectedStorage.value && diskFormatOptions.value.includes(form.diskFormat) && diskKeyAvailable.value && validDiskBandwidth(form) && (selectExisting.value ? form.existingVolume.trim() && existingVolumes.value.some((item) => textValue(item.volid || item.text) === form.existingVolume) : validDiskSize(form.size)));
  if (form.kind === 'cdrom') {
    return Boolean(
      cdromKeyAvailable.value &&
      form.cdromDeviceId >= 0 &&
      form.cdromDeviceId < cdromBusLimits[form.cdromBus] &&
      (form.cdromMediaType !== 'iso' || form.cdromVolid.trim()),
    );
  }
  if (form.kind === 'net') return networkFormValid();
  if (form.kind === 'usb') return Boolean(usbKeyAvailable.value && usbValue());
  if (form.kind === 'pci') return Boolean(pciKeyAvailable.value && pciValue());
  if (form.kind === 'serial') return Boolean(serialIdValid.value && serialKeyAvailable.value);
  if (form.kind === 'audio') return Boolean(audioKeyAvailable.value && audioValue());
  return true;
});

const cdromBusLimits: Record<CdromBus, number> = {
  ide: 4,
  sata: 6,
  scsi: 31,
};

const usbKey = computed(() => nextDeviceKey('usb', maxUsbCount()));
const usbKeyAvailable = computed(() => !config.value[usbKey.value]);
const usb3Disabled = computed(() => maxUsbCount() > 5);
const pciKey = computed(() => nextDeviceKey('hostpci', 16));
const pciKeyAvailable = computed(() => !config.value[pciKey.value]);
const pcieSupported = computed(() => textValue(config.value.machine).includes('q35'));
const serialIdValid = computed(
  () => Number.isInteger(form.serialId) && form.serialId >= 0 && form.serialId <= 3,
);
const serialKey = computed(() => `serial${form.serialId}`);
const serialKeyAvailable = computed(() => serialIdValid.value && !config.value[serialKey.value]);
const audioKeyAvailable = computed(() => config.value.audio0 === undefined);

function nextFreeCdromSlot(preferredBusses: CdromBus[] = ['ide', 'scsi', 'sata']) {
  if (preferredBusses.includes('ide') && config.value.ide2 === undefined) {
    return { bus: 'ide' as const, id: 2 };
  }
  for (const bus of preferredBusses) {
    for (let id = 0; id < cdromBusLimits[bus]; id += 1) {
      if (config.value[`${bus}${id}`] === undefined) return { bus, id };
    }
  }
  const bus = preferredBusses[0] || 'ide';
  return { bus, id: Math.max(cdromBusLimits[bus] - 1, 0) };
}

function resetDiskDefaults() {
  const slot = nextFreeDiskSlot(diskConfig.value, sortedDiskBusses(diskConfig.value, hostArch.value));
  Object.assign(form, {
    storage: '',
    existingVolume: '',
    size: 32,
    diskBus: slot.bus,
    diskDeviceId: slot.id,
    diskFormat: 'raw',
    diskCache: '__default__',
    diskBackup: true,
    diskSkipReplication: false,
    diskDiscard: false,
    diskIothread: slot.bus === 'virtio' || (slot.bus === 'scsi' && textValue(diskConfig.value.scsihw) === 'virtio-scsi-single'),
    diskSsd: false,
    diskReadOnly: false,
    diskAio: '__default__',
    mbps_rd: '',
    mbps_wr: '',
    iops_rd: '',
    iops_wr: '',
    mbps_rd_max: '',
    mbps_wr_max: '',
    iops_rd_max: '',
    iops_wr_max: '',
  });
}

function resetCdromDefaults() {
  const slot = nextFreeCdromSlot();
  Object.assign(form, {
    cdromMediaType: 'iso',
    cdromStorage: '',
    cdromVolid: '',
    cdromBus: slot.bus,
    cdromDeviceId: slot.id,
  });
}

function resetNetworkDefaults() {
  Object.assign(form, {
    bridge: '',
    model: ['wxp', 'w2k'].includes(textValue(config.value.ostype))
      ? 'rtl8139'
      : textValue(config.value.ostype) === 'l26'
        ? 'virtio'
        : 'e1000',
    vlanTag: '',
    firewall: true,
    macaddr: '',
    rate: '',
    queues: '',
    mtu: '',
    linkDown: false,
  });
}

function resetUsbDefaults() {
  Object.assign(form, {
    usbMode: 'spice',
    usbValue: '',
    usbMapping: '',
    usb3: false,
  });
}

function resetPciDefaults() {
  Object.assign(form, {
    pciMode: 'mapped',
    pciAddress: '',
    pciMapping: '',
    pciMdev: '',
    pcie: false,
    pciAllFunctions: false,
    pciPrimaryGpu: false,
    pciRomBar: true,
    pciVendorId: '',
    pciDeviceId: '',
    pciSubVendorId: '',
    pciSubDeviceId: '',
  });
}

function nextFreeSerialId() {
  for (let id = 0; id < 4; id += 1) {
    if (config.value[`serial${id}`] === undefined) return id;
  }
  return 0;
}

function resetSerialDefaults() {
  Object.assign(form, {
    serialId: nextFreeSerialId(),
  });
}

function resetAudioDefaults() {
  Object.assign(form, {
    audioDevice: 'ich9-intel-hda',
    audioDriver: 'spice',
  });
}

watch(visible, (isVisible) => {
  if (!isVisible) return;
  void initializeDisk();
  form.kind = initialKind;
  if (initialKind === 'disk') {
    resetDiskDefaults();
    addDiskAdvanced.value = false;
    addDiskFormKey.value += 1;
  }
  if (initialKind === 'net') {
    addNetworkAdvanced.value = false;
  }
  if (initialKind === 'cdrom') {
    resetCdromDefaults();
    addCdromFormKey.value += 1;
  }
  if (initialKind === 'net') resetNetworkDefaults();
  if (initialKind === 'usb') resetUsbDefaults();
  if (initialKind === 'pci') resetPciDefaults();
  if (initialKind === 'serial') resetSerialDefaults();
  if (initialKind === 'audio') resetAudioDefaults();
});

watch(
  () => form.diskBus,
  (bus) => {
    form.diskDeviceId = nextFreeDiskSlotForBus(diskConfig.value, bus).id;
    form.diskIothread = bus === 'virtio' || (bus === 'scsi' && textValue(diskConfig.value.scsihw) === 'virtio-scsi-single');
  },
);

watch(() => form.storage, async () => {
  const request = ++existingVolumeRequest;
  form.existingVolume = '';
  existingVolumes.value = [];
  const storage = selectedStorage.value;
  const formats = storageFormats(storage);
  form.diskFormat = formats.selected;
  if (!selectExisting.value || !form.storage) return;
  const storageName = form.storage;
  const response = await getStorageContent(node.value, storageName, 'images');
  if (request === existingVolumeRequest && storageName === form.storage)
    existingVolumes.value = response.data || [];
});

async function initializeDisk() {
  if (initialKind !== 'disk' || !hasVmCapability('VM.Config.Disk')) return;
  const session = ++dialogSession;
  existingVolumeRequest += 1;
  storageLoaded.value = false;
  storages.value = [];
  existingVolumes.value = [];
  openedConfig.value = null;
  openedDigest.value = '';
  loading.value = true;
  try {
    const [configResponse, storageResponse, nodesResponse] = await Promise.all([
      getVmConfig(node.value, vmid.value), getNodeStorage(node.value, 'images'), getNodes(),
    ]);
    if (session !== dialogSession || !visible.value) return;
    openedConfig.value = configResponse.data || null;
    openedDigest.value = textValue(configResponse.data?.digest);
    hostArch.value = textValue(nodesResponse.data?.find((item) => item.node === node.value)?.['host-arch']) || 'x86_64';
    storages.value = storageResponse.data || [];
    storageLoaded.value = true;
    resetDiskDefaults();
  } finally {
    if (session === dialogSession) loading.value = false;
  }
}

watch(
  () => supportsDiskIoThread.value,
  (supported) => {
    if (!supported) {
      form.diskIothread = false;
      form.diskReadOnly = false;
    }
  },
);

watch(
  () => form.cdromBus,
  (bus) => {
    if (form.kind === 'cdrom') form.cdromDeviceId = nextFreeCdromSlot([bus]).id;
  },
);

function pushOptional(parts: string[], key: string, value: string) {
  if (value.trim()) parts.push(`${key}=${value.trim()}`);
}

function diskValue() {
  const parts = [selectExisting.value ? form.existingVolume.trim() : `${form.storage.trim()}:${form.size}`];
  if (form.diskFormat) parts.push(`format=${form.diskFormat}`);
  if (!form.diskBackup) parts.push('backup=0');
  if (form.diskSkipReplication) parts.push('replicate=no');
  if (form.diskDiscard) parts.push('discard=on');
  if (form.diskBus !== 'virtio' && form.diskSsd) parts.push('ssd=on');
  if (supportsDiskIoThread.value && form.diskIothread) parts.push('iothread=on');
  if (supportsDiskIoThread.value && form.diskReadOnly) parts.push('ro=on');
  if (form.diskCache !== '__default__') parts.push(`cache=${form.diskCache}`);
  if (form.diskAio !== '__default__') parts.push(`aio=${form.diskAio}`);
  pushOptional(parts, 'mbps_rd', form.mbps_rd);
  pushOptional(parts, 'mbps_wr', form.mbps_wr);
  pushOptional(parts, 'iops_rd', form.iops_rd);
  pushOptional(parts, 'iops_wr', form.iops_wr);
  pushOptional(parts, 'mbps_rd_max', form.mbps_rd_max);
  pushOptional(parts, 'mbps_wr_max', form.mbps_wr_max);
  pushOptional(parts, 'iops_rd_max', form.iops_rd_max);
  pushOptional(parts, 'iops_wr_max', form.iops_wr_max);
  return parts.join(',');
}

function cdromValue() {
  if (form.cdromMediaType === 'cdrom') return 'cdrom,media=cdrom';
  if (form.cdromMediaType === 'none') return 'none,media=cdrom';
  return `${form.cdromVolid.trim()},media=cdrom`;
}

function networkFormValid() {
  const tag = Number(form.vlanTag);
  const rate = Number(form.rate);
  const queues = Number(form.queues);
  const mtu = Number(form.mtu);
  return Boolean(
    form.bridge.trim() &&
    (!form.vlanTag.trim() || (Number.isInteger(tag) && tag >= 1 && tag <= 4094)) &&
    (!form.macaddr.trim() || /^[0-9a-f]{2}(:[0-9a-f]{2}){5}$/i.test(form.macaddr.trim())) &&
    (!form.rate.trim() || (Number.isFinite(rate) && rate >= 0 && rate <= 10240)) &&
    (!form.queues.trim() || (Number.isInteger(queues) && queues >= 1 && queues <= 64)) &&
    (!form.mtu.trim() ||
      form.model !== 'virtio' ||
      (Number.isInteger(mtu) && mtu >= 1 && mtu <= 65520 && (mtu === 1 || mtu >= 576))),
  );
}

function maxUsbCount() {
  const ostype = textValue(config.value.ostype);
  const machine = textValue(config.value.machine);
  const match = /-(\d+)\.(\d+)/.exec(machine);
  const machineSupportsNewUsb = !match || Number(`${match[1]}.${match[2]}`) >= 7.1;
  if (
    machineSupportsNewUsb &&
    (ostype === 'l26' || (/^win(\d+)$/.test(ostype) && Number(/^win(\d+)$/.exec(ostype)?.[1]) > 7))
  ) {
    return 14;
  }
  return 5;
}

function usbValue() {
  if (form.usbMode === 'spice') return 'spice';
  if (form.usbMode === 'mapped' && form.usbMapping.trim())
    return `mapping=${form.usbMapping.trim()}`;
  if ((form.usbMode === 'hostdevice' || form.usbMode === 'port') && form.usbValue.trim()) {
    const parts = [`host=${form.usbValue.trim()}`];
    if (form.usb3 && !usb3Disabled.value) parts.push('usb3=1');
    return parts.join(',');
  }
  return '';
}

function normalizePciHost(host: string) {
  let value = host.trim();
  if (value.startsWith('0000:')) value = value.slice(5);
  if (form.pciAllFunctions && value.includes('.')) value = value.slice(0, value.lastIndexOf('.'));
  return value;
}

function pciValue() {
  const parts =
    form.pciMode === 'mapped'
      ? [`mapping=${form.pciMapping.trim()}`]
      : [normalizePciHost(form.pciAddress)];

  if (!parts[0]) return '';
  pushOptional(parts, 'mdev', form.pciMdev);
  if (!form.pciRomBar) parts.push('rombar=0');
  if (form.pciPrimaryGpu) parts.push('x-vga=1');
  if (pcieSupported.value && form.pcie) parts.push('pcie=1');
  pushOptional(parts, 'vendor-id', form.pciVendorId);
  pushOptional(parts, 'device-id', form.pciDeviceId);
  pushOptional(parts, 'sub-vendor-id', form.pciSubVendorId);
  pushOptional(parts, 'sub-device-id', form.pciSubDeviceId);
  return parts.join(',');
}

function audioValue() {
  if (!form.audioDevice.trim()) return '';
  const parts = [`device=${form.audioDevice.trim()}`];
  if (form.audioDriver.trim()) parts.push(`driver=${form.audioDriver.trim()}`);
  return parts.join(',');
}

async function addDevice() {
  const requiredCapability: Record<DeviceKind, string> = {
    disk: 'VM.Config.Disk',
    cdrom: 'VM.Config.CDROM',
    net: 'VM.Config.Network',
    usb: 'VM.Config.HWType',
    pci: 'VM.Config.HWType',
    serial: 'VM.Config.HWType',
    audio: 'VM.Config.HWType',
  };
  const capability = requiredCapability[form.kind];
  if (!hasVmCapability(capability)) return;

  const networkOptions = [
    form.macaddr.trim() ? `${form.model}=${form.macaddr.trim()}` : form.model,
    `bridge=${form.bridge.trim()}`,
  ];
  if (form.vlanTag.trim()) networkOptions.push(`tag=${form.vlanTag.trim()}`);
  if (form.firewall) networkOptions.push('firewall=1');
  if (form.rate.trim()) networkOptions.push(`rate=${form.rate.trim()}`);
  if (form.queues.trim()) networkOptions.push(`queues=${form.queues.trim()}`);
  if (form.model === 'virtio' && form.mtu.trim()) networkOptions.push(`mtu=${form.mtu.trim()}`);
  if (form.linkDown) networkOptions.push('link_down=1');
  const keys: Record<DeviceKind, string> = {
    disk: diskKey.value,
    net: nextDeviceKey('net'),
    cdrom: cdromKey.value,
    usb: usbKey.value,
    pci: pciKey.value,
    serial: serialKey.value,
    audio: 'audio0',
  };
  const values: Record<DeviceKind, string> = {
    disk: form.storage.trim() && diskKeyAvailable.value ? diskValue() : '',
    net: networkOptions.join(','),
    cdrom: canAdd.value ? cdromValue() : '',
    usb: usbValue(),
    pci: pciValue(),
    serial: 'socket',
    audio: audioValue(),
  };
  const key = keys[form.kind];
  const value = values[form.kind];
  if (!key || !value) return;
  if (form.kind === 'disk') {
    loading.value = true;
    try {
      const result = await updateVmConfig(node.value, vmid.value, { digest: openedDigest.value, background_delay: 5, [key]: value }, 'qemu', 'POST');
      notifyUpdated();
      const upid = textValue((result as { data?: unknown }).data);
      if (upid.startsWith('UPID:')) notifyTask(upid, gettext('Add Hard Disk'));
    } finally { loading.value = false; }
  } else await updateConfig({ [key]: value });
  visible.value = false;
}
</script>

<template>
  <q-dialog v-model="visible" persistent>
    <UWindow :title="addTitle" width="600px" :loading="loading">
      <div class="q-pa-md q-gutter-md">
        <AddDiskForm
          v-if="form.kind === 'disk'"
          :key="addDiskFormKey"
          v-model:form="form"
          v-model:advanced="addDiskAdvanced"
          :scsi-controller-label="scsiControllerLabel"
          :storage-rows="storages"
          :storage-formats="diskFormatOptions"
          :select-existing="selectExisting"
          :existing-volumes="existingVolumes"
          :bus-options="diskBusOptions"
        />
        <AddNetworkForm
          v-else-if="form.kind === 'net'"
          v-model:form="form"
          v-model:advanced="addNetworkAdvanced"
        />
        <AddCdromForm
          v-else-if="form.kind === 'cdrom'"
          :key="addCdromFormKey"
          v-model:form="form"
          :device-in-use="!cdromKeyAvailable"
        />
        <AddUsbForm
          v-else-if="form.kind === 'usb'"
          v-model:form="form"
          :disable-usb3="usb3Disabled"
        />
        <AddPciForm v-else-if="form.kind === 'pci'" v-model:form="form" />
        <AddSerialForm
          v-else-if="form.kind === 'serial'"
          v-model:form="form"
          :device-in-use="serialIdValid && !serialKeyAvailable"
        />
        <AddAudioForm
          v-else-if="form.kind === 'audio'"
          v-model:form="form"
          :device-in-use="!audioKeyAvailable"
        />
      </div>
      <template #foot>
        <div class="full-width row items-center justify-between">
          <q-checkbox
            v-if="form.kind === 'disk'"
            v-model="addDiskAdvanced"
            dense
            color="primary"
            :label="gettext('Advanced')"
          />
          <q-checkbox
            v-else-if="form.kind === 'net'"
            v-model="addNetworkAdvanced"
            dense
            color="primary"
            :label="gettext('Advanced')"
          />
          <div v-else />
          <div class="row items-center q-gutter-sm">
            <q-btn
              v-close-popup
              no-caps
              outline
              size="12px"
              class="u-button"
              :label="gettext('Cancel')"
            />
            <q-btn
              no-caps
              flat
              size="12px"
              class="bg-primary text-grey-1 u-button"
              :disable="!canAdd"
              :label="gettext('Add')"
              @click="addDevice"
            />
          </div>
        </div>
      </template>
    </UWindow>
  </q-dialog>
</template>
