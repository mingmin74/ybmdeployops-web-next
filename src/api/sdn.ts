import { request } from './request';
import type { PveRecord } from './resources';

export function getSdnZones() {
  return request<PveRecord[]>('/api2/json/cluster/sdn/zones', {
    method: 'GET',
    params: { pending: 1 },
    notifyOnError: true,
  });
}

export function deleteSdnZone(zone: string) {
  return request(`/api2/extjs/cluster/sdn/zones//${zone}`, { method: 'DELETE' });
}

export function getSdnVnets(pending = 1) {
  return request<PveRecord[]>('/api2/json/cluster/sdn/vnets', {
    method: 'GET',
    params: { pending },
    notifyOnError: true,
  });
}

export function deleteSdnVnet(vnet: string) {
  return request(`/api2/extjs/cluster/sdn/vnets//${vnet}`, { method: 'DELETE' });
}

export function getSdnVnetSubnets(vnet: string, pending = 1) {
  return request<PveRecord[]>(`/api2/json/cluster/sdn/vnets/${vnet}/subnets`, {
    method: 'GET',
    params: { pending },
    notifyOnError: true,
  });
}

export function deleteSdnVnetSubnet(vnet: string, subnet: string) {
  return request(`/api2/extjs/cluster/sdn/vnets/${vnet}/subnets//${subnet}`, { method: 'DELETE' });
}

export function getSdnControllers() {
  return request<PveRecord[]>('/api2/json/cluster/sdn/controllers', {
    method: 'GET',
    params: { pending: 1 },
    notifyOnError: true,
  });
}

export function getSdnIpams() {
  return request<PveRecord[]>('/api2/json/cluster/sdn/ipams', {
    method: 'GET',
    params: { pending: 1 },
    notifyOnError: true,
  });
}

export function getSdnDns() {
  return request<PveRecord[]>('/api2/json/cluster/sdn/dns', {
    method: 'GET',
    params: { pending: 1 },
    notifyOnError: true,
  });
}

export function deleteSdnController(id: string) {
  return request(`/api2/extjs/cluster/sdn/controllers//${id}`, { method: 'DELETE' });
}

export function deleteSdnIpam(id: string) {
  return request(`/api2/json/cluster/sdn/ipams/${id}`, { method: 'DELETE' });
}

export function deleteSdnDns(id: string) {
  return request(`/api2/json/cluster/sdn/dns/${id}`, { method: 'DELETE' });
}

export function getIpamsPveStatus() {
  return request<PveRecord[]>('/api2/extjs/cluster/sdn/ipams/pve/status', {
    method: 'GET',
    params: { _dc: Date.now() },
    notifyOnError: true,
  });
}

export function createSmvnet(data: PveRecord) {
  return request('/api2/extjs/cluster/sdn/vnets/smvnet/ips', { method: 'POST', data });
}

export function updateSmvnet(data: PveRecord) {
  return request('/api2/extjs/cluster/sdn/vnets/smvnet/ips', { method: 'PUT', data });
}

export function deleteSmvnet(data: PveRecord) {
  return request('/api2/extjs/cluster/sdn/vnets/smvnet/ips', { method: 'DELETE', params: data });
}
