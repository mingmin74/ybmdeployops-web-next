import { request } from './request';
import type { PveRecord } from './resources';

export function getMetricServers() {
  return request<PveRecord[]>('/api2/json/cluster/metrics/server', {
    method: 'GET',
    notifyOnError: true,
  });
}

export function getMetricServer(id: string) {
  return request<PveRecord>(`/api2/extjs/cluster/metrics/server/${encodeURIComponent(id)}`, {
    method: 'GET',
    notifyOnError: true,
  });
}

export function createMetricServer(id: string, data: Record<string, unknown>) {
  return request(`/api2/extjs/cluster/metrics/server//${encodeURIComponent(id)}`, {
    method: 'POST',
    data,
    notifyOnError: true,
  });
}

export function updateMetricServer(id: string, data: Record<string, unknown>) {
  return request(`/api2/extjs/cluster/metrics/server/${encodeURIComponent(id)}`, {
    method: 'PUT',
    data,
    notifyOnError: true,
  });
}

export function deleteMetricServer(id: string) {
  return request(`/api2/extjs/cluster/metrics/server/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    notifyOnError: true,
  });
}
