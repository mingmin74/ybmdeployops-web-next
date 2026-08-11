import { request } from './request';
import type { PveRecord } from './resources';

export function getSdnZones() {
  return request<PveRecord[]>('/api2/json/cluster/sdn/zones', {
    method: 'GET',
    params: { pending: 1 },
    notifyOnError: true,
  });
}

export type SdnFabricProtocol = 'openfabric' | 'ospf' | 'wireguard' | 'bgp';

export function getSdnFabrics() {
  return request<{ fabrics?: PveRecord[]; nodes?: PveRecord[] }>(
    '/api2/json/cluster/sdn/fabrics/all',
    {
      method: 'GET',
      params: { pending: 1 },
      notifyOnError: true,
    },
  );
}

export function getSdnFabric(id: string) {
  return request<PveRecord>(`/api2/json/cluster/sdn/fabrics/fabric/${encodeURIComponent(id)}`, {
    method: 'GET',
    notifyOnError: true,
  });
}

export function saveSdnFabric(id: string | undefined, data: PveRecord) {
  const url = id
    ? `/api2/json/cluster/sdn/fabrics/fabric/${encodeURIComponent(id)}`
    : '/api2/json/cluster/sdn/fabrics/fabric';
  return request(url, { method: id ? 'PUT' : 'POST', data, notifyOnError: true });
}

export function deleteSdnFabric(id: string) {
  return request(`/api2/json/cluster/sdn/fabrics/fabric/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    notifyOnError: true,
  });
}

export function getSdnFabricNode(fabricId: string, nodeId: string) {
  return request<PveRecord>(
    `/api2/json/cluster/sdn/fabrics/node/${encodeURIComponent(fabricId)}/${encodeURIComponent(nodeId)}`,
    { method: 'GET', notifyOnError: true },
  );
}

export function getSdnFabricNodes(fabricId: string) {
  return request<PveRecord[]>(
    `/api2/json/cluster/sdn/fabrics/node/${encodeURIComponent(fabricId)}`,
    { method: 'GET', notifyOnError: true },
  );
}

export function saveSdnFabricNode(fabricId: string, nodeId: string | undefined, data: PveRecord) {
  const url = nodeId
    ? `/api2/json/cluster/sdn/fabrics/node/${encodeURIComponent(fabricId)}/${encodeURIComponent(nodeId)}`
    : `/api2/json/cluster/sdn/fabrics/node/${encodeURIComponent(fabricId)}`;
  return request(url, { method: nodeId ? 'PUT' : 'POST', data, notifyOnError: true });
}

export function deleteSdnFabricNode(fabricId: string, nodeId: string) {
  return request(
    `/api2/json/cluster/sdn/fabrics/node/${encodeURIComponent(fabricId)}/${encodeURIComponent(nodeId)}`,
    { method: 'DELETE', notifyOnError: true },
  );
}

export function applySdnChanges() {
  return request('/api2/json/cluster/sdn/', { method: 'PUT', notifyOnError: true });
}

export function getSdnDryRun(node: string) {
  return request<PveRecord>('/api2/json/cluster/sdn/dry-run', {
    method: 'GET',
    params: { node },
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

export function getSdnRouteMapEntries() {
  return request<PveRecord[]>('/api2/json/cluster/sdn/route-maps/entries', {
    method: 'GET',
    params: { pending: 1 },
    notifyOnError: true,
  });
}

export function getSdnRouteMapEntry(routeMapId: string, order: string | number) {
  return request<PveRecord>(
    `/api2/json/cluster/sdn/route-maps/entries/${encodeURIComponent(routeMapId)}/entry/${encodeURIComponent(String(order))}`,
    { method: 'GET', notifyOnError: true },
  );
}

export function saveSdnRouteMapEntry(
  routeMapId: string | undefined,
  order: string | number | undefined,
  data: PveRecord,
) {
  const editing = routeMapId !== undefined && order !== undefined;
  const url = editing
    ? `/api2/json/cluster/sdn/route-maps/entries/${encodeURIComponent(routeMapId)}/entry/${encodeURIComponent(String(order))}`
    : '/api2/json/cluster/sdn/route-maps/entries';
  return request(url, { method: editing ? 'PUT' : 'POST', data, notifyOnError: true });
}

export function deleteSdnRouteMapEntry(routeMapId: string, order: string | number) {
  return request(
    `/api2/json/cluster/sdn/route-maps/entries/${encodeURIComponent(routeMapId)}/entry/${encodeURIComponent(String(order))}`,
    { method: 'DELETE', notifyOnError: true },
  );
}

export function getSdnPrefixLists() {
  return request<PveRecord[]>('/api2/json/cluster/sdn/prefix-lists', {
    method: 'GET',
    params: { pending: 1 },
    notifyOnError: true,
  });
}

export function getSdnPrefixList(id: string) {
  return request<PveRecord>(`/api2/json/cluster/sdn/prefix-lists/${encodeURIComponent(id)}`, {
    method: 'GET',
    notifyOnError: true,
  });
}

export function saveSdnPrefixList(id: string | undefined, data: PveRecord) {
  const url = id
    ? `/api2/json/cluster/sdn/prefix-lists/${encodeURIComponent(id)}`
    : '/api2/json/cluster/sdn/prefix-lists';
  return request(url, { method: id ? 'PUT' : 'POST', data, notifyOnError: true });
}

export function deleteSdnPrefixList(id: string) {
  return request(`/api2/json/cluster/sdn/prefix-lists/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    notifyOnError: true,
  });
}

export function getSdnPrefixListEntries(prefixListId: string) {
  return request<PveRecord[]>(
    `/api2/json/cluster/sdn/prefix-lists/${encodeURIComponent(prefixListId)}/entries`,
    { method: 'GET', notifyOnError: true },
  );
}

export function saveSdnPrefixListEntry(
  prefixListId: string,
  seq: string | number | undefined,
  data: PveRecord,
) {
  const url =
    seq !== undefined
      ? `/api2/json/cluster/sdn/prefix-lists/${encodeURIComponent(prefixListId)}/entries/${encodeURIComponent(String(seq))}`
      : `/api2/json/cluster/sdn/prefix-lists/${encodeURIComponent(prefixListId)}/entries`;
  return request(url, { method: seq !== undefined ? 'PUT' : 'POST', data, notifyOnError: true });
}

export function deleteSdnPrefixListEntry(prefixListId: string, seq: string | number) {
  return request(
    `/api2/json/cluster/sdn/prefix-lists/${encodeURIComponent(prefixListId)}/entries/${encodeURIComponent(String(seq))}`,
    { method: 'DELETE', notifyOnError: true },
  );
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
