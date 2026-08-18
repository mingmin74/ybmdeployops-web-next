import { request } from './request';

export type PveRecord = Record<string, unknown>;

export type PveNode = {
  node: string;
  'host-arch'?: string;
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

export type EditPoolPayload = {
  poolid: string;
  comment?: string;
};

export type EditRolePayload = {
  roleid: string;
  privs: string;
};

function toFormParams(data: Record<string, unknown>) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(data)) {
    if (value === undefined || value === null) continue;
    if (Array.isArray(value)) {
      value.forEach((item) => {
        if (typeof item === 'string' || typeof item === 'number' || typeof item === 'boolean') {
          params.append(key, String(item));
        }
      });
    } else if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      params.append(key, String(value));
    }
  }
  return params;
}

export type PveRealm = {
  realm: string;
  type?: string;
  tfa?: string;
  comment?: string;
};

export type RealmSyncJob = {
  id: string;
  realm: string;
  schedule?: string;
  enabled?: number | boolean;
  comment?: string;
  'next-run'?: number;
  'last-run'?: number;
  scope?: string;
  'enable-new'?: string | number;
  'remove-vanished'?: string;
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

export function getPool(poolid: string) {
  return request<PvePool | PvePool[]>('/api2/extjs/pools/', {
    method: 'GET', params: { poolid }, notifyOnError: true,
  });
}

export function createPool(data: EditPoolPayload) {
  return request('/api2/extjs/pools/', {
    method: 'POST', data: toFormParams(data), notifyOnError: true,
  });
}

export function updatePool(poolid: string, data: Omit<EditPoolPayload, 'poolid'>) {
  return request('/api2/extjs/pools/', {
    method: 'PUT', params: { poolid }, data: toFormParams(data), notifyOnError: true,
  });
}

export function removePool(poolid: string) {
  return request('/api2/extjs/pools/', {
    method: 'DELETE', params: { poolid }, notifyOnError: true,
  });
}

export function getAvailablePrivileges() {
  return request<Record<string, unknown>>('/api2/extjs/access/roles/Administrator', {
    method: 'GET', notifyOnError: true,
  });
}

export function getRole(roleid: string) {
  return request<Record<string, unknown>>(`/api2/extjs/access/roles/${encodeURIComponent(roleid)}`, {
    method: 'GET', notifyOnError: true,
  });
}

export function createRole(data: EditRolePayload) {
  return request('/api2/extjs/access/roles', {
    method: 'POST', data: toFormParams(data), notifyOnError: true,
  });
}

export function updateRole(roleid: string, data: Omit<EditRolePayload, 'roleid'>) {
  return request(`/api2/extjs/access/roles/${encodeURIComponent(roleid)}`, {
    method: 'PUT', data: toFormParams(data), notifyOnError: true,
  });
}

export function removeRole(roleid: string) {
  return request(`/api2/extjs/access/roles/${encodeURIComponent(roleid)}`, {
    method: 'DELETE', notifyOnError: true,
  });
}

export function getRealms() {
  return request<PveRealm[]>('/api2/json/access/domains', { method: 'GET', notifyOnError: true });
}

export function getRealm(realm: string) {
  return request<Record<string, unknown>>(`/api2/extjs/access/domains/${encodeURIComponent(realm)}`, { method: 'GET', notifyOnError: true });
}
export function createRealm(data: Record<string, unknown>) {
  return request('/api2/extjs/access/domains', { method: 'POST', data: toFormParams(data), notifyOnError: true });
}
export function updateRealm(realm: string, data: Record<string, unknown>) {
  return request(`/api2/extjs/access/domains/${encodeURIComponent(realm)}`, { method: 'PUT', data: toFormParams(data), notifyOnError: true });
}
export function removeRealm(realm: string) {
  return request(`/api2/extjs/access/domains/${encodeURIComponent(realm)}`, { method: 'DELETE', notifyOnError: true });
}
export function syncRealm(realm: string, data: Record<string, unknown>) {
  return request<string>(`/api2/extjs/access/domains/${encodeURIComponent(realm)}/sync`, { method: 'POST', data: toFormParams(data), notifyOnError: true });
}
export function getRealmSyncJobs() {
  return request<RealmSyncJob[]>('/api2/json/cluster/jobs/realm-sync', { method: 'GET', notifyOnError: true });
}
export function getRealmSyncJob(id: string) {
  return request<RealmSyncJob>(`/api2/extjs/cluster/jobs/realm-sync/${encodeURIComponent(id)}`, { method: 'GET', notifyOnError: true });
}
export function createRealmSyncJob(id: string, data: Record<string, unknown>) {
  return request(`/api2/extjs/cluster/jobs/realm-sync/${encodeURIComponent(id)}`, { method: 'POST', data: toFormParams(data), notifyOnError: true });
}
export function updateRealmSyncJob(id: string, data: Record<string, unknown>) {
  return request(`/api2/extjs/cluster/jobs/realm-sync/${encodeURIComponent(id)}`, { method: 'PUT', data: toFormParams(data), notifyOnError: true });
}
export function removeRealmSyncJob(id: string) {
  return request(`/api2/extjs/cluster/jobs/realm-sync/${encodeURIComponent(id)}`, { method: 'DELETE', notifyOnError: true });
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
