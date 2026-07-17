import { gettext } from '@/locale';

export function formatBytes(value: unknown) {
  const size = Number(value);
  if (!Number.isFinite(size) || size <= 0) return '-';

  const units = ['B', 'KiB', 'MiB', 'GiB', 'TiB', 'PiB'];
  let next = size;
  let unitIndex = 0;

  while (next >= 1024 && unitIndex < units.length - 1) {
    next /= 1024;
    unitIndex += 1;
  }

  return `${next.toFixed(next >= 10 || unitIndex === 0 ? 0 : 2)} ${units[unitIndex]}`;
}

export function formatPercent(value: unknown) {
  const number = Number(value);
  if (!Number.isFinite(number)) return '-';
  return `${number.toFixed(2)}%`;
}

export function usagePercent(value: unknown, max: unknown) {
  const used = Number(value);
  const total = Number(max);
  if (!Number.isFinite(used) || !Number.isFinite(total) || total <= 0) return 0;
  return (used / total) * 100;
}

export function progressColor(value: unknown) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 'primary';
  return number >= 90 ? 'red' : number >= 80 ? 'warning' : 'primary';
}

export function formatDate(value: unknown) {
  const timestamp = Number(value);
  if (!timestamp) return gettext('never');
  const date = new Date(timestamp * 1000);
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function yesNo(value: unknown) {
  return Number(value) === 1 || value === true ? gettext('Yes') : gettext('No');
}
