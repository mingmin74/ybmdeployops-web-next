import type { QTableColumn } from 'quasar';
import { computed, reactive, shallowRef, watch, type Ref } from 'vue';
import {
  createVm,
  getNextVmId,
  getVmCpuFlags,
  getVmCpuModels,
  type VmCpuFlag,
  type VmCpuModel,
} from '@/api/vm';
import { getNodes, getPools, type PveNode, type PvePool, type PveRecord } from '@/api/resources';
import { getNodeStorage, getStorageContent } from '@/api/storageContent';
import { getNodeNetwork } from '@/api/host';
import { gettext } from '@/locale';
import { useSessionStore } from '@/stores/session';
import { textValue } from '@/utils/pveFormat';
import type {
  CreateVmForm,
  CreateVmStepName,
  CreateVmWizardContext,
  DiskBus,
  DiskSettings,
  ExtraDisk,
  WizardOption,
} from '../types/createVmWizard';

/* eslint-disable no-extra-boolean-cast, @typescript-eslint/no-base-to-string */
const diskDefaults: { diskBus: DiskBus } = { diskBus: 'scsi' };

function defaultDiskSettings(): DiskSettings {
  return {
    format: 'qcow2',
    cache: '__default__',
    discard: false,
    iothread: false,
    ssd: false,
    readOnly: false,
    backup: true,
    skipReplication: false,
    aio: '__default__',
    mbpsRead: '',
    mbpsWrite: '',
    iopsRead: '',
    iopsWrite: '',
    mbpsReadMax: '',
    mbpsWriteMax: '',
    iopsReadMax: '',
    iopsWriteMax: '',
  };
}

type CreateVmWizardEmit = {
  (event: 'completed'): void;
  (event: 'task', payload: { node: string; upid: string; title: string }): void;
};

