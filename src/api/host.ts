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
  'unit-state'?: string;
  'active-state'?: string;
  'sub-state'?: string;
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
export type PveNodeHosts = { data?: string; digest?: string };
export type PveNodeTime = { timezone?: string; time?: number };
export type PveNodeNetwork = Record<string, unknown> & {
  iface?: string;
  type?: string;
  active?: boolean | number;
};
export type PveNodeNetworkResponse = {
  data?: PveNodeNetwork[];
  changes?: string;
};
export type PveNodePackageVersion = {
  Package?: string;
  OldVersion?: string;
  CurrentState?: string;
  RunningKernel?: string;
  ManagerVersion?: string;
};

export function getNodes() {
  return request<PveNode[]>('/api2/json/nodes', {
    method: 'GET',
    notifyOnError: true,
  });
}

export function getNodePackageVersions(node: string) {
  return request<PveNodePackageVersion[]>(
    `/api2/json/nodes/${encodeURIComponent(node)}/apt/versions`,
    { method: 'GET', notifyOnError: true },
  );
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

/** Runs a node-scoped guest bulk operation, matching PVE's node BulkAction window. */
export function runNodeBulkAction(
  node: string,
  action: 'startall' | 'stopall' | 'suspendall' | 'migrateall',
  data: Record<string, unknown>
) {
  return request<string>(
    `/api2/extjs/nodes/${encodeURIComponent(node)}/${action}`,
    { method: 'POST', data, notifyOnError: true }
  );
}

export function getNodeSpiceShell(node: string, proxy: string) {
  return request<Record<string, string>>(
    `/api2/extjs/nodes/${encodeURIComponent(node)}/spiceshell`,
    {
      method: 'POST',
      data: { proxy },
    },
  );
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

export function reloadNodeService(node: string, serviceName: string) {
  return request<string>(`/api2/extjs/nodes/${node}/services/${serviceName}/reload`, {
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
    since?: string;
    until?: string;
  }
) {
  // PVE ServiceView opens the service journal through the node syslog endpoint.
  return request<JournalRecord[]>(`/api2/extjs/nodes/${node}/syslog`, {
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

export function getNodeNetwork(node: string, params?: Record<string, unknown>) {
  return request<PveNodeNetwork[]>(`/api2/extjs/nodes/${encodeURIComponent(node)}/network`, {
    method: 'GET',
    notifyOnError: true,
    ...(params ? { params } : {}),
  }) as Promise<PveNodeNetworkResponse>;
}

export function getNodeNetworkDevice(node: string, iface: string) {
  return request<PveNodeNetwork>(
    `/api2/extjs/nodes/${encodeURIComponent(node)}/network/${encodeURIComponent(iface)}`,
    { method: 'GET', notifyOnError: true }
  );
}

export function createNodeNetwork(node: string, data: Record<string, unknown>) {
  return request<string>(`/api2/extjs/nodes/${encodeURIComponent(node)}/network`, {
    method: 'POST',
    data,
  });
}

export function updateNodeNetwork(node: string, iface: string, data: Record<string, unknown>) {
  return request<string>(
    `/api2/extjs/nodes/${encodeURIComponent(node)}/network/${encodeURIComponent(iface)}`,
    { method: 'PUT', data }
  );
}

export function deleteNodeNetwork(node: string, iface: string) {
  return request<string>(
    `/api2/extjs/nodes/${encodeURIComponent(node)}/network/${encodeURIComponent(iface)}`,
    { method: 'DELETE' }
  );
}

/** Discards pending /etc/network/interfaces.new changes. */
export function revertNodeNetwork(node: string) {
  return request<string>(`/api2/extjs/nodes/${encodeURIComponent(node)}/network`, {
    method: 'DELETE',
    data: {},
  });
}

/** Applies pending /etc/network/interfaces changes through PVE's network reload task. */
export function applyNodeNetwork(node: string) {
  return request<string>(`/api2/extjs/nodes/${encodeURIComponent(node)}/network`, {
    method: 'PUT',
    data: {},
  });
}

export function getNodeUsbDevices(node: string) {
  return request<Record<string, unknown>[]>(
    `/api2/json/nodes/${encodeURIComponent(node)}/hardware/usb`,
    { method: 'GET', notifyOnError: true },
  );
}

export function getNodePciDevices(node: string) {
  return request<Record<string, unknown>[]>(
    `/api2/json/nodes/${encodeURIComponent(node)}/hardware/pci`,
    { method: 'GET', params: { 'pci-class-blacklist': '' }, notifyOnError: true },
  );
}

export function getNodePciMdevTypes(node: string, pciid: string) {
  return request<Record<string, unknown>[]>(
    `/api2/json/nodes/${encodeURIComponent(node)}/hardware/pci/${encodeURIComponent(pciid)}/mdev`,
    { method: 'GET', notifyOnError: true },
  );
}

export function getNodeDns(node: string) {
  return request<PveNodeDns>(`/api2/json/nodes/${encodeURIComponent(node)}/dns`, {
    method: 'GET',
    notifyOnError: true,
  });
}

export function updateNodeDns(node: string, data: Record<string, unknown>) {
  return request<null>(`/api2/extjs/nodes/${encodeURIComponent(node)}/dns`, {
    method: 'PUT',
    data,
  });
}

export function getNodeHosts(node: string) {
  return request<PveNodeHosts>(`/api2/json/nodes/${encodeURIComponent(node)}/hosts`, {
    method: 'GET',
    notifyOnError: true,
  });
}

export function updateNodeHosts(node: string, data: string, digest?: string) {
  return request<null>(`/api2/extjs/nodes/${encodeURIComponent(node)}/hosts`, {
    method: 'POST',
    data: { data, ...(digest ? { digest } : {}) },
  });
}

export function getNodeTime(node: string) {
  return request<PveNodeTime>(`/api2/json/nodes/${encodeURIComponent(node)}/time`, {
    method: 'GET',
    notifyOnError: true,
  });
}

export function updateNodeTime(node: string, data: Pick<PveNodeTime, 'timezone'>) {
  return request<null>(`/api2/json/nodes/${encodeURIComponent(node)}/time`, {
    method: 'PUT',
    data,
    notifyOnError: true,
  });
}
