import type { PveRecord } from '@/api/resources';

export type HardwareType =
  | 'cpu'
  | 'memory'
  | 'bios'
  | 'machine'
  | 'scsi-controller'
  | 'system'
  | 'display'
  | 'keyboard'
  | 'audio'
  | 'disk'
  | 'cdrom'
  | 'unused-disk'
  | 'network'
  | 'usb'
  | 'pci'
  | 'serial'
  | 'virtiofs'
  | 'rng'
  | 'efi'
  | 'tpm'
  | 'cloudinit';

export type DevicePrefix = 'scsi' | 'virtio' | 'sata' | 'ide' | 'net' | 'usb' | 'hostpci' | 'serial' | 'virtiofs';

export interface HardwareRow {
  key: string;
  type: HardwareType;
  name: string;
  value: string;
  editable: boolean;
}

export type VmHardwareConfig = PveRecord;
