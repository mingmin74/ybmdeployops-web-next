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
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') return String(value);
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
