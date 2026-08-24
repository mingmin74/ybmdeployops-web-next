import { request } from './request';
import type { PveRecord } from './resources';

export function getHaStatus() {
  return request<PveRecord[]>('/api2/json/cluster/ha/status/current', {
    method: 'GET',
    notifyOnError: true,
  });
}

export function armHa() {
  return request('/api2/extjs/cluster/ha/status/arm-ha', { method: 'POST' });
}

export function disarmHa(mode: 'freeze' | 'ignore') {
  return request('/api2/extjs/cluster/ha/status/disarm-ha', { method: 'POST', data: { mode } });
}

export function getHaResource(id: string) {
  return request<PveRecord>(`/api2/extjs/cluster/ha/resources/${encodeURIComponent(id)}`, {
    method: 'GET',
  });
}

export function createHaResource(data: PveRecord) {
  return request('/api2/extjs/cluster/ha/resources', { method: 'POST', data });
}

export function updateHaResource(id: string, data: PveRecord) {
  return request(`/api2/extjs/cluster/ha/resources/${encodeURIComponent(id)}`, {
    method: 'PUT',
    data,
  });
}

export function deleteHaResource(id: string) {
  return request(`/api2/extjs/cluster/ha/resources/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
}

export function getHaRules() {
  return request<PveRecord[]>('/api2/json/cluster/ha/rules', {
    method: 'GET',
    notifyOnError: true,
  });
}

export function getHaRule(id: string) {
  return request<PveRecord>(`/api2/extjs/cluster/ha/rules/${encodeURIComponent(id)}`, {
    method: 'GET',
  });
}

export function createHaRule(data: PveRecord) {
  return request('/api2/extjs/cluster/ha/rules', { method: 'POST', data });
}

export function updateHaRule(id: string, data: PveRecord) {
  return request(`/api2/extjs/cluster/ha/rules/${encodeURIComponent(id)}`, {
    method: 'PUT',
    data,
  });
}

export function deleteHaRule(id: string) {
  return request(`/api2/extjs/cluster/ha/rules/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

export function getClusterOptions() {
  return request<PveRecord>('/api2/extjs/cluster/options', { method: 'GET' });
}

export function updateClusterOptions(data: PveRecord) {
  return request('/api2/extjs/cluster/options', { method: 'PUT', data });
}
