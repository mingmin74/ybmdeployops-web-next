import { request } from './request';
import type { PveRecord } from './resources';

export function getNodeFirewallRules(node: string) {
  return request<PveRecord[]>(`/api2/json/nodes/${node}/firewall/rules`, {
    method: 'GET',
    notifyOnError: true,
  });
}

function vmFirewallBase(node: string, vmid: string | number, guestType: 'qemu' | 'lxc' = 'qemu') {
  return `/api2/json/nodes/${encodeURIComponent(node)}/${guestType}/${encodeURIComponent(String(vmid))}/firewall`;
}

export function getVmFirewallRules(node: string, vmid: string | number, guestType: 'qemu' | 'lxc' = 'qemu') {
  return request<PveRecord[]>(`${vmFirewallBase(node, vmid, guestType)}/rules`, {
    method: 'GET',
    notifyOnError: true,
  });
}

export function createVmFirewallRule(node: string, vmid: string | number, data: PveRecord, guestType: 'qemu' | 'lxc' = 'qemu') {
  return request(`${vmFirewallBase(node, vmid, guestType)}/rules`, { method: 'POST', data });
}

export function updateVmFirewallRule(
  node: string,
  vmid: string | number,
  pos: string | number,
  data: PveRecord, guestType: 'qemu' | 'lxc' = 'qemu',
) {
  return request(`${vmFirewallBase(node, vmid, guestType)}/rules/${encodeURIComponent(String(pos))}`, {
    method: 'PUT',
    data,
  });
}

export function deleteVmFirewallRule(
  node: string,
  vmid: string | number,
  pos: string | number,
  digest?: unknown, guestType: 'qemu' | 'lxc' = 'qemu',
) {
  return request(`${vmFirewallBase(node, vmid, guestType)}/rules/${encodeURIComponent(String(pos))}`, {
    method: 'DELETE',
    ...(digest ? { data: { digest } } : {}),
  });
}

export function getVmFirewallOptions(node: string, vmid: string | number, guestType: 'qemu' | 'lxc' = 'qemu') {
  return request<PveRecord>(`${vmFirewallBase(node, vmid, guestType)}/options`, {
    method: 'GET',
    notifyOnError: true,
  });
}

export function updateVmFirewallOptions(node: string, vmid: string | number, data: PveRecord, guestType: 'qemu' | 'lxc' = 'qemu') {
  return request(`${vmFirewallBase(node, vmid, guestType)}/options`, { method: 'PUT', data });
}

export function getVmFirewallLogs(node: string, vmid: string | number, params: PveRecord, guestType: 'qemu' | 'lxc' = 'qemu') {
  return request<PveRecord[]>(
    `/api2/extjs/nodes/${encodeURIComponent(node)}/${guestType}/${encodeURIComponent(String(vmid))}/firewall/log`,
    {
      method: 'GET',
      params,
      notifyOnError: true,
    },
  ) as Promise<{ data?: PveRecord[]; total?: number }>;
}

export function getVmFirewallAliases(node: string, vmid: string | number) {
  return request<PveRecord[]>(`${vmFirewallBase(node, vmid)}/aliases`, {
    method: 'GET',
    notifyOnError: true,
  });
}

export function createVmFirewallAlias(node: string, vmid: string | number, data: PveRecord) {
  return request(`${vmFirewallBase(node, vmid)}/aliases`, { method: 'POST', data });
}

export function updateVmFirewallAlias(
  node: string,
  vmid: string | number,
  name: string,
  data: PveRecord,
) {
  return request(`${vmFirewallBase(node, vmid)}/aliases/${encodeURIComponent(name)}`, {
    method: 'PUT',
    data,
  });
}

export function deleteVmFirewallAlias(node: string, vmid: string | number, name: string) {
  return request(`${vmFirewallBase(node, vmid)}/aliases/${encodeURIComponent(name)}`, {
    method: 'DELETE',
  });
}

export function getVmFirewallIpsets(node: string, vmid: string | number) {
  return request<PveRecord[]>(`${vmFirewallBase(node, vmid)}/ipset`, {
    method: 'GET',
    notifyOnError: true,
  });
}

export function createVmFirewallIpset(node: string, vmid: string | number, data: PveRecord) {
  return request(`${vmFirewallBase(node, vmid)}/ipset`, { method: 'POST', data });
}

export function deleteVmFirewallIpset(node: string, vmid: string | number, name: string) {
  return request(`${vmFirewallBase(node, vmid)}/ipset/${encodeURIComponent(name)}`, {
    method: 'DELETE',
  });
}

export function getVmFirewallIpsetEntries(node: string, vmid: string | number, name: string) {
  return request<PveRecord[]>(`${vmFirewallBase(node, vmid)}/ipset/${encodeURIComponent(name)}`, {
    method: 'GET',
    notifyOnError: true,
  });
}

export function createVmFirewallIpsetEntry(
  node: string,
  vmid: string | number,
  name: string,
  data: PveRecord,
) {
  return request(`${vmFirewallBase(node, vmid)}/ipset/${encodeURIComponent(name)}`, {
    method: 'POST',
    data,
  });
}

export function deleteVmFirewallIpsetEntry(
  node: string,
  vmid: string | number,
  name: string,
  cidr: string,
) {
  return request(
    `${vmFirewallBase(node, vmid)}/ipset/${encodeURIComponent(name)}/${encodeURIComponent(cidr)}`,
    { method: 'DELETE' },
  );
}

export function createNodeFirewallRule(node: string, data: PveRecord) {
  return request(`/api2/extjs/nodes/${node}/firewall/rules`, { method: 'POST', data });
}

