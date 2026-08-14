import type { PveRecord } from '@/api/resources';
import { textValue } from '@/utils/pveFormat';

export type DiskBus = 'ide' | 'sata' | 'scsi' | 'virtio';

export const diskBusLimits: Record<DiskBus, number> = {
  ide: 4,
  sata: 6,
  scsi: 31,
  virtio: 16,
};

export interface DiskSlot {
  bus: DiskBus;
  id: number;
  key: string;
}

const controllerMaxIds = diskBusLimits;

const controllerList: DiskBus[] = ['ide', 'virtio', 'scsi', 'sata'];

export function guestArchitecture(config: PveRecord, hostArch = 'x86_64') {
  return textValue(config.arch) || hostArch || 'x86_64';
}

function busPriority(config: PveRecord, hostArch?: string): Record<DiskBus, number> {
  const arch = guestArchitecture(config, hostArch);
  const ostype = textValue(config.ostype);
  if (arch === 'aarch64') {
    return ostype === 'l26'
      ? { scsi: 4, virtio: 2, sata: 2, ide: 1 }
      : { scsi: 4, sata: 3, virtio: 2, ide: 1 };
  }
  if (ostype === 'l26') return { scsi: 4, virtio: 3, sata: 2, ide: 1 };
  return { ide: 4, sata: 3, scsi: 2, virtio: 1 };
}

export function allowedDiskBusses(config: PveRecord, hostArch?: string) {
  return guestArchitecture(config, hostArch) === 'aarch64'
    ? controllerList.filter((bus) => bus !== 'ide')
    : controllerList;
}

export function sortedDiskBusses(config: PveRecord, hostArch?: string): DiskBus[] {
  const usedControllers: Record<DiskBus, number> = {
    ide: 0,
    sata: 0,
    scsi: 0,
    virtio: 0,
  };
  Object.keys(config).forEach((key) => {
    const match = key.match(/^(ide|sata|scsi|virtio)\d+$/);
    if (!match) return;
    const value = textValue(config[key]);
    if (value.includes('media=cdrom')) return;
    usedControllers[match[1] as DiskBus] += 1;
  });
  const priority = busPriority(config, hostArch);
  return allowedDiskBusses(config, hostArch).sort((left, right) => {
    if (usedControllers[right] === usedControllers[left]) {
      return priority[right] - priority[left];
    }
    return usedControllers[right] - usedControllers[left];
  });
}

export function nextFreeDiskSlot(config: PveRecord, busses = sortedDiskBusses(config)): DiskSlot {
  for (const bus of busses) {
    for (let id = 0; id < controllerMaxIds[bus]; id += 1) {
      const key = `${bus}${id}`;
      if (config[key] === undefined) return { bus, id, key };
    }
  }
  const bus = busses[0] || 'scsi';
  const id = Math.max(controllerMaxIds[bus] - 1, 0);
  return { bus, id, key: `${bus}${id}` };
}

export function nextFreeDiskSlotForBus(config: PveRecord, bus: DiskBus): DiskSlot {
  return nextFreeDiskSlot(config, [bus]);
}

export function validDiskDeviceId(config: PveRecord, bus: DiskBus, id: number) {
  return Number.isInteger(id) && id >= 0 && id < diskBusLimits[bus] && config[`${bus}${id}`] === undefined;
}

export function validDiskSize(size: unknown) {
  const value = Number(size);
  return Number.isFinite(value) && value >= 0.001 && value <= 131072 && /^\d+(?:\.\d{1,3})?$/.test(String(size));
}

export function validBandwidth(value: string, minimum: number, integer = false) {
  if (!value.trim()) return true;
  const number = Number(value);
  return Number.isFinite(number) && number >= minimum && (!integer || Number.isInteger(number));
}

export function validDiskBandwidth(fields: Record<string, unknown>) {
  return ['mbps_rd', 'mbps_wr', 'mbps_rd_max', 'mbps_wr_max'].every((key) =>
    validBandwidth(textValue(fields[key]), 1),
  ) && ['iops_rd', 'iops_wr', 'iops_rd_max', 'iops_wr_max'].every((key) =>
    validBandwidth(textValue(fields[key]), 10, true),
  );
}

export function storageFormats(storage?: PveRecord) {
  const formats = storage?.formats as { supported?: unknown; default?: unknown } | undefined;
  const legacy = storage?.format as [Record<string, unknown>, unknown] | undefined;
  const supported = Array.isArray(formats?.supported)
    ? formats.supported.map(String)
    : legacy?.[0] ? Object.keys(legacy[0]).filter((key) => Boolean(legacy[0][key])) : [];
  const values = supported.filter((format) => format !== 'subvol');
  const defaultFormat = textValue(formats?.default || legacy?.[1]) || 'raw';
  const selected = values.includes('qcow2') ? 'qcow2' : values.includes('raw') ? 'raw' : defaultFormat;
  return { values, selected: values.includes(selected) ? selected : values[0] || '' };
}
