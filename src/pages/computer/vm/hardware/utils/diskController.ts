import type { PveRecord } from '@/api/resources';
import { textValue } from '@/utils/pveFormat';

export type DiskBus = 'ide' | 'sata' | 'scsi' | 'virtio';

export interface DiskSlot {
  bus: DiskBus;
  id: number;
  key: string;
}

const controllerMaxIds: Record<DiskBus, number> = {
  ide: 4,
  sata: 6,
  scsi: 31,
  virtio: 16,
};

const controllerList: DiskBus[] = ['ide', 'virtio', 'scsi', 'sata'];

function busPriority(config: PveRecord): Record<DiskBus, number> {
  const arch = textValue(config.arch) || 'x86_64';
  const ostype = textValue(config.ostype);
  if (arch === 'aarch64') {
    return ostype === 'l26'
      ? { scsi: 4, virtio: 2, sata: 2, ide: 1 }
      : { scsi: 4, sata: 3, virtio: 2, ide: 1 };
  }
  if (ostype === 'l26') return { scsi: 4, virtio: 3, sata: 2, ide: 1 };
  return { ide: 4, sata: 3, scsi: 2, virtio: 1 };
}

function allowedBusses(config: PveRecord) {
  return textValue(config.arch) === 'aarch64'
    ? controllerList.filter((bus) => bus !== 'ide')
    : controllerList;
}

export function sortedDiskBusses(config: PveRecord): DiskBus[] {
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
  const priority = busPriority(config);
  return allowedBusses(config).sort((left, right) => {
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
