import { request } from './request';
import type { PveRecord } from './resources';

export function getClusterOptions() {
  return request<PveRecord>('/api2/json/cluster/options', { method: 'GET', notifyOnError: true });
}

export function updateClusterOptions(data: Record<string, unknown>) {
  return request('/api2/extjs/cluster/options', { method: 'PUT', data, notifyOnError: true });
}

export function getLocalNetworks() {
  return request<PveRecord[]>('/api2/json/nodes/localhost/network', { method: 'GET', notifyOnError: true });
}
