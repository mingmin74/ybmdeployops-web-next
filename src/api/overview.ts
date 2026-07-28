import { request } from './request';
import type { PveRecord } from './resources';

export function getVmCurrent(node: string, vmid: string | number, type = 'qemu') {
  return request<PveRecord>(`/api2/json/nodes/${node}/${type}/${vmid}/status/current`, {
    method: 'GET',
    notifyOnError: true,
  });
}

export function getVmConfig(node: string, vmid: string | number, type = 'qemu') {
  return request<PveRecord>(`/api2/json/nodes/${node}/${type}/${vmid}/config`, {
    method: 'GET',
    notifyOnError: false,
  });
}

export function updateVmConfig(
  node: string,
  vmid: string | number,
  data: PveRecord,
  type = 'qemu',
) {
  return request(`/api2/json/nodes/${node}/${type}/${vmid}/config`, {
    method: 'PUT',
    data,
    notifyOnError: true,
  });
}

export function getVmPendingConfig(node: string, vmid: string | number) {
  return request<PveRecord[]>(
    `/api2/json/nodes/${encodeURIComponent(node)}/qemu/${encodeURIComponent(String(vmid))}/pending`,
    {
      method: 'GET',
      notifyOnError: true,
    },
  );
}

export function revertVmConfig(node: string, vmid: string | number, keys: string[]) {
  return request(
    `/api2/extjs/nodes/${encodeURIComponent(node)}/qemu/${encodeURIComponent(String(vmid))}/config`,
    {
      method: 'PUT',
      data: { revert: keys.join(',') },
      notifyOnError: true,
    },
  );
}

export function getVmSnapshots(node: string, vmid: string | number) {
  return request<PveRecord[]>(`/api2/json/nodes/${node}/qemu/${vmid}/snapshot`, {
    method: 'GET',
    notifyOnError: true,
  });
}

export function createVmSnapshot(node: string, vmid: string | number, data: PveRecord) {
  return request<string>(`/api2/json/nodes/${node}/qemu/${vmid}/snapshot`, {
    method: 'POST',
    data,
    notifyOnError: true,
  });
}

export function rollbackVmSnapshot(node: string, vmid: string | number, snapname: string) {
  return request<string>(
    `/api2/json/nodes/${node}/qemu/${vmid}/snapshot/${encodeURIComponent(snapname)}/rollback`,
    {
      method: 'POST',
      notifyOnError: true,
    },
  );
}

export function deleteVmSnapshot(node: string, vmid: string | number, snapname: string) {
  return request<string>(
    `/api2/json/nodes/${node}/qemu/${vmid}/snapshot/${encodeURIComponent(snapname)}`,
    {
      method: 'DELETE',
      notifyOnError: true,
    },
  );
}

export function getVmSnapshotConfig(node: string, vmid: string | number, snapname: string) {
  return request<PveRecord>(
    `/api2/json/nodes/${node}/qemu/${vmid}/snapshot/${encodeURIComponent(snapname)}/config`,
    { method: 'GET', notifyOnError: true },
  );
}

export function updateVmSnapshotConfig(
  node: string,
  vmid: string | number,
  snapname: string,
  data: PveRecord,
) {
  return request(
    `/api2/json/nodes/${node}/qemu/${vmid}/snapshot/${encodeURIComponent(snapname)}/config`,
    { method: 'PUT', data, notifyOnError: true },
  );
}

export function getVmRrd(
  node: string,
  vmid: string | number,
  timeframe = 'hour',
  cf = 'AVERAGE',
  type = 'qemu',
) {
  return request<PveRecord[]>(`/api2/json/nodes/${node}/${type}/${vmid}/rrddata`, {
    method: 'GET',
    params: { timeframe, cf },
    notifyOnError: true,
  });
}

export function getVmGuestAgentInterfaces(node: string, vmid: string | number, type = 'qemu') {
  return request<PveRecord>(
    `/api2/json/nodes/${node}/${type}/${vmid}/agent/network-get-interfaces`,
    {
      method: 'GET',
      notifyOnError: false,
    },
  );
}

export function getNodeStatus(node: string) {
  return request<PveRecord>(`/api2/json/nodes/${node}/status`, {
    method: 'GET',
    notifyOnError: true,
  });
}

export function getNodeConfig(node: string) {
  return request<PveRecord>(`/api2/json/nodes/${encodeURIComponent(node)}/config`, {
    method: 'GET',
    notifyOnError: true,
  });
}

export function updateNodeConfig(node: string, data: PveRecord) {
  return request(`/api2/json/nodes/${encodeURIComponent(node)}/config`, {
    method: 'PUT',
    data,
    notifyOnError: true,
  });
}

export function getNodeRrd(node: string, timeframe = 'hour', cf = 'AVERAGE') {
  return request<PveRecord[]>(`/api2/json/nodes/${node}/rrddata`, {
    method: 'GET',
    params: { timeframe, cf },
    notifyOnError: true,
  });
}

export function getStorageRrd(node: string, storage: string, timeframe = 'hour', cf = 'AVERAGE') {
  return request<PveRecord[]>(`/api2/json/nodes/${node}/storage/${storage}/rrddata`, {
    method: 'GET',
    params: { timeframe, cf },
    notifyOnError: true,
  });
}
