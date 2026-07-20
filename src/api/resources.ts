import { request } from './request';

export type PveRecord = Record<string, unknown>;

export type PveNode = {
  node: string;
  status?: string;
  disk?: number;
  maxdisk?: number;
  mem?: number;
  maxmem?: number;
  cpu?: number;
};

export type PvePool = {
  poolid: string;
  comment?: string;
};

export type PveRole = {
  roleid: string;
  special?: number | boolean;
  privs?: string;
};

export type PveRealm = {
  realm: string;
  type?: string;
  comment?: string;
};

export type ClusterInfo = {
  name?: string;
  version?: string | number;
  nodeNumber?: number;
};

export function getPools() {
  return request<PvePool[]>('/api2/extjs/pools', { method: 'GET', notifyOnError: true });
}

export function getRoles() {
  return request<PveRole[]>('/api2/json/access/roles', { method: 'GET', notifyOnError: true });
}

export function getRealms() {
  return request<PveRealm[]>('/api2/json/access/domains', { method: 'GET', notifyOnError: true });
}

export function getApiTokens() {
  return request<PveRecord[]>('/api2/extjs/access/users/', {
    method: 'GET',
    params: { full: 1 },
    notifyOnError: true,
  });
}

export function getNodes() {
  return request<PveNode[]>('/api2/json/nodes', { method: 'GET', notifyOnError: true });
}

export function getClusterResources(params?: PveRecord) {
  return request<PveRecord[]>('/api2/json/cluster/resources', {
    method: 'GET',
    ...(params ? { params } : {}),
    notifyOnError: true,
  });
}

export function getNodeDisks(node: string) {
  return request<PveRecord[]>(`/api2/json/nodes/${node}/disks/list`, {
    method: 'GET',
    notifyOnError: true,
  });
}

export function getNodeDirectories(node: string) {
  return request<PveRecord[]>(`/api2/json/nodes/${node}/disks/directory`, {
    method: 'GET',
    notifyOnError: true,
  });
}

export function getNodeLvm(node: string) {
  return request<{ children?: PveRecord[] } | PveRecord[]>(`/api2/extjs/nodes/${node}/disks/lvm`, {
    method: 'GET',
    params: { _dc: Date.now() },
    notifyOnError: true,
  });
}

export function getNodeLvmThin(node: string) {
  return request<PveRecord[]>(`/api2/json/nodes/${node}/disks/lvmthin`, {
    method: 'GET',
    notifyOnError: true,
  });
}

export function getNodeZfs(node: string) {
  return request<PveRecord[]>(`/api2/json/nodes/${node}/disks/zfs`, {
    method: 'GET',
    notifyOnError: true,
  });
}

export function getClusterConfig() {
  return request<PveRecord>('/api2/extjs/cluster/config', { method: 'GET', notifyOnError: true });
}

export function getClusterStatus() {
  return request<PveRecord[]>('/api2/json/cluster/status', { method: 'GET', notifyOnError: true });
}

export function getClusterNodes() {
  return request<PveRecord[]>('/api2/json/cluster/config/nodes', {
    method: 'GET',
    notifyOnError: true,
  });
}
