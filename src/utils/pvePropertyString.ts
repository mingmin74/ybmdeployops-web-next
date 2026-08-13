import { textValue } from './pveFormat';

export function parsePropertyString(value: unknown): Record<string, string> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, item]) => [key, textValue(item)]),
    );
  }

  return textValue(value)
    .split(',')
    .reduce<Record<string, string>>((result, item) => {
      const [key, ...parts] = item.split('=');
      if (key && parts.length) result[key] = parts.join('=');
      return result;
    }, {});
}

export function printPropertyString(value: Record<string, unknown>) {
  return Object.entries(value)
    .filter(([, item]) => item !== undefined && item !== null && item !== '')
    .map(([key, item]) => `${key}=${Array.isArray(item) ? item.join(';') : String(item)}`)
    .join(',');
}
