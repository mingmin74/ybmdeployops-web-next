import { request } from './request';
import type { PveRecord } from './resources';

export function getFirewallRules() {
  return request<PveRecord[]>('/api2/json/cluster/firewall/rules', { method: 'GET', notifyOnError: true });
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
  return request<PveRecord>('/api2/json/cluster/firewall/options', { method: 'GET', notifyOnError: true });
}

export function updateFirewallOptions(data: PveRecord) {
  return request('/api2/extjs/cluster/firewall/options', { method: 'PUT', data });
}

export function getFirewallGroups() {
  return request<PveRecord[]>('/api2/json/cluster/firewall/groups', { method: 'GET', notifyOnError: true });
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
  return request<PveRecord[]>(`/api2/extjs/cluster/firewall/groups/${group}`, { method: 'GET', notifyOnError: true });
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
  return request<PveRecord[]>('/api2/json/cluster/firewall/aliases', { method: 'GET', notifyOnError: true });
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
  return request<PveRecord[]>('/api2/json/cluster/firewall/ipset', { method: 'GET', notifyOnError: true });
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
  return request<PveRecord[]>(`/api2/json/cluster/firewall/ipset/${name}`, { method: 'GET', notifyOnError: true });
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
