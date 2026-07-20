import { request } from './request';
import type { PveRecord } from './resources';

export function getVmCurrent(node: string, vmid: string | number, type = 'qemu') {
  return request<PveRecord>(`/api2/json/nodes/${node}/${type}/${vmid}/status/current`, {
    method: 'GET',
    notifyOnError: true,
  });
}

export function getVmRrd(node: string, vmid: string | number, timeframe = 'hour', cf = 'AVERAGE', type = 'qemu') {
  return request<PveRecord[]>(`/api2/json/nodes/${node}/${type}/${vmid}/rrddata`, {
    method: 'GET',
    params: { timeframe, cf },
    notifyOnError: true,
  });
}

export function getNodeStatus(node: string) {
  return request<PveRecord>(`/api2/json/nodes/${node}/status`, { method: 'GET', notifyOnError: true });
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