export function useCreateVmWizard(
  model: Ref<boolean>,
  emit: CreateVmWizardEmit,
): CreateVmWizardContext {
  const session = useSessionStore();
  const loading = shallowRef(false);
  const step = shallowRef<CreateVmStepName>('general');
  const advanced = shallowRef(false);
  const nodes = shallowRef<PveNode[]>([]);
  const pools = shallowRef<PvePool[]>([]);
  const storageNames = shallowRef<string[]>([]);
  const isoStorageNames = shallowRef<string[]>([]);
  const isoImages = shallowRef<string[]>([]);
  const imageStorageRows = shallowRef<PveRecord[]>([]);
  const importStorageRows = shallowRef<PveRecord[]>([]);
  const importImageRows = reactive<Record<string, PveRecord[]>>({});
  const isoStorageRows = shallowRef<PveRecord[]>([]);
  const isoImageRows = shallowRef<PveRecord[]>([]);
  const virtioIsoImageRows = shallowRef<PveRecord[]>([]);
  const cpuModels = shallowRef<VmCpuModel[]>([]);
  const cpuFlags = shallowRef<VmCpuFlag[]>([]);
  const bridges = shallowRef<PveRecord[]>([]);
  const vmidError = shallowRef('');
  const tagInput = shallowRef('');
  const tagError = shallowRef('');
  const validationErrors = reactive<Record<string, string>>({});
  const nextExtraDiskId = shallowRef(1);
  const activeDiskId = shallowRef<number | 'primary'>('primary');
  const activeDiskTab = shallowRef<'disk' | 'bandwidth'>('disk');
  const diskSplitter = shallowRef(20);
  const extraDisks = reactive<ExtraDisk[]>([]);
  const form = reactive<CreateVmForm>({
    node: '',
    vmid: '',
    name: '',
    pool: '',
    haManaged: false,
    onboot: false,
    startupOrder: '',
    startupUp: '',
    startupDown: '',
    tags: '',
    arch: '__default__',
    ostype: 'l26',
    osbase: 'Linux',
    mediaType: 'iso',
    isoStorage: '',
    cdrom: '',
    enableVirtioDrivers: false,
    virtioIsoStorage: '',
    virtioDriversCdrom: '',
    agent: false,
    vga: '__default__',
    bios: 'seabios',
    machine: '__default__',
    scsihw: '__default__',
    addEfiDisk: false,
    efiStorage: '',
    efiFormat: 'raw',
    preEnrolledKeys: true,
    addTpm: false,
    tpmStorage: '',
    tpmFormat: 'raw',
    tpmVersion: 'v2.0',
    storage: '',
    diskBus: diskDefaults.diskBus,
    diskSlot: 0,
    diskSize: 32,
    ...defaultDiskSettings(),
    cores: 1,
    sockets: 1,
    cpu: '',
    cpuFlags: '',
    vcpus: '',
    cpulimit: '',
    cpuunits: '',
    affinity: '',
    numa: false,
    memory: 2048,
    ballooning: true,
    balloon: 2048,
    shares: '',
    allowKsm: true,
    startAfterCreated: false,
    noNetwork: false,
    bridge: 'vmbr0',
    model: 'virtio',
    vlanTag: '',
    firewall: true,
    macaddr: '',
    disconnect: false,
    rate: '',
    queues: '',
    mtu: '',
  });

  const steps = computed<Array<{ name: CreateVmStepName; title: string; icon: string }>>(() => [
    { name: 'general', title: gettext('General'), icon: 'tune' },
    { name: 'os', title: gettext('OS'), icon: 'desktop_windows' },
    { name: 'system', title: gettext('System'), icon: 'settings' },
    { name: 'disks', title: gettext('Disks'), icon: 'storage' },
    { name: 'cpu', title: gettext('CPU'), icon: 'memory' },
    { name: 'memory', title: gettext('Memory'), icon: 'memory' },
    { name: 'network', title: gettext('Network'), icon: 'lan' },
    { name: 'confirm', title: gettext('Confirm'), icon: 'fact_check' },
  ]);
  const onlineNodes = computed(() => nodes.value.filter((node) => node.status === 'online'));
  const hostArchitecture = computed(() => {
    const node = nodes.value.find((item) => item.node === form.node) as
      | (PveNode & { 'host-arch'?: unknown })
      | undefined;
    return textValue(node?.['host-arch']) || 'x86_64';
  });
  const effectiveArch = computed(() =>
    form.arch === '__default__' ? hostArchitecture.value : form.arch,
  );
  const crossArchitecture = computed(
    () => form.arch !== '__default__' && form.arch !== hostArchitecture.value,
  );
  const isoStorageColumns: QTableColumn<PveRecord>[] = [
    {
      name: 'storage',
      label: gettext('Storage'),
      field: (row) => textValue(row.storage),
      align: 'left',
    },
    { name: 'type', label: gettext('Type'), field: (row) => textValue(row.type), align: 'left' },
    {
      name: 'content',
      label: gettext('Content'),
      field: (row) => textValue(row.content),
      align: 'left',
    },
  ];
  const cpuModelColumns: QTableColumn<PveRecord>[] = [
    {
      name: 'displayname',
      label: gettext('Model'),
      field: (row) => textValue(row.displayname),
      align: 'left',
    },
    {
      name: 'vendor',
      label: gettext('Vendor'),
      field: (row) => textValue(row.vendor),
      align: 'left',
    },
  ];
  const bridgeColumns: QTableColumn<PveRecord>[] = [
    {
      name: 'iface',
      label: gettext('Bridge'),
      field: (row) => textValue(row.iface),
      align: 'left',
    },
    {
      name: 'running',
      label: gettext('Running'),
      field: (row) => (Boolean(row.active ?? row.running) ? gettext('Yes') : gettext('No')),
      align: 'left',
    },
    {
      name: 'comment',
      label: gettext('Comment'),
      field: (row) => textValue(row.comments ?? row.comment),
      align: 'left',
    },
  ];
  const cpuFlagColumns: QTableColumn<VmCpuFlag>[] = [
    {
      name: 'state',
      label: gettext('Value'),
      field: () => '',
      align: 'left',
      style: 'width: 200px',
      headerStyle: 'width: 200px',
    },
    {
      name: 'name',
      label: gettext('Flag'),
      field: (row) => textValue(row.name),
      align: 'left',
      style: 'width: 110px',
      headerStyle: 'width: 110px',
    },
    {
      name: 'description',
      label: gettext('Description'),
      field: (row) => textValue(row.description),
      align: 'left',
    },
    {
      name: 'supported-on',
      label: gettext('Supported On'),
      field: (row) => (Array.isArray(row['supported-on']) ? row['supported-on'].join(', ') : ''),
      align: 'left',
      style: 'width: 150px',
      headerStyle: 'width: 150px',
    },
  ];
  const cpuFlagStateOptions = [
    { label: gettext('Off'), value: '-' },
    { label: gettext('Default'), value: '=' },
    { label: gettext('On'), value: '+' },
  ];
  const isoImageColumns: QTableColumn<PveRecord>[] = [
    {
      name: 'volid',
      label: gettext('ISO image'),
      field: (row) => isoImageName(row.volid),
      align: 'left',
      style: 'width: 280px; max-width: 280px',
      headerStyle: 'width: 280px',
    },
    {
      name: 'format',
      label: gettext('Format'),
      field: (row) => textValue(row.format),
      align: 'left',
      style: 'width: 76px',
      headerStyle: 'width: 76px',
    },
    {
      name: 'size',
      label: gettext('Size'),
      field: (row) => formatIsoSize(row.size),
      align: 'right',
      style: 'width: 96px',
      headerStyle: 'width: 96px',
    },
  ];
  const importImageColumns: QTableColumn<PveRecord>[] = [
    {
      name: 'volid',
      label: gettext('Select Image'),
      field: (row) => textValue(row.volid),
      align: 'left',
    },
    {
      name: 'format',
      label: gettext('Format'),
      field: (row) => textValue(row.format),
      align: 'left',
    },
    {
      name: 'size',
      label: gettext('Size'),
      field: (row) => formatIsoSize(row.size),
      align: 'right',
    },
  ];
  const tags = computed(() =>
    form.tags
      .split(/[;, ]/)
      .map((tag) => tag.trim())
      .filter(Boolean),
  );
  const validationErrorEntries = computed(() => Object.entries(validationErrors));
  const osBaseOptions = computed(() => {
    const options = [
      { label: gettext('Linux'), value: 'Linux' },
      { label: gettext('Microsoft Windows'), value: 'Microsoft Windows' },
      { label: gettext('Solaris Kernel'), value: 'Solaris Kernel' },
      { label: gettext('Other'), value: 'Other' },
    ];
    return effectiveArch.value === 'aarch64'
      ? options.filter((option) => option.value === 'Linux' || option.value === 'Other')
      : options;
  });
  const osVersionOptions = computed<WizardOption[]>(() => {
    const byBase: Record<string, Array<{ label: string; value: string }>> = {
      Linux: [
        { label: '6.x - 2.6 Kernel', value: 'l26' },
        { label: '2.4 Kernel', value: 'l24' },
      ],
      'Microsoft Windows': [
        { label: '11/2022/2025', value: 'win11' },
        { label: '10/2016/2019', value: 'win10' },
        { label: '8.x/2012/2012r2', value: 'win8' },
        { label: '7/2008r2', value: 'win7' },
        { label: 'Vista/2008', value: 'w2k8' },
        { label: 'XP/2003', value: 'wxp' },
        { label: '2000', value: 'w2k' },
      ],
      'Solaris Kernel': [{ label: '-', value: 'solaris' }],
      Other: [{ label: '-', value: 'other' }],
    };
    const options = byBase[form.osbase] || byBase.Linux || [];
    return effectiveArch.value === 'aarch64'
      ? options.filter((option) => ['l26', 'other'].includes(option.value))
      : options;
  });
  const cdromDevice = computed(() => (effectiveArch.value === 'aarch64' ? 'scsi2' : 'ide2'));
  const cdromValue = computed(() => {
    const file = form.mediaType === 'iso' ? form.cdrom.trim() : form.mediaType;
    return `${file || 'none'},media=cdrom`;
  });
  const diskBusOptions = computed(() => [
    { label: 'SCSI', value: 'scsi' },
    { label: 'VirtIO', value: 'virtio' },
    { label: 'SATA', value: 'sata' },
    ...(effectiveArch.value === 'aarch64' ? [] : [{ label: 'IDE', value: 'ide' }]),
  ]);
  const diskBusSlotLimits: Record<DiskBus, number> = {
    ide: 4,
    sata: 6,
    scsi: 31,
    virtio: 16,
  };
  const diskStorageRows = computed(() =>
    imageStorageRows.value.filter((row) =>
      row.avail === undefined ? true : Number(row.avail) > 0,
    ),
  );
  const diskStorageNames = computed(() =>
    diskStorageRows.value.map((row) => textValue(row.storage)).filter(Boolean),
  );
  const cacheOptions = [
    { label: `${gettext('Default')} (${gettext('No cache')})`, value: '__default__' },
    { label: 'Direct sync', value: 'directsync' },
    { label: 'Write through', value: 'writethrough' },
    { label: 'Write back', value: 'writeback' },
    { label: `Write back (${gettext('unsafe')})`, value: 'unsafe' },
    { label: gettext('No cache'), value: 'none' },
  ];
  const aioOptions = [
    { label: `${gettext('Default')} (io_uring)`, value: '__default__' },
    { label: 'io_uring', value: 'io_uring' },
    { label: 'native', value: 'native' },
    { label: 'threads', value: 'threads' },
  ];
  function storageFormatInfo(storageName: string, storageRows = diskStorageRows.value) {
    const storage = storageRows.find((row) => textValue(row.storage) === storageName);
    const formats = storage?.formats;
    let supported: string[] = [];
    let defaultFormat = 'raw';
    if (formats && typeof formats === 'object' && !Array.isArray(formats)) {
      const source = formats as Record<string, unknown>;
      if (Array.isArray(source.supported)) {
        supported = source.supported.map(String);
        defaultFormat = textValue(source.default) || defaultFormat;
      } else {
        supported = Object.entries(source)
          .filter(([, enabled]) => Boolean(enabled))
          .map(([format]) => format);
      }
    }
    return { supported, defaultFormat };
  }
  function diskFormatOptions(storageName: string) {
    const { supported } = storageFormatInfo(storageName);
    const values = supported.length ? supported : ['raw', 'qcow2'];
    return ['raw', 'qcow2', 'vmdk'].filter((value) => values.includes(value)).map((value) => ({
      label:
        value === 'raw'
          ? `${gettext('Raw disk image')} (raw)`
          : value === 'qcow2'
            ? `${gettext('QEMU image format')} (qcow2)`
            : `${gettext('VMware image format')} (vmdk)`,
      value,
    }));
  }
  function diskFormatDisabled(storageName: string) {
    if (!storageName) return true;
    return (
      storageFormatInfo(storageName).supported.filter((format) =>
        ['raw', 'qcow2', 'vmdk'].includes(format),
      ).length <= 1
    );
  }
  function resetDiskFormat(disk: Pick<DiskSettings, 'format'>, storageName: string) {
    const { supported, defaultFormat } = storageFormatInfo(storageName);
    disk.format = supported.includes('qcow2')
      ? 'qcow2'
      : supported.includes('raw')
        ? 'raw'
        : defaultFormat;
  }
  function defaultIothread(bus: DiskBus, scsiController = form.scsihw) {
    return bus === 'virtio' || (bus === 'scsi' && scsiController === 'virtio-scsi-single');
  }
  const vgaOptions = [
    { label: gettext('Default'), value: '__default__' },
    { label: 'Standard VGA', value: 'std' },
    { label: 'VMware compatible', value: 'vmware' },
    { label: 'SPICE', value: 'qxl' },
    { label: 'SPICE dual monitor', value: 'qxl2' },
    { label: 'SPICE three monitors', value: 'qxl3' },
    { label: 'SPICE four monitors', value: 'qxl4' },
    ...[0, 1, 2, 3].map((index) => ({
      label: `${gettext('Serial terminal')} ${index}`,
      value: `serial${index}`,
    })),
    { label: 'VirtIO-GPU', value: 'virtio' },
    { label: 'VirGL GPU', value: 'virtio-gl' },
    { label: gettext('None'), value: 'none' },
  ];
  const biosOptions = computed<WizardOption[]>(() =>
    effectiveArch.value === 'aarch64'
      ? [{ label: 'OVMF (UEFI)', value: 'ovmf' }]
      : [
          { label: gettext('Default'), value: '__default__' },
          { label: 'SeaBIOS', value: 'seabios' },
          { label: 'OVMF (UEFI)', value: 'ovmf' },
        ],
  );
  const machineOptions = computed(() =>
    effectiveArch.value === 'aarch64'
      ? [{ label: `${gettext('Default')} (virt)`, value: '__default__' }]
      : [
          { label: `${gettext('Default')} (i440fx)`, value: '__default__' },
          { label: 'q35', value: 'q35' },
        ],
  );
  const scsiControllerOptions = computed(() =>
    effectiveArch.value === 'aarch64'
      ? [
          { label: 'VirtIO SCSI', value: 'virtio-scsi-pci' },
          { label: 'VirtIO SCSI single', value: 'virtio-scsi-single' },
        ]
      : [
          { label: `${gettext('Default')} (LSI 53C895A)`, value: '__default__' },
          { label: 'LSI 53C895A', value: 'lsi' },
          { label: 'LSI 53C810', value: 'lsi53c810' },
          { label: 'MegaRAID SAS 8708EM2', value: 'megasas' },
          { label: 'VirtIO SCSI', value: 'virtio-scsi-pci' },
          { label: 'VirtIO SCSI single', value: 'virtio-scsi-single' },
          { label: 'VMware PVSCSI', value: 'pvscsi' },
        ],
  );
  const scsiControllerLabel = computed(
    () =>
      scsiControllerOptions.value.find((option) => option.value === form.scsihw)?.label ||
      form.scsihw,
  );
  const tpmFormatOptions = computed(() => {
    const { supported } = storageFormatInfo(form.tpmStorage, imageStorageRows.value);
    const values = supported.length ? supported : ['raw', 'qcow2'];
    return ['raw', 'qcow2', 'vmdk']
      .filter((format) => values.includes(format))
      .map((value) => ({
        label:
          value === 'raw'
            ? `${gettext('Raw disk image')} (raw)`
            : value === 'qcow2'
              ? `${gettext('QEMU image format')} (qcow2)`
              : `${gettext('VMware image format')} (vmdk)`,
        value,
      }));
  });
  const efiFormatOptions = computed(() => {
    const { supported } = storageFormatInfo(form.efiStorage, imageStorageRows.value);
    const values = supported.length ? supported : ['raw', 'qcow2'];
    return ['raw', 'qcow2', 'vmdk']
      .filter((format) => values.includes(format))
      .map((value) => ({
        label:
          value === 'raw'
            ? `${gettext('Raw disk image')} (raw)`
            : value === 'qcow2'
              ? `${gettext('QEMU image format')} (qcow2)`
              : `${gettext('VMware image format')} (vmdk)`,
        value,
      }));
  });
  function tpmFormatDisabled(storageName: string) {
    if (!storageName) return true;
    return (
      storageFormatInfo(storageName, imageStorageRows.value).supported.filter((format) =>
        ['raw', 'qcow2', 'vmdk'].includes(format),
      ).length <= 1
    );
  }
  function efiFormatDisabled(storageName: string) {
    if (!storageName) return true;
    return (
      storageFormatInfo(storageName, imageStorageRows.value).supported.filter((format) =>
        ['raw', 'qcow2', 'vmdk'].includes(format),
      ).length <= 1
    );
  }
  const primaryDiskKey = computed(() => `${form.diskBus}${form.diskSlot}`);
  const diskCount = computed(() => 1 + extraDisks.length);
  function reservedDeviceKeys() {
    const keys = new Set<string>([cdromDevice.value]);
    if (form.enableVirtioDrivers && form.virtioDriversCdrom.trim()) keys.add('ide0');
    return keys;
  }
  function usedDeviceKeys(excludedDisk: number | 'primary' | null = null) {
    const keys = reservedDeviceKeys();
    if (excludedDisk !== 'primary') keys.add(primaryDiskKey.value);
    extraDisks.forEach((disk) => {
      if (disk.id !== excludedDisk) keys.add(`${disk.bus}${disk.slot}`);
    });
    return keys;
  }
  const diskAddDisabled = computed(() => !nextFreeDiskAllocation() || diskCount.value + 1 >= 312);
  function hasValidDiskSize(value: unknown) {
    const raw = String(value ?? '').trim();
    if (!raw) return false;
    const size = Number(raw);
    return Number.isFinite(size) && size > 0 && size <= 131072;
  }
  function hasValidDiskSlot(value: unknown, bus: DiskBus) {
    const raw = String(value ?? '').trim();
    if (!raw) return false;
    const slot = Number(raw);
    return Number.isInteger(slot) && slot >= 0 && slot < diskBusSlotLimits[bus];
  }
  const diskValidation = computed(() => {
    const primaryValid = Boolean(
      form.storage.trim() &&
      form.format &&
      hasValidDiskSize(form.diskSize) &&
      hasValidDiskSlot(form.diskSlot, form.diskBus),
    );
    const used = reservedDeviceKeys();
    used.add(primaryDiskKey.value);
    const extras: Record<number, boolean> = {};
    extraDisks.forEach((disk) => {
      const key = `${disk.bus}${disk.slot}`;
      const valid = Boolean(
        disk.storage.trim() &&
        disk.format &&
        (disk.isImport
          ? disk.importSourceStorage && disk.importFrom
          : hasValidDiskSize(disk.size)) &&
        hasValidDiskSlot(disk.slot, disk.bus) &&
        !used.has(key),
      );
      extras[disk.id] = valid;
      used.add(key);
    });
    return { primary: primaryValid, extras };
  });
  const totalCores = computed(() => form.sockets * form.cores);
  const cgroupMode = computed(() => {
    const node = nodes.value.find((item) => item.node === form.node) as
      | (PveNode & Record<string, unknown>)
      | undefined;
    return Number(node?.['cgroup-mode'] ?? 2);
  });
  const cpuunitsMin = computed(() => (cgroupMode.value === 1 ? 2 : 1));
  const cpuunitsMax = computed(() => (cgroupMode.value === 1 ? 262144 : 10000));
  const cpuunitsDefault = computed(() => (cgroupMode.value === 1 ? 1024 : 100));
  const canEditCpuAffinity = computed(() => session.userid === 'root@pam');
  const cpuModelRows = computed<PveRecord[]>(() =>
    cpuModels.value.map((cpu) => ({
      name: textValue(cpu.name),
      displayname: textValue(cpu.displayname) || textValue(cpu.name).replace(/^custom-/, ''),
      vendor: cpu.name === 'host' ? 'Host' : textValue(cpu.vendor),
    })),
  );
  const bridgeRows = computed(() => bridges.value);
  const cpuModelDisplayValue = computed(
    () =>
      textValue(cpuModelRows.value.find((row) => textValue(row.name) === form.cpu)?.displayname) ||
      `${gettext('Default')} (${effectiveArch.value === 'x86_64' ? 'x86-64-v2-AES' : 'host'})`,
  );
  const cpuValue = computed(() => {
    const cpu = form.cpu.trim() || (effectiveArch.value === 'x86_64' ? 'x86-64-v2-AES' : '');
    const parts = cpu ? [cpu] : [];
    if (form.cpuFlags.trim()) parts.push(`flags=${form.cpuFlags.trim()}`);
    return parts.filter(Boolean).join(',');
  });
  function cpuFlagState(name: string) {
    const value = form.cpuFlags.split(';').find((entry) => entry.slice(1) === name);
    return value?.startsWith('+') ? '+' : value?.startsWith('-') ? '-' : '=';
  }
  function setCpuFlagState(name: string, state: string | number | null) {
    const entries = form.cpuFlags.split(';').filter((entry) => entry && entry.slice(1) !== name);
    if (state === '+' || state === '-') entries.push(`${state}${name}`);
    form.cpuFlags = entries.join(';');
  }
  const memoryPayload = computed(() => {
    if (!form.ballooning) return { balloon: 0 };
    if (form.balloon === form.memory) return {};
    return {
      balloon: Math.min(form.memory, Math.max(1, form.balloon)),
      ...(form.shares.trim() ? { shares: form.shares.trim() } : {}),
    };
  });
  const extraDisksValid = computed(() => {
    const keys = new Set([primaryDiskKey.value]);
    return extraDisks.every((disk) => {
      const key = `${disk.bus}${disk.slot}`;
      if (
        !disk.storage.trim() ||
        !disk.format ||
        (!disk.isImport && !hasValidDiskSize(disk.size)) ||
        (disk.isImport && (!disk.importSourceStorage || !disk.importFrom)) ||
        !hasValidDiskSlot(disk.slot, disk.bus) ||
        keys.has(key)
      )
        return false;
      keys.add(key);
      return true;
    });
  });
  const vmidIsInRange = computed(() => {
    const vmid = Number(form.vmid);
    return Number.isInteger(vmid) && vmid >= 100 && vmid <= 999999999;
  });
  function diskValue(
    storage: string,
    size: number,
    settings: DiskSettings & Partial<Pick<ExtraDisk, 'isImport' | 'importFrom'>>,
    bus: DiskBus = 'scsi',
  ) {
    const parts = [`${storage.trim()}:${settings.isImport ? 0 : size}`];
    if (settings.isImport && settings.importFrom) parts.push(`import-from=${settings.importFrom}`);
    if (settings.format) parts.push(`format=${settings.format}`);
    if (settings.cache !== '__default__') parts.push(`cache=${settings.cache}`);
    if (settings.discard) parts.push('discard=on');
    if (settings.iothread && (bus === 'scsi' || bus === 'virtio')) parts.push('iothread=on');
    if (settings.ssd && bus !== 'virtio') parts.push('ssd=on');
    if (settings.readOnly && (bus === 'scsi' || bus === 'virtio')) parts.push('ro=on');
    if (!settings.backup) parts.push('backup=0');
    if (settings.skipReplication) parts.push('replicate=no');
    if (settings.aio !== '__default__') parts.push(`aio=${settings.aio}`);
    const limits: Array<[string, string]> = [
      ['mbps_rd', settings.mbpsRead],
      ['mbps_wr', settings.mbpsWrite],
      ['iops_rd', settings.iopsRead],
      ['iops_wr', settings.iopsWrite],
      ['mbps_rd_max', settings.mbpsReadMax],
      ['mbps_wr_max', settings.mbpsWriteMax],
      ['iops_rd_max', settings.iopsReadMax],
      ['iops_wr_max', settings.iopsWriteMax],
    ];
    limits.forEach(([key, value]) => {
      if (value.trim()) parts.push(`${key}=${value.trim()}`);
    });
    return parts.join(',');
  }
  const extraDiskPayload = computed(() =>
    Object.fromEntries(
      extraDisks.map((disk) => [
        `${disk.bus}${disk.slot}`,
        diskValue(disk.storage, disk.size, disk, disk.bus),
      ]),
    ),
  );
  const canCreate = computed(() =>
    Boolean(
      form.node &&
      vmidIsInRange.value &&
      !vmidError.value &&
      form.storage &&
      form.format &&
      hasValidDiskSlot(form.diskSlot, form.diskBus) &&
      hasValidDiskSize(form.diskSize) &&
      extraDisksValid.value &&
      form.memory >= 1 &&
      form.cores >= 1 &&
      form.cores <= 256 &&
      form.sockets >= 1 &&
      form.sockets <= 256 &&
      (!form.vcpus.trim() || (Number(form.vcpus) >= 1 && Number(form.vcpus) <= totalCores.value)) &&
      (!form.cpulimit.trim() || (Number(form.cpulimit) >= 0 && Number(form.cpulimit) <= 128)) &&
      (!form.cpuunits.trim() ||
        (Number(form.cpuunits) >= cpuunitsMin.value && Number(form.cpuunits) <= cpuunitsMax.value)) &&
      (!form.noNetwork && form.vlanTag.trim()
        ? Number(form.vlanTag) >= 1 && Number(form.vlanTag) <= 4094
        : true) &&
      (!form.noNetwork && form.rate.trim()
        ? Number(form.rate) >= 0 && Number(form.rate) <= 10240
        : true) &&
      (!form.noNetwork && form.queues.trim()
        ? Number(form.queues) >= 1 && Number(form.queues) <= 64
        : true) &&
      (!form.noNetwork && form.model === 'virtio' && form.mtu.trim()
        ? Number(form.mtu) === 1 || (Number(form.mtu) >= 576 && Number(form.mtu) <= 65520)
        : true) &&
      (form.noNetwork || form.bridge.trim()),
    ),
  );
  const startup = computed(() => {
    const values = [
      form.startupOrder.trim() ? `order=${form.startupOrder.trim()}` : '',
      form.startupUp.trim() ? `up=${form.startupUp.trim()}` : '',
      form.startupDown.trim() ? `down=${form.startupDown.trim()}` : '',
    ].filter(Boolean);
    return values.join(',');
  });
  const bootOrder = computed(() => {
    // PVE only overrides the backend boot order when the Windows VirtIO CD adds
    // a second CD-ROM drive; otherwise the backend selects the normal default.
    if (!form.enableVirtioDrivers || !form.virtioDriversCdrom.trim()) return '';
    const diskDevices = new Set([
      primaryDiskKey.value,
      ...extraDisks.map((disk) => `${disk.bus}${disk.slot}`),
    ]);
    let firstDisk = '';
    for (const bus of ['ide', 'scsi', 'virtio', 'sata'] as DiskBus[]) {
      for (let slot = 0; slot < diskBusSlotLimits[bus]; slot += 1) {
        const device = `${bus}${slot}`;
        if (diskDevices.has(device)) {
          firstDisk = device;
          break;
        }
      }
      if (firstDisk) break;
    }
    const devices = [
      firstDisk,
      'ide2',
      'ide0',
      !form.noNetwork && form.bridge.trim() ? 'net0' : '',
    ].filter(Boolean);
    return `order=${devices.join(';')}`;
  });
  const serialVgaPayload = computed<Record<string, string>>(() => {
    const match = form.vga.match(/^serial([0-3])$/);
    return match ? { [`serial${match[1]}`]: 'socket' } : {};
  });
  const networkValue = computed(() => {
    if (form.noNetwork) return '';
    const values = [form.model, `bridge=${form.bridge.trim()}`];
    if (form.vlanTag.trim()) values.push(`tag=${form.vlanTag.trim()}`);
    values.push(`firewall=${form.firewall ? 1 : 0}`);
    if (form.macaddr.trim()) values.push(`macaddr=${form.macaddr.trim()}`);
    if (form.disconnect) values.push('link_down=1');
    if (form.rate.trim()) values.push(`rate=${form.rate.trim()}`);
    if (form.queues.trim()) values.push(`queues=${form.queues.trim()}`);
    if (form.model === 'virtio' && form.mtu.trim()) values.push(`mtu=${form.mtu.trim()}`);
    return values.join(',');
  });
  const createPayload = computed<Record<string, string | number>>(() => ({
    vmid: form.vmid,
    ...(form.name.trim() ? { name: form.name.trim() } : {}),
    ...(form.pool ? { pool: form.pool } : {}),
    ...(form.haManaged ? { 'ha-managed': 1 } : {}),
    ...(form.onboot ? { onboot: 1 } : {}),
    ...(startup.value ? { startup: startup.value } : {}),
    ...(form.tags.trim() ? { tags: form.tags.trim() } : {}),
    ...(form.arch !== '__default__' ? { arch: form.arch } : {}),
    ...(crossArchitecture.value ? { kvm: 0 } : {}),
    ostype: form.ostype,
    [cdromDevice.value]: cdromValue.value,
    ...(form.enableVirtioDrivers && form.virtioDriversCdrom.trim()
      ? { ide0: `${form.virtioDriversCdrom.trim()},media=cdrom` }
      : {}),
    ...(form.agent ? { agent: 'enabled=1' } : {}),
    ...(form.vga !== '__default__' ? { vga: form.vga } : {}),
    ...serialVgaPayload.value,
    ...(form.bios !== '__default__' ? { bios: form.bios } : {}),
    machine: form.machine,
    scsihw: form.scsihw,
    ...(form.bios === 'ovmf' && form.addEfiDisk && form.efiStorage
      ? { efidisk0: `${form.efiStorage}:1,efitype=4m,format=${form.efiFormat},pre-enrolled-keys=${form.preEnrolledKeys ? 1 : 0}` }
      : {}),
    ...(form.addTpm && form.tpmStorage
      ? { tpmstate0: `${form.tpmStorage}:1,format=${form.tpmFormat},version=${form.tpmVersion}` }
      : {}),
    [primaryDiskKey.value]: diskValue(form.storage, form.diskSize, form, form.diskBus),
    ...extraDiskPayload.value,
    ...(bootOrder.value ? { boot: bootOrder.value } : {}),
    sockets: form.sockets,
    cores: form.cores,
    ...(cpuValue.value ? { cpu: cpuValue.value } : {}),
    ...(form.vcpus.trim() ? { vcpus: form.vcpus.trim() } : {}),
    ...(form.cpulimit.trim() && Number(form.cpulimit) !== 0 ? { cpulimit: form.cpulimit.trim() } : {}),
    ...(form.cpuunits.trim() && Number(form.cpuunits) !== cpuunitsDefault.value ? { cpuunits: form.cpuunits.trim() } : {}),
    ...(form.affinity.trim() ? { affinity: form.affinity.trim() } : {}),
    ...(form.numa ? { numa: 1 } : {}),
    memory: form.memory,
    ...memoryPayload.value,
    ...(form.allowKsm ? {} : { 'allow-ksm': 0 }),
    ...(networkValue.value ? { net0: networkValue.value } : {}),
    ...(form.startAfterCreated ? { start: 1 } : {}),
  }));
  const summaryRows = computed(() =>
    Object.entries({ node: form.node, ...createPayload.value })
      .filter(([key, value]) => key && value !== '')
      .map(([key, value]) => [key, String(value)] as [string, string])
      .sort(([left], [right]) => left.localeCompare(right)),
  );

  async function loadStorage() {
    if (!form.node) {
      storageNames.value = [];
      imageStorageRows.value = [];
      form.storage = '';
      return;
    }
    const response = await getNodeStorage(form.node, 'images');
    imageStorageRows.value = [...(response.data || [])].sort((left, right) =>
      textValue(left.storage).localeCompare(textValue(right.storage)),
    );
    storageNames.value = imageStorageRows.value
      .map((item) => textValue(item.storage))
      .filter(Boolean)
      .sort((left, right) => left.localeCompare(right));
    if (!diskStorageNames.value.includes(form.storage)) {
      form.storage = diskStorageNames.value[0] || '';
      resetDiskFormat(form, form.storage);
    }
  }

  async function loadImportStorage() {
    if (!form.node) {
      importStorageRows.value = [];
      return;
    }
    const response = await getNodeStorage(form.node, 'import');
    importStorageRows.value = [...(response.data || [])].sort((left, right) =>
      textValue(left.storage).localeCompare(textValue(right.storage)),
    );
  }

  async function loadImportImages(storage: string) {
    if (!form.node || !storage) return;
    const response = await getStorageContent(form.node, storage, 'import');
    importImageRows[storage] = [...(response.data || [])]
      .filter((row) => ['raw', 'qcow2', 'vmdk'].includes(textValue(row.format)))
      .sort((left, right) => textValue(left.volid).localeCompare(textValue(right.volid)));
  }

  async function loadIsoStorage() {
    if (!form.node) {
      isoStorageNames.value = [];
      isoImages.value = [];
      isoStorageRows.value = [];
      isoImageRows.value = [];
      virtioIsoImageRows.value = [];
      form.isoStorage = '';
      form.cdrom = '';
      form.virtioIsoStorage = '';
      form.virtioDriversCdrom = '';
      return;
    }
    const response = await getNodeStorage(form.node, 'iso');
    isoStorageRows.value = [...(response.data || [])].sort((left, right) =>
      textValue(left.storage).localeCompare(textValue(right.storage)),
    );
    isoStorageNames.value = isoStorageRows.value
      .map((item) => textValue(item.storage))
      .filter(Boolean)
      .sort((left, right) => left.localeCompare(right));
    if (!isoStorageNames.value.includes(form.isoStorage))
      form.isoStorage = isoStorageNames.value[0] || '';
    if (!isoStorageNames.value.includes(form.virtioIsoStorage))
      form.virtioIsoStorage = isoStorageNames.value[0] || '';
  }

  async function loadIsoImages() {
    if (!form.node || !form.isoStorage) {
      isoImages.value = [];
      isoImageRows.value = [];
      form.cdrom = '';
      return;
    }
    const response = await getStorageContent(form.node, form.isoStorage, 'iso');
    isoImageRows.value = [...(response.data || [])].sort((left, right) =>
      textValue(left.volid).localeCompare(textValue(right.volid)),
    );
    isoImages.value = isoImageRows.value
      .map((item) => textValue(item.volid))
      .filter(Boolean)
      .sort((left, right) => left.localeCompare(right));
    if (!isoImages.value.includes(form.cdrom)) form.cdrom = '';
  }

  async function loadVirtioIsoImages() {
    if (!form.node || !form.virtioIsoStorage) {
      virtioIsoImageRows.value = [];
      form.virtioDriversCdrom = '';
      return;
    }
    const response = await getStorageContent(form.node, form.virtioIsoStorage, 'iso');
    virtioIsoImageRows.value = [...(response.data || [])].sort((left, right) =>
      textValue(left.volid).localeCompare(textValue(right.volid)),
    );
    if (!virtioIsoImageRows.value.some((row) => textValue(row.volid) === form.virtioDriversCdrom)) {
      form.virtioDriversCdrom = '';
    }
  }

  async function loadCpuCapabilities() {
    if (!form.node) return;
    const [models, flags] = await Promise.all([
      getVmCpuModels(form.node, effectiveArch.value),
      getVmCpuFlags(form.node, effectiveArch.value),
    ]);
    cpuModels.value = (models.data || []).sort((left, right) =>
      String(left.displayname || left.name || '').localeCompare(
        String(right.displayname || right.name || ''),
      ),
    );
    cpuFlags.value = (flags.data || [])
      .map((flag) => (typeof flag === 'string' ? { name: flag } : flag))
      .filter((flag) => Boolean(flag.name))
      .sort((left, right) => textValue(left.name).localeCompare(textValue(right.name)));
  }

  async function loadBridges() {
    if (!form.node) return;
    const response = await getNodeNetwork(form.node);
    bridges.value = (response.data || [])
      .filter((item) => textValue(item.type) === 'bridge')
      .filter((item) => Boolean(textValue(item.iface)))
      .sort((left, right) => textValue(left.iface).localeCompare(textValue(right.iface)));
    if (!bridges.value.some((bridge) => textValue(bridge.iface) === form.bridge)) {
      form.bridge = textValue(bridges.value[0]?.iface);
    }
  }

  function applyOsBaseDefaults() {
    const versions = osVersionOptions.value || [];
    const fallback = versions[0]?.value || 'l26';
    if (!versions.some((option) => option.value === form.ostype)) {
      form.ostype = fallback;
    }
  }

  function addTag() {
    const newTags = tagInput.value
      .split(/[;, ]/)
      .map((tag) => tag.trim())
      .filter(Boolean);
    const invalidTag = newTags.find((tag) => !/^[\p{L}\p{N}\p{Pd}_.:]+$/u.test(tag));
    if (invalidTag) {
      tagError.value = gettext('Tags contain invalid characters.');
      return;
    }

    form.tags = [...new Set([...tags.value, ...newTags])].join(';');
    tagInput.value = '';
    tagError.value = '';
  }

  function removeTag(tag: string) {
    form.tags = tags.value.filter((item) => item !== tag).join(';');
  }

  function clearValidationErrors() {
    Object.keys(validationErrors).forEach((field) => delete validationErrors[field]);
  }

  function addValidationError(field: string, message: string) {
    if (!validationErrors[field]) validationErrors[field] = message;
  }

  function isoImageName(value: unknown) {
    return textValue(value).replace(/^.*:(.*\/)?/, '');
  }

  function formatIsoSize(value: unknown) {
    const size = Number(value);
    if (!Number.isFinite(size) || size < 0) return '-';
    const units = ['B', 'KiB', 'MiB', 'GiB', 'TiB'];
    let unitIndex = 0;
    let displaySize = size;
    while (displaySize >= 1024 && unitIndex < units.length - 1) {
      displaySize /= 1024;
      unitIndex += 1;
    }
    return `${
      displaySize >= 10 || unitIndex === 0 ? displaySize.toFixed(0) : displaySize.toFixed(1)
    } ${units[unitIndex]}`;
  }

  function requireValue(field: string, label: string, value: unknown) {
    if (String(value ?? '').trim()) return;
    addValidationError(field, `${label}: ${gettext('This field is required')}`);
  }

  function validateNumber(
    field: string,
    label: string,
    value: unknown,
    min: number,
    max: number | undefined,
    optional = false,
    integer = true,
  ) {
    const raw = String(value ?? '').trim();
    if (!raw) {
      if (!optional) requireValue(field, label, value);
      return;
    }
    const numericValue = Number(raw);
    if (
      !Number.isFinite(numericValue) ||
      (integer && !Number.isInteger(numericValue)) ||
      numericValue < min ||
      (max !== undefined && numericValue > max)
    ) {
      addValidationError(
        field,
        max === undefined
          ? `${label}: ${gettext('Value must be at least')} ${min}`
          : `${label}: ${gettext('Value must be between')} ${min} and ${max}`,
      );
    }
  }

  async function validateStep(stepName: string) {
    clearValidationErrors();

    if (stepName === 'general') {
      requireValue('node', gettext('Node'), form.node);
      const selectedNode = nodes.value.find((node) => node.node === form.node);
      if (!selectedNode || selectedNode.status !== 'online') {
        addValidationError('node', `${gettext('Node')}: ${gettext('Node is offline')}`);
      }
      if (!vmidIsInRange.value) {
        vmidError.value = gettext('VM ID must be between 100 and 999999999');
        addValidationError('vmid', vmidError.value);
      } else if (!(await validateVmid())) {
        addValidationError('vmid', vmidError.value);
      }
      if (form.name.trim() && !/^[A-Za-z0-9](?:[A-Za-z0-9.-]{0,61}[A-Za-z0-9])?$/.test(form.name)) {
        addValidationError('name', `${gettext('Name')}: ${gettext('Invalid DNS name')}`);
      }
      if (tags.value.some((tag) => !/^[\p{L}\p{N}\p{Pd}_.:]+$/u.test(tag))) {
        addValidationError('tags', gettext('Tags contain invalid characters.'));
      }
    }

    if (stepName === 'os') {
      if (form.mediaType === 'iso') {
        requireValue('isoStorage', gettext('Storage'), form.isoStorage);
        requireValue('cdrom', gettext('ISO image'), form.cdrom);
      }
      if (form.enableVirtioDrivers) {
        requireValue('virtioDriversCdrom', gettext('VirtIO Drivers ISO'), form.virtioDriversCdrom);
      }
    }

    if (stepName === 'system') {
      if (form.bios === 'ovmf' && form.addEfiDisk) {
        requireValue('efiStorage', gettext('EFI Storage'), form.efiStorage);
      }
      if (form.addTpm) {
        requireValue('tpmStorage', gettext('TPM Storage'), form.tpmStorage);
        requireValue('tpmFormat', gettext('Format'), form.tpmFormat);
      }
    }

    if (stepName === 'disks') {
      requireValue('storage', gettext('Storage'), form.storage);
      requireValue('diskFormat', gettext('Format'), form.format);
      validateNumber('diskSize', gettext('Disk size'), form.diskSize, 0.001, 131072, false, false);
      validateNumber(
        'diskSlot',
        gettext('Device ID'),
        form.diskSlot,
        0,
        diskBusSlotLimits[form.diskBus] - 1,
      );
      const usedDiskKeys = reservedDeviceKeys();
      if (usedDiskKeys.has(primaryDiskKey.value)) {
        addValidationError('diskSlot', `${gettext('Device ID')}: ${gettext('This value is already in use')}`);
      }
      usedDiskKeys.add(primaryDiskKey.value);
      extraDisks.forEach((disk) => {
        const prefix = `disk-${disk.id}`;
        requireValue(`${prefix}-storage`, gettext('Storage'), disk.storage);
        requireValue(`${prefix}-format`, gettext('Format'), disk.format);
        if (disk.isImport) {
          requireValue(
            `${prefix}-import-storage`,
            gettext('Import Storage'),
            disk.importSourceStorage,
          );
          requireValue(`${prefix}-import-from`, gettext('Select Image'), disk.importFrom);
        } else {
          validateNumber(
            `${prefix}-size`,
            gettext('Disk size'),
            disk.size,
            0.001,
            131072,
            false,
            false,
          );
        }
        validateNumber(
          `${prefix}-slot`,
          gettext('Device ID'),
          disk.slot,
          0,
          diskBusSlotLimits[disk.bus] - 1,
        );
        const key = `${disk.bus}${disk.slot}`;
        if (usedDiskKeys.has(key)) {
          addValidationError(
            `${prefix}-slot`,
            `${gettext('Device ID')}: ${gettext('This value is already in use')}`,
          );
        }
        usedDiskKeys.add(key);
        const bandwidthFields: Array<[keyof DiskSettings, string, number, boolean]> = [
          ['mbpsRead', gettext('Read limit MB/s'), 1, false],
          ['mbpsWrite', gettext('Write limit MB/s'), 1, false],
          ['iopsRead', gettext('Read IOPS'), 10, true],
          ['iopsWrite', gettext('Write IOPS'), 10, true],
          ['mbpsReadMax', gettext('Read max burst MB/s'), 1, false],
          ['mbpsWriteMax', gettext('Write max burst MB/s'), 1, false],
          ['iopsReadMax', gettext('Read max burst IOPS'), 10, true],
          ['iopsWriteMax', gettext('Write max burst IOPS'), 10, true],
        ];
        bandwidthFields.forEach(([field, label, min, integer]) =>
          validateNumber(`${prefix}-${field}`, label, disk[field], min, Number.MAX_SAFE_INTEGER, true, integer),
        );
      });
      const primaryBandwidthFields: Array<[keyof DiskSettings, string, number, boolean]> = [
        ['mbpsRead', gettext('Read limit MB/s'), 1, false],
        ['mbpsWrite', gettext('Write limit MB/s'), 1, false],
        ['iopsRead', gettext('Read IOPS'), 10, true],
        ['iopsWrite', gettext('Write IOPS'), 10, true],
        ['mbpsReadMax', gettext('Read max burst MB/s'), 1, false],
        ['mbpsWriteMax', gettext('Write max burst MB/s'), 1, false],
        ['iopsReadMax', gettext('Read max burst IOPS'), 10, true],
        ['iopsWriteMax', gettext('Write max burst IOPS'), 10, true],
      ];
      primaryBandwidthFields.forEach(([field, label, min, integer]) =>
        validateNumber(field, label, form[field], min, Number.MAX_SAFE_INTEGER, true, integer),
      );
    }

    if (stepName === 'cpu') {
      validateNumber('sockets', gettext('Sockets'), form.sockets, 1, undefined);
      validateNumber('cores', gettext('Cores'), form.cores, 1, 256);
      validateNumber('vcpus', gettext('VCPUs'), form.vcpus, 1, totalCores.value, true);
      validateNumber('cpulimit', gettext('CPU limit'), form.cpulimit, 0, 128, true, false);
      validateNumber(
        'cpuunits',
        gettext('CPU units'),
        form.cpuunits,
        cpuunitsMin.value,
        cpuunitsMax.value,
        true,
      );
      if (
        effectiveArch.value === 'aarch64' &&
        !crossArchitecture.value &&
        form.cpu &&
        !form.cpu.startsWith('custom-') &&
        !['host', 'max', 'cortex-a53', 'cortex-a57'].includes(form.cpu)
      ) {
        addValidationError('cpu', gettext('CPU model is not usable with KVM on ARM'));
      }
    }

    if (stepName === 'memory') {
      validateNumber('memory', gettext('Memory'), form.memory, 1, 1048576);
      if (form.ballooning) {
        validateNumber('balloon', gettext('Minimum memory'), form.balloon, 1, Number(form.memory));
        validateNumber('shares', gettext('Shares'), form.shares, 0, 50000, true);
      }
    }

    if (stepName === 'network' && !form.noNetwork) {
      requireValue('bridge', gettext('Bridge'), form.bridge);
      validateNumber('vlanTag', gettext('VLAN Tag'), form.vlanTag, 1, 4094, true);
      if (form.macaddr.trim() && !/^([0-9A-Fa-f]{2}:){5}[0-9A-Fa-f]{2}$/.test(form.macaddr)) {
        addValidationError(
          'macaddr',
          `${gettext('MAC address')}: ${gettext('Invalid MAC address')}`,
        );
      }
      if (form.model === 'virtio') {
        const mtu = Number(form.mtu);
        if (
          form.mtu.trim() &&
          (!Number.isInteger(mtu) || (mtu !== 1 && (mtu < 576 || mtu > 65520)))
        ) {
          addValidationError('mtu', `MTU: ${gettext('Value must be 1 or between 576 and 65520')}`);
        }
      }
      validateNumber('rate', gettext('Rate limit'), form.rate, 0, 10240, true, false);
      validateNumber('queues', gettext('Multiqueue'), form.queues, 1, 64, true);
    }

    return validationErrorEntries.value.length === 0;
  }

  function stepContentHeight(stepName: string) {
    const hasValidation = step.value === stepName && validationErrorEntries.value.length > 0;
    return `${hasValidation ? 394 : 466}px`;
  }

  async function validateAllSteps() {
    for (const item of steps.value) {
      if (item.name === 'confirm') continue;
      if (!(await validateStep(item.name))) {
        step.value = item.name;
        return false;
      }
    }
    return true;
  }

  async function validateVmid() {
    vmidError.value = '';
    if (!form.vmid || !vmidIsInRange.value) {
      vmidError.value = gettext('VM ID must be between 100 and 999999999');
      return false;
    }

    try {
      await getNextVmId(form.vmid);
      return true;
    } catch {
      vmidError.value = gettext('This VM ID is already in use');
      return false;
    }
  }

  async function initialize() {
    if (!model.value) return;
    loading.value = true;
    try {
      advanced.value = false;
      vmidError.value = '';
      tagInput.value = '';
      tagError.value = '';
      clearValidationErrors();
      form.node = '';
      const [nodeResponse, poolResponse, nextIdResponse] = await Promise.all([
        getNodes(),
        getPools(),
        getNextVmId(),
      ]);
      nodes.value = (nodeResponse.data || []).sort((left, right) =>
        left.node.localeCompare(right.node),
      );
      pools.value = (poolResponse.data || []).sort((left, right) =>
        left.poolid.localeCompare(right.poolid),
      );
      form.node = onlineNodes.value[0]?.node || '';
      form.vmid = String(nextIdResponse.data || '');
      form.name = '';
      form.pool = '';
      form.haManaged = false;
      form.onboot = false;
      form.startupOrder = '';
      form.startupUp = '';
      form.startupDown = '';
      form.tags = '';
      form.arch = '__default__';
      form.ostype = 'l26';
      form.osbase = 'Linux';
      form.mediaType = 'iso';
      form.isoStorage = '';
      form.cdrom = '';
      form.enableVirtioDrivers = false;
      form.virtioIsoStorage = '';
      form.virtioDriversCdrom = '';
      form.agent = false;
      form.vga = '__default__';
      form.bios = '__default__';
      form.machine = '__default__';
      form.scsihw = '__default__';
      form.addEfiDisk = false;
      form.efiStorage = '';
      form.efiFormat = 'raw';
      form.preEnrolledKeys = true;
      form.addTpm = false;
      form.tpmStorage = '';
      form.tpmFormat = 'raw';
      form.tpmVersion = 'v2.0';
      form.diskSize = 32;
      form.diskBus = 'scsi';
      form.diskSlot = 0;
      Object.assign(form, defaultDiskSettings());
      form.cores = 1;
      form.sockets = 1;
      form.cpu = '';
      form.cpuFlags = '';
      form.vcpus = '';
      form.cpulimit = '';
      form.cpuunits = '';
      form.affinity = '';
      form.numa = false;
      form.memory = 2048;
      form.ballooning = true;
      form.balloon = 2048;
      form.shares = '';
      form.allowKsm = true;
      form.startAfterCreated = false;
      form.noNetwork = false;
      form.bridge = 'vmbr0';
      form.model = 'virtio';
      form.vlanTag = '';
      form.firewall = true;
      form.macaddr = '';
      form.disconnect = false;
      form.rate = '';
      form.queues = '';
      form.mtu = '';
      extraDisks.splice(0, extraDisks.length);
      nextExtraDiskId.value = 1;
      activeDiskId.value = 'primary';
      activeDiskTab.value = 'disk';
      applyOsDefaults();
      step.value = 'general';
    } finally {
      loading.value = false;
    }
  }

  function getOsDefaults(ostype: string, arch: string) {
    type OsDefaults = {
      diskBus: DiskBus;
      model: string;
      scsihw: string;
      bios: string;
      machine: string;
      busPriority: Record<DiskBus, number>;
    };
    const generic: Record<'x86_64' | 'aarch64', OsDefaults> = {
      x86_64: {
        diskBus: 'ide',
        model: 'e1000',
        scsihw: 'virtio-scsi-single',
        bios: '__default__',
        machine: '__default__',
        busPriority: { ide: 4, sata: 3, scsi: 2, virtio: 1 },
      },
      aarch64: {
        diskBus: 'scsi',
        model: 'e1000',
        scsihw: 'virtio-scsi-single',
        bios: 'ovmf',
        machine: '__default__',
        busPriority: { scsi: 4, sata: 3, virtio: 2, ide: 1 },
      },
    };
    const parent = generic[arch === 'aarch64' ? 'aarch64' : 'x86_64'];
    const overrides: Record<string, Partial<OsDefaults>> = {
      l26: {
        diskBus: 'scsi',
        model: 'virtio',
        busPriority: { scsi: 4, virtio: 3, sata: 2, ide: 1 },
      },
      w2k: { diskBus: 'ide', model: 'rtl8139', scsihw: '__default__' },
      wxp: { diskBus: 'ide', model: 'rtl8139', scsihw: '__default__' },
      win11: {
        diskBus: 'ide',
        model: 'e1000',
        scsihw: 'virtio-scsi-single',
        bios: 'ovmf',
        machine: 'q35',
      },
    };
    return { ...parent, ...(overrides[ostype] || {}) };
  }

  function applyOsDefaults() {
    const isArm = effectiveArch.value === 'aarch64';
    if (isArm) {
      form.osbase = form.osbase === 'Other' ? 'Other' : 'Linux';
      if (form.ostype.startsWith('win')) form.ostype = 'l26';
    }
    const defaults = getOsDefaults(form.ostype, effectiveArch.value);
    const isWindows11 = form.ostype === 'win11';
    form.diskBus = form.enableVirtioDrivers ? 'scsi' : defaults.diskBus;
    form.model = form.enableVirtioDrivers ? 'virtio' : defaults.model;
    form.scsihw = defaults.scsihw;
    form.bios = defaults.bios || '__default__';
    form.machine = defaults.machine || '__default__';
    if (isWindows11) form.addTpm = true;
    const memoryDefault = isWindows11 ? 4096 : 2048;
    if (form.memory === 2048 || form.memory === 4096) {
      form.memory = memoryDefault;
      form.balloon = memoryDefault;
    }
    if (form.cpu === 'neoverse-n2') form.cpu = '';
  }

  function applyVirtioDriverDefaults(enabled: boolean) {
    const defaults = getOsDefaults(form.ostype, effectiveArch.value);
    form.diskBus = enabled ? 'scsi' : defaults.diskBus;
    form.model = enabled ? 'virtio' : defaults.model;
  }

  async function submit() {
    if (!(await validateAllSteps()) || !canCreate.value) return;
    loading.value = true;
    try {
      const response = await createVm(form.node, createPayload.value);
      model.value = false;
      emit('completed');
      if (response.data)
        emit('task', {
          node: form.node,
          upid: response.data,
          title: `${form.name}: ${gettext('Create')}`,
        });
    } finally {
      loading.value = false;
    }
  }

  function addExtraDisk() {
    const nextDisk = nextFreeDiskAllocation();
    if (!nextDisk) return;
    extraDisks.push({
      id: nextExtraDiskId.value,
      bus: nextDisk.bus,
      slot: nextDisk.slot,
      storage: form.storage,
      size: 32,
      isImport: false,
      importSourceStorage: '',
      importFrom: '',
      ...defaultDiskSettings(),
      iothread: defaultIothread(nextDisk.bus),
    });
    activeDiskId.value = nextExtraDiskId.value;
    nextExtraDiskId.value += 1;
  }

  async function addImportDisk() {
    addExtraDisk();
    const disk = extraDisks[extraDisks.length - 1];
    if (!disk) return;
    disk.isImport = true;
    disk.size = 0;
    await loadImportStorage();
    disk.importSourceStorage = textValue(importStorageRows.value[0]?.storage);
    if (disk.importSourceStorage) await loadImportImages(disk.importSourceStorage);
  }

  function removeExtraDisk(id: number) {
    const index = extraDisks.findIndex((disk) => disk.id === id);
    if (index >= 0) extraDisks.splice(index, 1);
    if (activeDiskId.value === id) activeDiskId.value = 'primary';
  }

  function nextFreeDiskSlot(bus: DiskBus, excludedDisk: number | 'primary' | null = null) {
    const used = usedDeviceKeys(excludedDisk);
    let slot = 0;
    while (slot < diskBusSlotLimits[bus] && used.has(`${bus}${slot}`)) slot += 1;
    return slot < diskBusSlotLimits[bus] ? slot : undefined;
  }

  function nextFreeDiskAllocation() {
    const buses: DiskBus[] =
      effectiveArch.value === 'aarch64'
        ? ['scsi', 'virtio', 'sata']
        : ['scsi', 'virtio', 'sata', 'ide'];
    const defaults = getOsDefaults(form.ostype, effectiveArch.value);
    const diskUsage = Object.fromEntries(buses.map((bus) => [bus, 0])) as Record<DiskBus, number>;
    [primaryDiskKey.value, ...extraDisks.map((disk) => `${disk.bus}${disk.slot}`)].forEach((key) => {
      const bus = buses.find((candidate) => key.startsWith(candidate));
      if (bus) diskUsage[bus] += 1;
    });
    const candidates = [...buses].sort((left, right) => {
      const priority = (bus: DiskBus) => defaults.busPriority[bus] ?? 0;
      return diskUsage[left] === diskUsage[right]
        ? priority(right) - priority(left)
        : diskUsage[right] - diskUsage[left];
    });
    for (const bus of candidates) {
      const slot = nextFreeDiskSlot(bus);
      if (slot !== undefined) return { bus, slot };
    }
    return undefined;
  }

  function removePrimaryDisk() {
    if (extraDisks.length === 0) return;
    const replacementIndex = extraDisks.findIndex((disk) => !disk.isImport);
    if (replacementIndex < 0) return;
    const [replacement] = extraDisks.splice(replacementIndex, 1);
    if (!replacement) return;
    form.storage = replacement.storage;
    form.diskBus = replacement.bus;
    form.diskSlot = replacement.slot;
    form.diskSize = replacement.size;
    form.format = replacement.format;
    form.cache = replacement.cache;
    form.discard = replacement.discard;
    form.iothread = replacement.iothread;
    form.ssd = replacement.ssd;
    form.readOnly = replacement.readOnly;
    form.backup = replacement.backup;
    form.skipReplication = replacement.skipReplication;
    form.aio = replacement.aio;
    form.mbpsRead = replacement.mbpsRead;
    form.mbpsWrite = replacement.mbpsWrite;
    form.iopsRead = replacement.iopsRead;
    form.iopsWrite = replacement.iopsWrite;
    form.mbpsReadMax = replacement.mbpsReadMax;
    form.mbpsWriteMax = replacement.mbpsWriteMax;
    form.iopsReadMax = replacement.iopsReadMax;
    form.iopsWriteMax = replacement.iopsWriteMax;
    activeDiskId.value = 'primary';
  }

  async function moveStep(offset: number) {
    const index = steps.value.findIndex((item) => item.name === step.value);
    if (offset > 0 && !(await validateStep(step.value))) return;
    step.value = steps.value[index + offset]?.name || step.value;
  }

  watch(
    () => form.memory,
    (memory, previousMemory) => {
      if (form.balloon === previousMemory) form.balloon = memory;
    },
  );
  watch(effectiveArch, () => {
    if (model.value && form.node) void loadCpuCapabilities();
  });
  watch(model, (visible) => {
    if (visible) void initialize();
  });
  watch(
    () => form.node,
    (node) => {
      if (model.value && node) {
        void loadStorage();
        void loadIsoStorage();
        void loadCpuCapabilities();
        void loadBridges();
      }
    },
  );
  watch(
    () => form.isoStorage,
    () => {
      if (model.value) void loadIsoImages();
    },
  );
  watch(
    () => form.virtioIsoStorage,
    () => {
      if (model.value) void loadVirtioIsoImages();
    },
  );
  watch(
    () => form.osbase,
    () => {
      if (form.osbase !== 'Microsoft Windows') form.enableVirtioDrivers = false;
      applyOsBaseDefaults();
    },
  );
  watch([() => form.ostype, effectiveArch], applyOsDefaults);
  watch(() => form.enableVirtioDrivers, applyVirtioDriverDefaults);
  watch(
    () => form.bios,
    (bios, previousBios) => {
      if (bios === 'ovmf' && previousBios !== 'ovmf') form.addEfiDisk = true;
    },
  );
  watch(
    () => form.efiStorage,
    () => {
      form.efiFormat =
        efiFormatOptions.value.find((option) => option.value === 'qcow2')?.value ||
        efiFormatOptions.value[0]?.value ||
        'raw';
    },
  );
  watch(
    efiFormatOptions,
    () => {
      if (!efiFormatOptions.value.some((option) => option.value === form.efiFormat)) {
        form.efiFormat = efiFormatOptions.value[0]?.value || 'raw';
      }
    },
    { immediate: true },
  );
  watch(
    () => form.tpmStorage,
    () => {
      form.tpmFormat =
        tpmFormatOptions.value.find((option) => option.value === 'qcow2')?.value ||
        tpmFormatOptions.value[0]?.value ||
        'raw';
    },
  );
  watch(
    tpmFormatOptions,
    () => {
      if (!tpmFormatOptions.value.some((option) => option.value === form.tpmFormat)) {
        form.tpmFormat = tpmFormatOptions.value[0]?.value || 'raw';
      }
    },
    { immediate: true },
  );
  watch(
    () => form.storage,
    (storage) => resetDiskFormat(form, storage),
  );
  watch(
    [() => form.diskBus, () => form.scsihw],
    ([bus, controller], [previousBus, previousController]) => {
      if (bus !== previousBus) {
        const slot = nextFreeDiskSlot(bus, 'primary');
        if (slot !== undefined) form.diskSlot = slot;
      }
      if (form.iothread === defaultIothread(previousBus, previousController)) {
        form.iothread = defaultIothread(bus, controller);
      }
      if (bus === 'virtio') form.ssd = false;
      if (bus !== 'virtio' && bus !== 'scsi') {
        form.readOnly = false;
        form.iothread = false;
      }
    },
  );
  watch(
    () => `${form.scsihw}|${extraDisks.map((disk) => `${disk.id}:${disk.bus}:${disk.storage}`).join(',')}`,
    (_current, previous = '') => {
      const [previousController, previousState = ''] = String(previous).split('|');
      const previousBusById = new Map(
        previousState.split(',').filter(Boolean).map((entry) => {
          const [id, bus] = entry.split(':');
          return [Number(id), bus];
        }),
      );
      extraDisks.forEach((disk) => {
        if (previousBusById.has(disk.id) && previousBusById.get(disk.id) !== disk.bus) {
          const slot = nextFreeDiskSlot(disk.bus, disk.id);
          if (slot !== undefined) disk.slot = slot;
          disk.iothread = defaultIothread(disk.bus);
        }
        if (previousController && previousController !== form.scsihw && disk.bus === 'scsi') {
          disk.iothread = defaultIothread(disk.bus);
        }
        const { supported, defaultFormat } = storageFormatInfo(disk.storage);
        if (supported.length ? !supported.includes(disk.format) : disk.format !== defaultFormat) {
          resetDiskFormat(disk, disk.storage);
        }
        if (disk.bus === 'virtio') disk.ssd = false;
        if (disk.bus !== 'virtio' && disk.bus !== 'scsi') {
          disk.readOnly = false;
          disk.iothread = false;
        }
      });
    },
  );
  watch(
    effectiveArch,
    (arch) => {
      if (arch === 'aarch64') {
        if (form.diskBus === 'ide') form.diskBus = 'scsi';
        extraDisks.forEach((disk) => {
          if (disk.bus === 'ide') disk.bus = 'scsi';
        });
      }
    },
  );
  return {
    state: { loading, step, advanced, activeDiskId, activeDiskTab, diskSplitter },
    form,
    resources: {
      nodes,
      pools,
      storageNames,
      isoStorageNames,
      isoImages,
      imageStorageRows,
      importStorageRows,
      importImageRows,
      isoStorageRows,
      isoImageRows,
      virtioIsoImageRows,
      cpuModels,
      cpuFlags,
      bridges,
    },
    errors: { vmidError, tagInput, tagError, validationErrors, validationErrorEntries },
    options: {
      steps,
      onlineNodes,
      osBaseOptions,
      osVersionOptions,
      diskBusOptions,
      diskBusSlotLimits,
      cacheOptions,
      aioOptions,
      vgaOptions,
      biosOptions,
      machineOptions,
      scsiControllerOptions,
      efiFormatOptions,
      tpmFormatOptions,
      cpuFlagStateOptions,
      isoStorageColumns,
      isoImageColumns,
      importImageColumns,
      cpuModelColumns,
      cpuFlagColumns,
      bridgeColumns,
    },
    disks: {
      extraDisks,
      primaryDiskKey,
      diskCount,
      diskAddDisabled,
      diskValidation,
      addExtraDisk,
      addImportDisk,
      removeExtraDisk,
      removePrimaryDisk,
      loadImportImages,
      diskFormatOptions,
      diskFormatDisabled,
      tpmFormatDisabled,
      efiFormatDisabled,
    },
    actions: {
      initialize,
      validateStep,
      validateAllSteps,
      validateVmid,
      moveStep,
      submit,
      addTag,
      removeTag,
      setCpuFlagState,
    },
    derived: {
      tags,
      cdromDevice,
      cdromValue,
      diskStorageRows,
      scsiControllerLabel,
      totalCores,
      cpuModelRows,
      bridgeRows,
      cpuunitsMin,
      cpuunitsMax,
      cpuunitsDefault,
      canEditCpuAffinity,
      cpuModelDisplayValue,
      cpuValue,
      memoryPayload,
      canCreate,
      summaryRows,
      networkValue,
      bootOrder,
      stepContentHeight,
      cpuFlagState,
      isoImageName,
    },
  };
}