export function updateNodeFirewallRule(node: string, pos: string | number, data: PveRecord) {
  return request(`/api2/extjs/nodes/${node}/firewall/rules/${pos}`, { method: 'PUT', data });
}

export function deleteNodeFirewallRule(node: string, pos: string | number, digest?: unknown) {
  return request(`/api2/extjs/nodes/${node}/firewall/rules/${pos}`, {
    method: 'DELETE',
    ...(digest ? { data: { digest } } : {}),
  });
}

export function getNodeFirewallOptions(node: string) {
  return request<PveRecord>(`/api2/json/nodes/${node}/firewall/options`, {
    method: 'GET',
    notifyOnError: true,
  });
}

export function updateNodeFirewallOptions(node: string, data: PveRecord) {
  return request(`/api2/extjs/nodes/${node}/firewall/options`, { method: 'PUT', data });
}

export function getNodeFirewallLogs(node: string, params: PveRecord) {
  return request<{ data?: PveRecord[]; total?: number }>(`/api2/extjs/nodes/${node}/firewall/log`, {
    method: 'GET',
    params,
    notifyOnError: true,
  });
}

export function getFirewallRules() {
  return request<PveRecord[]>('/api2/json/cluster/firewall/rules', {
    method: 'GET',
    notifyOnError: true,
  });
}

export function createFirewallRule(data: PveRecord) {
  return request('/api2/extjs/cluster/firewall/rules', { method: 'POST', data });
}

export function updateFirewallRule(pos: string | number, data: PveRecord) {
  return request(`/api2/extjs/cluster/firewall/rules/${pos}`, { method: 'PUT', data });
}

export function deleteFirewallRule(pos: string | number) {
  return request(`/api2/extjs/cluster/firewall/rules/${pos}`, { method: 'DELETE' });
}

export function getFirewallOptions() {
  return request<PveRecord>('/api2/json/cluster/firewall/options', {
    method: 'GET',
    notifyOnError: true,
  });
}

export function updateFirewallOptions(data: PveRecord) {
  return request('/api2/extjs/cluster/firewall/options', { method: 'PUT', data });
}

export function getFirewallGroups() {
  return request<PveRecord[]>('/api2/json/cluster/firewall/groups', {
    method: 'GET',
    notifyOnError: true,
  });
}

export function createFirewallGroup(data: PveRecord) {
  return request('/api2/extjs/cluster/firewall/groups', { method: 'POST', data });
}

export function updateFirewallGroup(data: PveRecord) {
  return request('/api2/extjs/cluster/firewall/groups', { method: 'POST', data });
}

export function deleteFirewallGroup(group: string) {
  return request(`/api2/extjs/cluster/firewall/groups/${group}`, { method: 'DELETE' });
}

export function getFirewallGroupRules(group: string) {
  return request<PveRecord[]>(`/api2/extjs/cluster/firewall/groups/${group}`, {
    method: 'GET',
    notifyOnError: true,
  });
}

export function createFirewallGroupRule(group: string, data: PveRecord) {
  return request(`/api2/extjs/cluster/firewall/groups/${group}`, { method: 'POST', data });
}

export function updateFirewallGroupRule(group: string, pos: string | number, data: PveRecord) {
  return request(`/api2/extjs/cluster/firewall/groups/${group}/${pos}`, { method: 'PUT', data });
}

export function deleteFirewallGroupRule(group: string, pos: string | number) {
  return request(`/api2/extjs/cluster/firewall/groups/${group}/${pos}`, { method: 'DELETE' });
}

export function getFirewallAliases() {
  return request<PveRecord[]>('/api2/json/cluster/firewall/aliases', {
    method: 'GET',
    notifyOnError: true,
  });
}

export function createFirewallAlias(data: PveRecord) {
  return request('/api2/extjs/cluster/firewall/aliases', { method: 'POST', data });
}

export function updateFirewallAlias(name: string, data: PveRecord) {
  return request(`/api2/extjs/cluster/firewall/aliases/${name}`, { method: 'PUT', data });
}

export function deleteFirewallAlias(name: string) {
  return request(`/api2/extjs/cluster/firewall/aliases/${name}`, { method: 'DELETE' });
}

export function getFirewallIpsets() {
  return request<PveRecord[]>('/api2/json/cluster/firewall/ipset', {
    method: 'GET',
    notifyOnError: true,
  });
}

export function createFirewallIpset(data: PveRecord) {
  return request('/api2/extjs/cluster/firewall/ipset', { method: 'POST', data });
}

export function updateFirewallIpset(data: PveRecord) {
  return request('/api2/extjs/cluster/firewall/ipset', { method: 'POST', data });
}

export function deleteFirewallIpset(name: string) {
  return request(`/api2/extjs/cluster/firewall/ipset/${name}`, { method: 'DELETE' });
}

export function getFirewallIpsetEntries(name: string) {
  return request<PveRecord[]>(`/api2/json/cluster/firewall/ipset/${name}`, {
    method: 'GET',
    notifyOnError: true,
  });
}

export function createFirewallIpsetEntry(name: string, data: PveRecord) {
  return request(`/api2/extjs/cluster/firewall/ipset/${name}`, { method: 'POST', data });
}

export function updateFirewallIpsetEntry(name: string, cidr: string, data: PveRecord) {
  return request(`/api2/extjs/cluster/firewall/ipset/${name}/${cidr}`, { method: 'PUT', data });
}

export function deleteFirewallIpsetEntry(name: string, cidr: string) {
  return request(`/api2/extjs/cluster/firewall/ipset/${name}/${cidr}`, { method: 'DELETE' });
}
