export type VmHardwareRecord = Record<string, unknown>;

function text(value: unknown) {
  return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean'
    ? String(value)
    : '';
}

/** Uses the VM's effective architecture everywhere hardware editors need it. */
export function getGuestArchitecture(config: VmHardwareRecord) {
  return text(config.arch) || 'x86_64';
}

export function isKvmEnabled(config: VmHardwareRecord) {
  return Number(config.kvm ?? 1) === 1;
}

export function parseVmHardwarePropertyString(value: unknown, defaultKey: string) {
  const result: Record<string, string> = {};
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    Object.entries(value as VmHardwareRecord).forEach(([key, item]) => {
      result[key] = text(item);
    });
    return result;
  }
  text(value)
    .split(',')
    .filter(Boolean)
    .forEach((part) => {
      const [key, ...rest] = part.split('=');
      if (!key) return;
      result[rest.length ? key : defaultKey] = rest.length ? rest.join('=') : key;
    });
  return result;
}

export function printVmHardwarePropertyString(values: Record<string, unknown>, defaultKey: string) {
  return Object.entries(values)
    .filter(([, value]) => value !== undefined && value !== null && value !== '')
    .map(([key, value]) => (key === defaultKey ? text(value) : `${key}=${text(value)}`))
    .join(',');
}

export type QemuDrive = Record<string, string> & { file: string };

/** Parses the full QEMU drive property-string so unrelated drive options survive an edit. */
export function parseQemuDrive(value: unknown): QemuDrive {
  const values = parseVmHardwarePropertyString(value, 'file');
  return { file: values.file || '', ...values };
}

export function printQemuDrive(drive: QemuDrive) {
  return printVmHardwarePropertyString(drive, 'file');
}

export type PveQemuVgaDriver = { value: string; label: string; localize?: boolean };

/** Mirrors the target PVE kvm_vga_drivers list in one place for future source syncs. */
export const PVE_QEMU_VGA_DRIVERS: readonly PveQemuVgaDriver[] = [
  { value: '__default__', label: 'Default', localize: true },
  { value: 'std', label: 'Standard VGA', localize: true },
  { value: 'cirrus', label: 'Cirrus Logic GD5446' },
  { value: 'vmware', label: 'VMware compatible' },
  { value: 'qxl', label: 'SPICE' },
  { value: 'qxl2', label: 'SPICE dual monitor' },
  { value: 'qxl3', label: 'SPICE three monitors' },
  { value: 'qxl4', label: 'SPICE four monitors' },
  { value: 'serial0', label: 'Serial terminal 0' },
  { value: 'serial1', label: 'Serial terminal 1' },
  { value: 'serial2', label: 'Serial terminal 2' },
  { value: 'serial3', label: 'Serial terminal 3' },
  { value: 'virtio', label: 'VirtIO-GPU' },
  { value: 'virtio-gl', label: 'VirtIO-GPU (VirGL)' },
  { value: 'none', label: 'None', localize: true },
] as const;

export type PveScsiController = {
  value: string;
  label: string;
  localize?: boolean;
  architectures: readonly string[];
};

export const PVE_SCSI_CONTROLLERS: readonly PveScsiController[] = [
  {
    value: '',
    label: 'Default (LSI 53C895A)',
    localize: true,
    architectures: ['x86_64'],
  },
  {
    value: 'virtio-scsi-single',
    label: 'VirtIO SCSI single',
    architectures: ['x86_64', 'aarch64'],
  },
  { value: 'virtio-scsi-pci', label: 'VirtIO SCSI', architectures: ['x86_64', 'aarch64'] },
  { value: 'lsi', label: 'LSI 53C895A', architectures: ['x86_64'] },
  { value: 'lsi53c810', label: 'LSI 53C810', architectures: ['x86_64'] },
  { value: 'megasas', label: 'MegaRAID SAS 8708EM2', architectures: ['x86_64'] },
  { value: 'pvscsi', label: 'VMware PVSCSI', architectures: ['x86_64'] },
] as const;

export function allowedScsiControllers(arch: string) {
  return PVE_SCSI_CONTROLLERS.filter((option) => option.architectures.includes(arch));
}
