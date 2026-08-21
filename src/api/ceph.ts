import { request } from './request';
import type { PveRecord } from './resources';

export function getCephStatus(node = 'localhost') {
  return request<PveRecord>(`/api2/json/nodes/${node}/ceph/status`, {
    method: 'GET',
    notifyOnError: true,
  });
}

export function getCephMetadata(node?: string) {
  // Metadata is cluster-scoped in PVE; retain the caller's node context without
  // sending an unsupported parameter to /cluster/ceph/metadata.
  void node;
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

export function getCephFilesystems(node = 'localhost') {
  return request<PveRecord[]>(`/api2/json/nodes/${node}/ceph/fs`, {
    method: 'GET',
    notifyOnError: true,
  });
}

export function createCephFilesystem(
  node: string,
  name: string,
  data?: { pg_num?: number; 'add-storage'?: boolean }
) {
  return request<string>(`/api2/json/nodes/${node}/ceph/fs/${name}`, {
    method: 'POST',
    ...(data ? { data } : {}),
  });
}

export function getCephMetadataServers(node = 'localhost') {
  return request<PveRecord[]>(`/api2/json/nodes/${node}/ceph/mds`, {
    method: 'GET',
    notifyOnError: true,
  });
}

export function createCephMetadataServer(node: string, id: string) {
  return request<string>(`/api2/json/nodes/${node}/ceph/mds/${id}`, { method: 'POST' });
}

export function changeCephMetadataServer(
  host: string,
  name: string,
  action: 'start' | 'stop' | 'restart'
) {
  return request<string>(`/api2/json/nodes/${host}/ceph/${action}`, {
    method: 'POST',
    data: { service: `mds.${name}` },
  });
}

export function destroyCephMetadataServer(host: string, name: string) {
  return request<string>(`/api2/json/nodes/${host}/ceph/mds/${name}`, { method: 'DELETE' });
}

export function getCephMetadataServerSyslog(host: string, name: string) {
  return request<string[]>(`/api2/extjs/nodes/${host}/syslog`, {
    method: 'GET',
    params: { service: `ceph-mds@${name}` },
    notifyOnError: true,
  });
}

export function changeCephService(
  host: string,
  type: 'mon' | 'mgr',
  name: string,
  action: 'start' | 'stop' | 'restart'
) {
  return request<string>(`/api2/json/nodes/${host}/ceph/${action}`, {
    method: 'POST',
    data: { service: `${type}.${name}` },
  });
}

export function getCephServiceSafety(
  host: string,
  type: 'mon' | 'mgr' | 'mds',
  name: string,
  action: 'stop' | 'destroy'
) {
  return request<PveRecord>(`/api2/json/nodes/${host}/ceph/cmd-safety`, {
    method: 'GET',
    params: { service: type, id: name, action },
    notifyOnError: true,
  });
}

export function restartCephServices(type: 'mon' | 'mgr' | 'mds') {
  return request<string>('/api2/json/cluster/ceph/restart-bulk', {
    method: 'POST',
    data: { 'service-type': type },
  });
}

export function createCephService(node: string, type: 'mon' | 'mgr') {
  return request<string>(`/api2/json/nodes/${node}/ceph/${type}/${node}`, { method: 'POST' });
}

export function destroyCephService(host: string, type: 'mon' | 'mgr', name: string) {
  return request<string>(`/api2/json/nodes/${host}/ceph/${type}/${name}`, { method: 'DELETE' });
}

export function getCephServiceSyslog(host: string, type: 'mon' | 'mgr', name: string) {
  return request<string[]>(`/api2/extjs/nodes/${host}/syslog`, {
    method: 'GET',
    params: { service: `ceph-${type}@${name}` },
    notifyOnError: true,
  });
}

export function getCephOsds(node = 'localhost') {
  return request<PveRecord[]>(`/api2/extjs/nodes/${node}/ceph/osd`, {
    method: 'GET',
    notifyOnError: true,
  });
}

export function changeCephOsdService(
  host: string,
  id: string | number,
  action: 'start' | 'stop' | 'restart'
) {
  return request<string>(`/api2/json/nodes/${host}/ceph/${action}`, {
    method: 'POST',
    data: { service: `osd.${id}` },
  });
}

export function runCephOsdCommand(
  node: string,
  id: string | number,
  command: 'in' | 'out' | 'scrub',
  data: PveRecord = {}
) {
  return request<string>(`/api2/json/nodes/${node}/ceph/osd/${id}/${command}`, {
    method: 'POST',
    data,
  });
}

export function createCephOsd(node: string, data: PveRecord) {
  return request<string>(`/api2/json/nodes/${node}/ceph/osd`, { method: 'POST', data });
}

export function destroyCephOsd(host: string, id: string | number, data: PveRecord = {}) {
  return request<string>(`/api2/json/nodes/${host}/ceph/osd/${id}`, { method: 'DELETE', data });
}

export function getCephOsdMetadata(host: string, id: string | number) {
  return request<PveRecord>(`/api2/json/nodes/${host}/ceph/osd/${id}/metadata`, {
    method: 'GET',
    notifyOnError: true,
  });
}

export function getCephOsdLvInfo(host: string, id: string | number, type: string) {
  return request<PveRecord>(`/api2/json/nodes/${host}/ceph/osd/${id}/lv-info`, {
    method: 'GET',
    params: { type },
    notifyOnError: true,
  });
}

export function getCephOsdFlags() {
  return request<PveRecord>('/api2/json/cluster/ceph/flags', {
    method: 'GET',
    notifyOnError: true,
  });
}

export function setCephOsdFlags(data: PveRecord) {
  return request<string>('/api2/json/cluster/ceph/flags', { method: 'PUT', data });
}

export function restartCephOsds(node?: string, onlyOutdated = false) {
  return request<string>(
    node ? `/api2/json/nodes/${node}/ceph/restart-bulk` : '/api2/json/cluster/ceph/restart-bulk',
    {
      method: 'POST',
      data: { 'service-type': 'osd', ...(onlyOutdated ? { 'only-outdated': 1 } : {}) },
    }
  );
}

export function getCephPools(node = 'localhost') {
  return request<PveRecord[]>(`/api2/json/nodes/${node}/ceph/pool`, {
    method: 'GET',
    notifyOnError: true,
  });
}

export type CephPoolPayload = {
  name?: string;
  size?: number;
  min_size?: number;
  pg_num?: number;
  pg_num_min?: number;
  pg_autoscale_mode?: 'warn' | 'on' | 'off';
  crush_rule?: string;
  target_size_ratio?: number;
  target_size?: string;
  add_storages?: boolean;
};

export function getCephPoolDefaults(node = 'localhost') {
  return request<PveRecord>(`/api2/json/nodes/${node}/ceph/cfg/value`, {
    method: 'GET',
    params: {
      'config-keys': 'global:osd-pool-default-min-size;global:osd-pool-default-size',
    },
    notifyOnError: true,
  });
}

export function createCephPool(node: string, data: CephPoolPayload) {
  return request<string>(`/api2/json/nodes/${node}/ceph/pool`, { method: 'POST', data });
}

export function getCephPoolStatus(node: string, name: string) {
  return request<PveRecord>(
    `/api2/json/nodes/${node}/ceph/pool/${encodeURIComponent(name)}/status`,
    {
      method: 'GET',
      notifyOnError: true,
    }
  );
}

export function updateCephPool(node: string, name: string, data: CephPoolPayload) {
  return request<string>(`/api2/json/nodes/${node}/ceph/pool/${encodeURIComponent(name)}`, {
    method: 'PUT',
    data,
  });
}

export function destroyCephPool(node: string, name: string, removeStorages = true) {
  return request<string>(`/api2/json/nodes/${node}/ceph/pool/${encodeURIComponent(name)}`, {
    method: 'DELETE',
    data: { remove_storages: removeStorages },
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
