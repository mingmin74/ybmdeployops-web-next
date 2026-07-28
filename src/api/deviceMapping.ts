import { request } from './request';
import type { PveRecord } from './resources';

export function getPciMappings(node: string) {
  return request<PveRecord[]>('/api2/json/cluster/mapping/pci', {
    method: 'GET',
    params: { 'check-node': node },
    notifyOnError: true,
  });
}

export function getUsbMappings(node: string) {
  return request<PveRecord[]>('/api2/json/cluster/mapping/usb', {
    method: 'GET',
    params: { 'check-node': node },
    notifyOnError: true,
  });
}
