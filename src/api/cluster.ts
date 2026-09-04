import { request } from './request';
import type { PveRecord } from './resources';

function formValue(value: unknown): string {
  return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint' ? String(value) : '';
}

function form(data: PveRecord) {
  const result = new URLSearchParams();
  Object.entries(data).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') result.append(key, formValue(value));
  });
  return result;
}

export function getClusterJoinInfo() {
  return request<PveRecord>('/api2/json/cluster/config/join', { method: 'GET' });
}

export function createCluster(data: PveRecord) {
  return request<string>('/api2/extjs/cluster/config', { method: 'POST', data: form(data), notifyOnError: true });
}

export function joinCluster(data: PveRecord) {
  return request<string>('/api2/extjs/cluster/config/join', { method: 'POST', data: form(data), notifyOnError: true });
}
