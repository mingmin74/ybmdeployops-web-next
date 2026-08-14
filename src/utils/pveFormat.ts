import { gettext } from '@/locale';

export function timestampToTime(value?: number | string) {
  const numeric = Number(value);
  if (!numeric) return '-';
  const date = new Date(numeric);
  const pad = (part: number) => String(part).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

export function textValue(value: unknown, fallback = '') {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint')
    return String(value);
  return fallback;
}

export function formatBytes(value?: number | string) {
  const numeric = Number(value);
  if (!numeric) return '0B';
  const units = ['B', 'KiB', 'MiB', 'GiB', 'TiB', 'PiB'];
  let size = numeric;
  let unitIndex = 0;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }
  return `${size.toFixed(unitIndex === 0 ? 0 : 2)}${units[unitIndex]}`;
}

export function formatStorageType(type?: unknown, monhost?: unknown, statusView = false) {
  const value = textValue(type);
  const labels: Record<string, string> = {
    dir: 'Directory', lvm: 'LVM', lvmthin: 'LVM-Thin', btrfs: 'BTRFS', nfs: 'NFS',
    cifs: 'SMB/CIFS', iscsi: 'iSCSI', cephfs: 'CephFS', rbd: 'RBD',
    zfs: 'ZFS over iSCSI', zfspool: 'ZFS', pbs: 'Proxmox Backup Server', esxi: 'ESXi',
  };
  const label = labels[value] || value;
  return !statusView && (value === 'rbd' || value === 'cephfs') && !textValue(monhost)
    ? `${label} (PVE)`
    : label || '-';
}

export function formatStorageContent(value?: unknown) {
  const volid = textValue(value);
  if (!volid) return '-';
  const separator = volid.indexOf(':');
  return separator >= 0 ? volid.slice(separator + 1) : volid;
}

export function formatContentSize(row: Record<string, unknown>) {
  if (row.size !== undefined && row.size !== null && row.size !== '') return formatBytes(row.size as number);
  if (row['approximate-size'] !== undefined && row['approximate-size'] !== null) {
    return `~${formatBytes(row['approximate-size'] as number)}`;
  }
  return gettext('unknown');
}

export function formatContentDate(row: Record<string, unknown>) {
  if (textValue(row.content) === 'backup') {
    const volid = textValue(row.volid);
    const match = volid.match(/(\d{4})_(\d{2})_(\d{2})-(\d{2})_(\d{2})_(\d{2})/);
    if (match) return `${match[1]}-${match[2]}-${match[3]} ${match[4]}:${match[5]}:${match[6]}`;
  }
  return row.ctime ? timestampToTime(Number(row.ctime) * 1000) : '-';
}

export function usedPercent(used?: number | string, total?: number | string) {
  const usedNumber = Number(used);
  const totalNumber = Number(total);
  if (!usedNumber || !totalNumber) return 0;
  return Math.min(100, Math.max(0, (usedNumber / totalNumber) * 100));
}

const contentLabels: Record<string, string> = {
  iso: 'ISO Image',
  images: 'Disk Image',
  vztmpl: 'CT Templates',
  backup: 'Backup File',
  rootdir: 'Container',
  snippets: 'Snippets',
  import: 'Import',
};

export function formatContent(content?: unknown) {
  const values = Array.isArray(content) ? content : textValue(content).split(',');
  return values
    .map((item) => textValue(item).trim())
    .filter(Boolean)
    .map((item) => gettext(contentLabels[item] || item))
    .join(' / ');
}

export function objectToText(value: unknown) {
  if (!value || typeof value !== 'object') return '';
  return Object.entries(value as Record<string, unknown>)
    .filter(([, item]) => item !== undefined && item !== null && item !== '')
    .map(([key, item]) => `${key}=${String(item)}`)
    .join(',');
}

export function formatTaskDescription(type?: unknown, id?: unknown) {
  const typeText = textValue(type, '-');
  const idText = id === undefined || id === null || id === '' ? '' : ` ${textValue(id)}`;
  return `${typeText}${idText}`;
}

export const severityMap: Record<number, string> = {
  0: 'Panic',
  1: 'Alert',
  2: 'Critical',
  3: 'Error',
  4: 'Warning',
  5: 'Notice',
  6: 'Info',
  7: 'Debug',
};

export const severityColor: Record<number, string> = {
  0: 'negative',
  1: 'warning',
  2: 'negative',
  3: 'negative',
  4: 'warning',
  5: 'info',
  6: 'primary',
  7: 'grey',
};
