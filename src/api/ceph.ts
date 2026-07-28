import { request } from './request';
import type { PveRecord } from './resources';

export function getCephStatus(node = 'localhost') {
  return request<PveRecord>(`/api2/json/nodes/${node}/ceph/status`, {
    method: 'GET',
    notifyOnError: true,
  });
}

export function getCephMetadata() {
  return request<PveRecord>('/api2/json/cluster/ceph/metadata', {
    method: 'GET',
    notifyOnError: true,
  });
}

export function getCephMonitors(node = 'localhost') {
  return request<PveRecord[]>(`/api2/extjs/nodes/${node}/ceph/mon`, {
    method: 'GET',
    notifyOnError: true,
  });
}

export function getCephManagers(node = 'localhost') {
  return request<PveRecord[]>(`/api2/extjs/nodes/${node}/ceph/mgr`, {
    method: 'GET',
    notifyOnError: true,
  });
}

export function getCephOsds(node = 'localhost') {
  return request<PveRecord[]>(`/api2/extjs/nodes/${node}/ceph/osd`, {
    method: 'GET',
    notifyOnError: true,
  });
}

export function getCephPools(node = 'localhost') {
  return request<PveRecord[]>(`/api2/json/nodes/${node}/ceph/pool`, {
    method: 'GET',
    notifyOnError: true,
  });
}

export function getCephCrush(node = 'localhost') {
  return request<PveRecord>(`/api2/extjs/nodes/${node}/ceph/crush`, {
    method: 'GET',
    notifyOnError: true,
  });
}

export function getCephRules(node = 'localhost') {
  return request<PveRecord[]>(`/api2/extjs/nodes/${node}/ceph/rules`, {
    method: 'GET',
    notifyOnError: true,
  });
}

export function getCephConfig(node = 'localhost') {
  return request<string | PveRecord>(`/api2/extjs/nodes/${node}/ceph/cfg/raw`, {
    method: 'GET',
    notifyOnError: true,
  });
}

export function getCephConfigDb(node = 'localhost') {
  return request<PveRecord[]>(`/api2/json/nodes/${node}/ceph/cfg/db`, {
    method: 'GET',
    notifyOnError: true,
  });
}

export function getCephLogs(node = 'localhost', params: PveRecord = {}) {
  return request<string[] | PveRecord[]>(`/api2/extjs/nodes/${node}/ceph/log`, {
    method: 'GET',
    params: { start: 0, limit: 510, ...params },
    notifyOnError: true,
  });
}
