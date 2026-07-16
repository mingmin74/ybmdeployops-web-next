import { request } from './request';

export type PveNode = {
  node: string;
  status?: string;
};

export type PveService = {
  name: string;
  service?: string;
  state?: string;
  desc?: string;
};

export type JournalRecord = {
  t?: string;
};

export function getNodes() {
  return request<PveNode[]>('/api2/json/nodes', {
    method: 'GET',
    notifyOnError: true,
  });
}

export function getNodeServices(node: string) {
  return request<PveService[]>(`/api2/json/nodes/${node}/services`, {
    method: 'GET',
    notifyOnError: true,
  });
}

export function startNodeService(node: string, serviceName: string) {
  return request<string>(`/api2/extjs/nodes/${node}/services/${serviceName}/start`, {
    method: 'POST',
    notifyOnError: true,
  });
}

export function stopNodeService(node: string, serviceName: string) {
  return request<string>(`/api2/extjs/nodes/${node}/services/${serviceName}/stop`, {
    method: 'POST',
    notifyOnError: true,
  });
}

export function restartNodeService(node: string, serviceName: string) {
  return request<string>(`/api2/extjs/nodes/${node}/services/${serviceName}/restart`, {
    method: 'POST',
    notifyOnError: true,
  });
}

export function getNodeJournal(
  node: string,
  params: {
    service: string;
    start: number;
    limit: number;
    since: string;
    until: string;
  },
) {
  return request<JournalRecord[]>(`/api2/extjs/nodes/${node}/journal`, {
    method: 'GET',
    params,
    notifyOnError: true,
  });
}
