import { request } from './request';
import type { PveRecord } from './resources';

export type JournalRecord = {
  t?: string;
};

export type BackupTask = PveRecord & {
  id: string;
  enabled?: boolean | number;
  node?: string;
  schedule?: string;
  'next-run'?: number;
  type?: string;
  storage?: string;
  vmid?: string;
  pool?: string;
  exclude?: string;
  all?: boolean | number;
};

export type SnapshotTask = PveRecord & {
  id: string;
  snapname?: string;
  enabled?: boolean | number;
  dow?: string;
  starttime?: string;
  vmid?: string | number;
  keepnumber?: string | number;
  description?: string;
  vmstate?: string | number;
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


export function getBackupTasks() {
  return request<BackupTask[]>('/api2/json/cluster/backup', { method: 'GET', notifyOnError: true });
}

export function getBackupTask(id: string) {
  return request<BackupTask>(`/api2/extjs/cluster/backup/${encodeURIComponent(id)}`, { method: 'GET', notifyOnError: true });
}

export function getBackupIncludedVolumes(id: string) {
  return request<PveRecord[]>(`/api2/extjs/cluster/backup/${encodeURIComponent(id)}/included_volumes`, {
    method: 'GET',
    params: { _dc: Date.now() },
    notifyOnError: true,
  });
}

export function createBackupTask(data: Record<string, unknown>) {
  return request<string>('/api2/extjs/cluster/backup', { method: 'POST', data });
}

export function updateBackupTask(id: string, data: Record<string, unknown>) {
  return request<string>(`/api2/extjs/cluster/backup/${encodeURIComponent(id)}`, { method: 'PUT', data });
}

export function removeBackupTask(id: string) {
  return request(`/api2/extjs/cluster/backup/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

export function runBackupTask(node: string, data: Record<string, unknown>) {
  return request<string>(`/api2/extjs/nodes/${encodeURIComponent(node)}/vzdump`, {
    method: 'POST',
    data,
  });
}

export function getGuestsWithoutBackupTask() {
  return request<PveRecord[]>('/api2/json/cluster/backup-info/not-backed-up', { method: 'GET', notifyOnError: true });
}

export function simulateBackupSchedule(schedule: string, iterations: number) {
  return request<PveRecord[]>('/api2/extjs/cluster/jobs/schedule-analyze', {
    method: 'GET',
    params: { schedule, iterations, _dc: Date.now() },
    notifyOnError: true,
  });
}

export function getSnapshotTasks() {
  return request<SnapshotTask[]>('/api2/extjs/cluster/snapshots', { method: 'GET', notifyOnError: true });
}

export function getSnapshotTask(id: string) {
  return request<SnapshotTask>(`/api2/extjs/cluster/snapshots/${encodeURIComponent(id)}`, { method: 'GET', notifyOnError: true });
}

export function createSnapshotTask(data: Record<string, unknown>) {
  return request<string>('/api2/extjs/cluster/snapshots', { method: 'POST', data });
}

export function updateSnapshotTask(id: string, data: Record<string, unknown>) {
  return request<string>(`/api2/extjs/cluster/snapshots/${encodeURIComponent(id)}`, { method: 'PUT', data });
}

export function removeSnapshotTask(id: string) {
  return request(`/api2/extjs/cluster/snapshots/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

export type ReplicationTask = PveRecord & { id: string; guest?: string | number; target?: string; schedule?: string; disable?: boolean | number; jobnum?: string | number; error?: string; last_sync?: number; next_sync?: number; duration?: number; rate?: number; comment?: string };

export function getReplicationTasks(node: string) {
  return request<ReplicationTask[]>(`/api2/json/nodes/${encodeURIComponent(node)}/replication`, { method: 'GET', notifyOnError: true });
}

export function createReplicationTask(data: Record<string, unknown>) {
  return request<string>('/api2/extjs/cluster/replication', { method: 'POST', data });
}

export function updateReplicationTask(id: string, data: Record<string, unknown>) {
  return request<string>(`/api2/extjs/cluster/replication/${encodeURIComponent(id)}`, { method: 'PUT', data });
}

export function removeReplicationTask(id: string) {
  return request(`/api2/extjs/cluster/replication/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

export function runReplicationTask(node: string, id: string) {
  return request<string>(`/api2/extjs/nodes/${encodeURIComponent(node)}/replication/${encodeURIComponent(id)}/schedule_now`, { method: 'POST' });
}

export function getReplicationLogs(node: string, id: string) {
  return request<JournalRecord[]>(`/api2/extjs/nodes/${encodeURIComponent(node)}/replication/${encodeURIComponent(id)}/log`, { method: 'GET', params: { _dc: Date.now(), start: 0, limit: 510 }, notifyOnError: true });
}
