import { request } from './request';
import type { PveRecord } from './resources';

export type JournalRecord = {
  t?: string;
};

export function getTaskLogs() {
  return request<PveRecord[]>('/api2/json/cluster/tasks', { method: 'GET', notifyOnError: true });
}

export function getClusterLogs() {
  return request<PveRecord[]>('/api2/json/cluster/log', { method: 'GET', notifyOnError: true });
}

export function getSystemJournal(node: string, params: Record<string, unknown>) {
  return request<string[]>(`/api2/extjs/nodes/${node}/journal`, {
    method: 'GET',
    params: { _dc: Date.now(), ...params },
    notifyOnError: true,
  });
}

export function getTaskLog(node: string, upid: string, params: Record<string, unknown>) {
  return request<JournalRecord[]>(`/api2/extjs/nodes/${node}/tasks/${encodeURIComponent(upid)}/log`, {
    method: 'GET',
    params,
    notifyOnError: true,
  });
}
