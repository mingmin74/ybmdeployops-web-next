import { request } from './request';
import type { PveRecord } from './resources';

const baseUrl = '/api2/json/cluster/qemu/custom-cpu-models';

export function getCustomCpuTypes() { return request<PveRecord[]>(baseUrl, { method: 'GET', notifyOnError: true }); }
export function getCustomCpuType(id: string) { return request<PveRecord>(`${baseUrl}/${encodeURIComponent(id)}`, { method: 'GET', notifyOnError: true }); }
export function saveCustomCpuType(id: string | undefined, data: PveRecord) { return request(`${baseUrl}${id ? `/${encodeURIComponent(id)}` : ''}`, { method: id ? 'PUT' : 'POST', data, notifyOnError: true }); }
export function deleteCustomCpuType(id: string) { return request(`${baseUrl}/${encodeURIComponent(id)}`, { method: 'DELETE', notifyOnError: true }); }

export type CpuModel = { name?: string; displayname?: string; vendor?: string; custom?: boolean | number; abstract?: boolean | number };
export type CpuFlag = { name?: string; description?: string; 'supported-on'?: string[] };
export function getCpuModels() { return request<CpuModel[]>('/api2/json/nodes/localhost/capabilities/qemu/cpu', { method: 'GET', notifyOnError: true }); }
export function getCpuFlags() { return request<CpuFlag[]>('/api2/json/cluster/qemu/cpu-flags', { method: 'GET', notifyOnError: true }); }
