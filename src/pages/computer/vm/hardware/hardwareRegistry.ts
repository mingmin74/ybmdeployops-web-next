import { textValue } from '@/utils/pveFormat';
import type { HardwareType } from './types';

export interface HardwareMeta {
  icon: string;
  capabilities?: string[];
  pendingKeys?: string[];
}

export function resolveHardwareType(key: string, value: string): HardwareType {
  if (key === 'cpu') return 'cpu';
  if (key === 'memory') return 'memory';
  if (key === 'bios') return 'bios';
  if (key === 'machine') return 'machine';
  if (key === 'scsihw') return 'scsi-controller';
  if (key === 'system') return 'system';
  if (key === 'vga') return 'display';
  if (key === 'keyboard') return 'keyboard';
  if (key === 'audio0') return 'audio';
  if (key === 'rng0') return 'rng';
  if (key === 'efidisk0') return 'efi';
  if (key === 'tpmstate0') return 'tpm';
  if (/^unused\d+$/.test(key)) return 'unused-disk';
  if (/^net\d+$/.test(key)) return 'network';
  if (/^usb\d+$/.test(key)) return 'usb';
  if (/^hostpci\d+$/.test(key)) return 'pci';
  if (/^serial\d+$/.test(key)) return 'serial';
  if (/^virtiofs\d+$/.test(key)) return 'virtiofs';
  if (/^(scsi|virtio|sata|ide)\d+$/.test(key)) {
    if (value.includes('cloudinit')) return 'cloudinit';
    if (value.includes('media=cdrom')) return 'cdrom';
  }
  return 'disk';
}

export const hardwareMeta: Partial<Record<HardwareType, HardwareMeta>> = {
  cpu: { icon: 'memory', capabilities: ['VM.Config.CPU', 'VM.Config.HWType'], pendingKeys: ['cpu', 'cores', 'sockets', 'numa', 'vcpus', 'cpulimit', 'cpuunits', 'affinity'] },
  memory: { icon: 'storage', capabilities: ['VM.Config.Memory'], pendingKeys: ['memory', 'balloon', 'shares', 'allow-ksm'] },
  bios: { icon: 'settings', capabilities: ['VM.Config.Options'], pendingKeys: ['bios'] },
  machine: { icon: 'settings', capabilities: ['VM.Config.HWType'], pendingKeys: ['machine'] },
  'scsi-controller': { icon: 'settings', capabilities: ['VM.Config.HWType'], pendingKeys: ['scsihw'] },
  system: { icon: 'settings', capabilities: ['VM.Config.Options', 'VM.Config.HWType'], pendingKeys: ['machine', 'scsihw'] },
  display: { icon: 'desktop_windows', capabilities: ['VM.Config.HWType'] },
  keyboard: { icon: 'keyboard', capabilities: ['VM.Config.HWType'] },
  audio: { icon: 'volume_up', capabilities: ['VM.Config.HWType'] },
  disk: { icon: 'storage', capabilities: ['VM.Config.Disk'] },
  cdrom: { icon: 'storage', capabilities: ['VM.Config.CDROM'] },
  'unused-disk': { icon: 'storage', capabilities: ['VM.Config.Disk'] },
  network: { icon: 'lan', capabilities: ['VM.Config.Network'] },
  usb: { icon: 'usb', capabilities: ['VM.Config.HWType'] },
  pci: { icon: 'memory', capabilities: ['VM.Config.HWType'] },
  serial: { icon: 'settings_input_component', capabilities: ['VM.Config.Disk'] },
  virtiofs: { icon: 'folder', capabilities: ['VM.Config.Options'] },
  rng: { icon: 'casino', capabilities: ['VM.Config.HWType'] },
  efi: { icon: 'security', capabilities: ['VM.Config.Disk'] },
  tpm: { icon: 'security', capabilities: ['VM.Config.Disk'] },
  cloudinit: { icon: 'storage', capabilities: ['VM.Config.Disk'] },
};

export function hardwareIcon(key: string, value = ''): string {
  return hardwareMeta[resolveHardwareType(key, textValue(value))]?.icon ?? 'storage';
}
