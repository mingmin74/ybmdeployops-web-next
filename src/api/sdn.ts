import { request } from './request';
import type { PveRecord } from './resources';

export function getSdnZones(pending = true) {
  return request<PveRecord[]>('/api2/json/cluster/sdn/zones', {
    method: 'GET',
    ...(pending ? { params: { pending: 1 } } : {}),
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

export function getSdnZone(zone: string) {
  return request<PveRecord>(`/api2/json/cluster/sdn/zones/${encodeURIComponent(zone)}`, {
    method: 'GET',
    notifyOnError: true,
  });
}

export function saveSdnZone(zone: string | undefined, data: PveRecord) {
  const url = zone
    ? `/api2/json/cluster/sdn/zones/${encodeURIComponent(zone)}`
    : '/api2/json/cluster/sdn/zones';
  return request(url, { method: zone ? 'PUT' : 'POST', data, notifyOnError: true });
}

export function deleteSdnZone(zone: string) {
  return request(`/api2/json/cluster/sdn/zones/${encodeURIComponent(zone)}`, {
    method: 'DELETE',
    notifyOnError: true,
  });
}

export function getSdnVnets(pending = 1) {
  return request<PveRecord[]>('/api2/json/cluster/sdn/vnets', {
    method: 'GET',
    params: { pending },
    notifyOnError: true,
  });
}

export function getSdnVnet(vnet: string) {
  return request<PveRecord>(`/api2/json/cluster/sdn/vnets/${encodeURIComponent(vnet)}`, {
    method: 'GET',
    notifyOnError: true,
  });
}

export function saveSdnVnet(vnet: string | undefined, data: PveRecord) {
  const url = vnet
    ? `/api2/json/cluster/sdn/vnets/${encodeURIComponent(vnet)}`
    : '/api2/json/cluster/sdn/vnets';
  return request(url, { method: vnet ? 'PUT' : 'POST', data, notifyOnError: true });
}

export function deleteSdnVnet(vnet: string) {
  return request(`/api2/json/cluster/sdn/vnets/${encodeURIComponent(vnet)}`, {
    method: 'DELETE',
    notifyOnError: true,
  });
}

export function getSdnVnetSubnets(vnet: string, pending = 1) {
  return request<PveRecord[]>(`/api2/json/cluster/sdn/vnets/${encodeURIComponent(vnet)}/subnets`, {
    method: 'GET',
    params: { pending },
    notifyOnError: true,
  });
}

export function getSdnVnetSubnet(vnet: string, subnet: string) {
  return request<PveRecord>(
    `/api2/json/cluster/sdn/vnets/${encodeURIComponent(vnet)}/subnets/${encodeURIComponent(subnet)}`,
    {
      method: 'GET',
      notifyOnError: true,
    },
  );
}

export function saveSdnVnetSubnet(vnet: string, subnet: string | undefined, data: PveRecord) {
  const url = subnet
    ? `/api2/json/cluster/sdn/vnets/${encodeURIComponent(vnet)}/subnets/${encodeURIComponent(subnet)}`
    : `/api2/json/cluster/sdn/vnets/${encodeURIComponent(vnet)}/subnets`;
  return request(url, { method: subnet ? 'PUT' : 'POST', data, notifyOnError: true });
}

export function deleteSdnVnetSubnet(vnet: string, subnet: string) {
  return request(
    `/api2/json/cluster/sdn/vnets/${encodeURIComponent(vnet)}/subnets/${encodeURIComponent(subnet)}`,
    {
      method: 'DELETE',
      notifyOnError: true,
    },
  );
}

export function getSdnControllers(pending = true) {
  return request<PveRecord[]>('/api2/json/cluster/sdn/controllers', {
    method: 'GET',
    ...(pending ? { params: { pending: 1 } } : undefined),
    notifyOnError: true,
  });
}

export function getSdnController(id: string) {
  return request<PveRecord>(`/api2/json/cluster/sdn/controllers/${encodeURIComponent(id)}`, {
    method: 'GET',
    notifyOnError: true,
  });
}

export function saveSdnController(id: string | undefined, data: PveRecord) {
  const url = id
    ? `/api2/json/cluster/sdn/controllers/${encodeURIComponent(id)}`
    : '/api2/json/cluster/sdn/controllers';
  return request(url, { method: id ? 'PUT' : 'POST', data, notifyOnError: true });
}

export function getSdnIpams(pending = true) {
  return request<PveRecord[]>('/api2/json/cluster/sdn/ipams', {
    method: 'GET',
    ...(pending ? { params: { pending: 1 } } : undefined),
    notifyOnError: true,
  });
}

export function getSdnIpam(id: string) {
  return request<PveRecord>(`/api2/json/cluster/sdn/ipams/${encodeURIComponent(id)}`, {
    method: 'GET',
    notifyOnError: true,
  });
}

export function saveSdnIpam(id: string | undefined, data: PveRecord) {
  const url = id
    ? `/api2/json/cluster/sdn/ipams/${encodeURIComponent(id)}`
    : '/api2/json/cluster/sdn/ipams';
  return request(url, { method: id ? 'PUT' : 'POST', data, notifyOnError: true });
}

export function getSdnDns(pending = true) {
  return request<PveRecord[]>('/api2/json/cluster/sdn/dns', {
    method: 'GET',
    ...(pending ? { params: { pending: 1 } } : undefined),
    notifyOnError: true,
  });
}

export function getSdnDnsServer(id: string) {
  return request<PveRecord>(`/api2/json/cluster/sdn/dns/${encodeURIComponent(id)}`, {
    method: 'GET',
    notifyOnError: true,
  });
}

export function saveSdnDns(id: string | undefined, data: PveRecord) {
  const url = id
    ? `/api2/json/cluster/sdn/dns/${encodeURIComponent(id)}`
    : '/api2/json/cluster/sdn/dns';
  return request(url, { method: id ? 'PUT' : 'POST', data, notifyOnError: true });
}

export function getSdnRouteMapEntries() {
  return request<PveRecord[]>('/api2/json/cluster/sdn/route-maps/entries', {
    method: 'GET',
    params: { pending: 1 },
    notifyOnError: true,
  });
}

export function getSdnRouteMaps() {
  return request<PveRecord[]>('/api2/json/cluster/sdn/route-maps', {
    method: 'GET',
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
  return request(`/api2/json/cluster/sdn/controllers/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    notifyOnError: true,
  });
}

export function deleteSdnIpam(id: string) {
  return request(`/api2/json/cluster/sdn/ipams/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    notifyOnError: true,
  });
}

export function deleteSdnDns(id: string) {
  return request(`/api2/json/cluster/sdn/dns/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    notifyOnError: true,
  });
}

export function getIpamsPveStatus() {
  return request<PveRecord[]>('/api2/extjs/cluster/sdn/ipams/pve/status', {
    method: 'GET',
    params: { _dc: Date.now() },
    notifyOnError: true,
  });
}

export function createSdnIpamMapping(vnet: string, data: PveRecord) {
  return request(`/api2/extjs/cluster/sdn/vnets/${encodeURIComponent(vnet)}/ips`, {
    method: 'POST',
    data,
    notifyOnError: true,
  });
}

export function updateSdnIpamMapping(vnet: string, data: PveRecord) {
  return request(`/api2/extjs/cluster/sdn/vnets/${encodeURIComponent(vnet)}/ips`, {
    method: 'PUT',
    data,
    notifyOnError: true,
  });
}

export function deleteSdnIpamMapping(
  vnet: string,
  data: { zone: string; mac: string; ip: string },
) {
  return request(`/api2/extjs/cluster/sdn/vnets/${encodeURIComponent(vnet)}/ips`, {
    method: 'DELETE',
    params: data,
    notifyOnError: true,
  });
}
