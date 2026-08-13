import { request } from './request';
import type { PveRecord } from './resources';

type MappingKind = 'pci' | 'usb' | 'dir';

export function getDeviceMapping(kind: MappingKind, id: string) {
  return request<PveRecord>(`/api2/json/cluster/mapping/${kind}/${encodeURIComponent(id)}`, {
    method: 'GET',
    notifyOnError: true,
  });
}

export function saveDeviceMapping(kind: MappingKind, id: string | undefined, data: PveRecord) {
  return request(`/api2/json/cluster/mapping/${kind}${id ? `/${encodeURIComponent(id)}` : ''}`, {
    method: id ? 'PUT' : 'POST',
    data,
    notifyOnError: true,
  });
}

export function deleteDeviceMapping(kind: MappingKind, id: string) {
  return request(`/api2/json/cluster/mapping/${kind}/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    notifyOnError: true,
  });
}

export function getPciMappings(node?: string) {
  return request<PveRecord[]>('/api2/json/cluster/mapping/pci', {
    method: 'GET',
    ...(node ? { params: { 'check-node': node } } : {}),
    notifyOnError: true,
  });
}

export function getUsbMappings(node?: string) {
  return request<PveRecord[]>('/api2/json/cluster/mapping/usb', {
    method: 'GET',
    ...(node ? { params: { 'check-node': node } } : {}),
    notifyOnError: true,
  });
}

export function getDirectoryMappings(node?: string) {
  return request<PveRecord[]>('/api2/json/cluster/mapping/dir', {
    method: 'GET',
    ...(node ? { params: { 'check-node': node } } : {}),
    notifyOnError: true,
  });
}
