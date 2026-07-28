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

export type PveNodeTask = {
  upid: string;
  starttime?: number;
  endtime?: number;
  user?: string;
  type?: string;
  id?: string;
  status?: string;
};

export type PveNodeDns = { search?: string; dns1?: string; dns2?: string; dns3?: string };
export type PveNodeTime = { timezone?: string; time?: number };

export function getNodes() {
  return request<PveNode[]>('/api2/json/nodes', {
    method: 'GET',
    notifyOnError: true,
  });
}

export function rebootNode(node: string) {
  return request<string>(`/api2/extjs/nodes/${encodeURIComponent(node)}/status`, {
    method: 'POST',
    data: { command: 'reboot' },
  });
}

export function shutdownNode(node: string) {
  return request<string>(`/api2/extjs/nodes/${encodeURIComponent(node)}/status`, {
    method: 'POST',
    data: { command: 'shutdown' },
  });
}

export function getNodeSpiceShell(node: string, proxy: string) {
  return request<Record<string, string>>(`/api2/extjs/nodes/${encodeURIComponent(node)}/spiceshell`, {
    method: 'POST',
    data: { proxy },
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

export function getNodeTasks(node: string, params: Record<string, unknown>) {
  return request<PveNodeTask[]>(`/api2/json/nodes/${encodeURIComponent(node)}/tasks`, {
    method: 'GET',
    params: { errors: 0, _dc: Date.now(), ...params },
    notifyOnError: true,
  });
}

export function getNodeNetwork(node: string) {
  return request<Record<string, unknown>[]>(`/api2/extjs/nodes/${encodeURIComponent(node)}/network`, { method: 'GET', notifyOnError: true });
}

export function getNodeDns(node: string) {
  return request<PveNodeDns>(`/api2/json/nodes/${encodeURIComponent(node)}/dns`, { method: 'GET', notifyOnError: true });
}

export function getNodeHosts(node: string) {
  return request<{ data?: string }>(`/api2/json/nodes/${encodeURIComponent(node)}/hosts`, { method: 'GET', notifyOnError: true });
}

export function getNodeTime(node: string) {
  return request<PveNodeTime>(`/api2/json/nodes/${encodeURIComponent(node)}/time`, { method: 'GET', notifyOnError: true });
}
