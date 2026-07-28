import { request } from './request';
import type { PveRecord } from './resources';

export function getStorages() {
  return request<PveRecord[]>('/api2/json/storage', { method: 'GET', notifyOnError: true });
}

export function getNodeStorages(node = 'localhost', params?: PveRecord) {
  return request<PveRecord[]>(`/api2/json/nodes/${node}/storage`, {
    method: 'GET',
    ...(params ? { params } : {}),
    notifyOnError: true,
  });
}

export function deleteStorage(storage: string) {
  return request(`/api2/extjs/storage/${storage}`, { method: 'DELETE' });
}

export function getStorageConfig(storage: string) {
  return request<PveRecord>(`/api2/extjs/storage/${storage}`, {
    method: 'GET',
    params: { _dc: Date.now() },
    notifyOnError: true,
  });
}

export function createStorage(data: PveRecord) {
  return request<string>('/api2/extjs/storage', { method: 'POST', data });
}

export function updateStorage(storage: string, data: PveRecord) {
  return request<string>(`/api2/extjs/storage/${encodeURIComponent(storage)}`, {
    method: 'PUT',
    data,
  });
}
