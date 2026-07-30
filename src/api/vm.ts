import { request } from './request';

export type VmResource = {
  id?: string;
  vmid: number | string;
  name?: string;
  rawName?: string;
  displayName?: string;
  description?: string;
  node?: string;
  type?: string;
  status?: string;
  cpu?: number;
  mem?: number;
  maxmem?: number;
  disk?: number;
  maxdisk?: number;
  uptime?: number;
  tags?: string;
  pool?: string;
  template?: number | boolean;
};

export type VmTask = {
  upid: string;
  starttime?: number;
  endtime?: number;
  node?: string;
  user?: string;
  type?: string;
  id?: string;
  status?: string;
};

/** Returns cluster guest resources. Callers choose the guest type they render. */
export function getVmResources() {
  return request<VmResource[]>('/api2/json/cluster/resources', {
    method: 'GET',
    params: { type: 'vm' },
    notifyOnError: true,
  });
}

export type VmPowerCommand =
  'start' | 'shutdown' | 'stop' | 'reboot' | 'reset' | 'suspend' | 'resume';

export function runVmPowerCommand(
  node: string,
  vmid: number | string,
  command: VmPowerCommand,
  data?: Record<string, unknown>,
) {
  return request<string>(
    `/api2/extjs/nodes/${encodeURIComponent(node)}/qemu/${encodeURIComponent(String(vmid))}/status/${command}`,
    { method: 'POST', ...(data ? { data } : {}), notifyOnError: true },
  );
}

export function runCtPowerCommand(
  node: string,
  vmid: number | string,
  command: VmPowerCommand,
  data?: Record<string, unknown>,
) {
  return request<string>(
    `/api2/extjs/nodes/${encodeURIComponent(node)}/lxc/${encodeURIComponent(String(vmid))}/status/${command}`,
    { method: 'POST', ...(data ? { data } : {}), notifyOnError: true },
  );
}

/**
 * Without a VMID this returns the next free ID. With a VMID it verifies that
 * the requested ID is still available, matching PVE.form.GuestIDSelector.
 */
export function getNextVmId(vmid?: number | string) {
  return request<number | string>('/api2/extjs/cluster/nextid', {
    method: 'GET',
    ...(vmid === undefined ? {} : { params: { vmid } }),
    notifyOnError: true,
  });
}

export type VmCpuModel = { name?: string; displayname?: string; vendor?: string };
export type VmCpuFlag = {
  name?: string;
  description?: string;
  'supported-on'?: string[];
};
export type VmMachineType = { id?: string; type?: string; version?: string };

/** CPU models supplied by the selected PVE node. */
export function getVmCpuModels(node: string) {
  return request<VmCpuModel[]>(
    `/api2/json/nodes/${encodeURIComponent(node)}/capabilities/qemu/cpu`,
    { method: 'GET', notifyOnError: true },
  );
}

/** CPU flags supplied by the selected PVE node. */
export function getVmCpuFlags(node: string) {
  return request<Array<VmCpuFlag | string>>(
    `/api2/json/nodes/${encodeURIComponent(node)}/capabilities/qemu/cpu-flags`,
    { method: 'GET', notifyOnError: true },
  );
}

/** QEMU machine versions supplied by the selected PVE node. */
export function getVmMachineTypes(node: string, arch?: string) {
  return request<VmMachineType[]>(
    `/api2/json/nodes/${encodeURIComponent(node)}/capabilities/qemu/machines`,
    {
      method: 'GET',
      ...(arch ? { params: { arch } } : {}),
      notifyOnError: true,
    },
  );
}

export function migrateVm(
  node: string,
  vmid: number | string,
  data: {
    target: string;
    online?: 1;
    'with-local-disks'?: 1;
    targetstorage?: string;
    force?: 1;
    'with-conntrack-state'?: 1;
  },
) {
  return request<string>(
    `/api2/extjs/nodes/${encodeURIComponent(node)}/qemu/${encodeURIComponent(String(vmid))}/migrate`,
    { method: 'POST', data, notifyOnError: true },
  );
}

export function cloneVm(
  node: string,
  vmid: number | string,
  data: {
    newid: number | string;
    name?: string;
    target?: string;
    full?: 0 | 1;
    storage?: string;
    format?: string;
    snapname?: string;
    pool?: string;
  },
) {
  return request<string>(
    `/api2/extjs/nodes/${encodeURIComponent(node)}/qemu/${encodeURIComponent(String(vmid))}/clone`,
    { method: 'POST', data, notifyOnError: true },
  );
}

export function deleteVm(
  node: string,
  vmid: number | string,
  data?: { purge?: 0 | 1; 'destroy-unreferenced-disks'?: 0 | 1 },
) {
  return request<string>(
    `/api2/extjs/nodes/${encodeURIComponent(node)}/qemu/${encodeURIComponent(String(vmid))}`,
    { method: 'DELETE', ...(data ? { data } : {}), notifyOnError: true },
  );
}

export function convertVmToTemplate(node: string, vmid: number | string) {
  return request<string>(
    `/api2/extjs/nodes/${encodeURIComponent(node)}/qemu/${encodeURIComponent(String(vmid))}/template`,
    { method: 'POST', notifyOnError: true },
  );
}

export function resizeVmDisk(node: string, vmid: number | string, disk: string, size: string) {
  return request<string>(
    `/api2/extjs/nodes/${encodeURIComponent(node)}/qemu/${encodeURIComponent(String(vmid))}/resize`,
    { method: 'PUT', data: { disk, size }, notifyOnError: true },
  );
}

export function moveVmDisk(
  node: string,
  vmid: number | string,
  data: { disk: string; storage: string; delete?: 0 | 1; format?: string },
) {
  return request<string>(
    `/api2/extjs/nodes/${encodeURIComponent(node)}/qemu/${encodeURIComponent(String(vmid))}/move_disk`,
    { method: 'POST', data, notifyOnError: true },
  );
}

export function createVm(node: string, data: Record<string, unknown>) {
  return request<string>(`/api2/extjs/nodes/${encodeURIComponent(node)}/qemu`, {
    method: 'POST',
    data,
    notifyOnError: true,
  });
}

export function runVmBackup(
  node: string,
  vmid: number | string,
  data: {
    storage: string;
    mode: 'snapshot' | 'suspend' | 'stop';
    compress?: 'zstd' | 'lzo' | 'gzip' | '0';
    protected?: 0 | 1;
    remove?: 0 | 1;
    mailto?: string;
    'notification-mode'?: string;
    'notes-template'?: string;
  },
) {
  return request<string>(`/api2/json/nodes/${encodeURIComponent(node)}/vzdump`, {
    method: 'POST',
    data: { ...data, vmid },
    notifyOnError: true,
  });
}

export function getVmBackupDefaults(node: string, storage: string) {
  return request<Record<string, unknown>>(
    `/api2/json/nodes/${encodeURIComponent(node)}/vzdump/defaults`,
    {
      method: 'GET',
      params: { storage },
      notifyOnError: true,
    },
  );
}

export function getVmTaskHistory(
  node: string,
  vmid: number | string,
  params: { errors?: 0 | 1; start?: number; limit?: number } = {},
) {
  return request<VmTask[]>(`/api2/json/nodes/${encodeURIComponent(node)}/tasks`, {
    method: 'GET',
    params: { vmid, start: 0, limit: 500, errors: 0, ...params },
    notifyOnError: true,
  });
}

export function restoreVmBackup(
  node: string,
  data: {
    vmid: number | string;
    archive: string;
    storage?: string;
    bwlimit?: number;
    unique?: 0 | 1;
    force?: 0 | 1;
    name?: string;
    cores?: number;
    memory?: number;
    sockets?: number;
    start?: 0 | 1;
    'live-restore'?: 0 | 1;
    'ha-managed'?: 0 | 1;
  },
) {
  return request<string>(`/api2/json/nodes/${encodeURIComponent(node)}/qemu`, {
    method: 'POST',
    data,
    notifyOnError: true,
  });
}

export function getVmBackupConfiguration(node: string, volume: string) {
  return request<string>(`/api2/extjs/nodes/${encodeURIComponent(node)}/vzdump/extractconfig`, {
    method: 'GET',
    params: { volume },
    notifyOnError: true,
  });
}

export function getVmSpiceProxy(node: string, vmid: number | string, proxy: string) {
  return request<Record<string, string>>(
    `/api2/extjs/nodes/${encodeURIComponent(node)}/qemu/${encodeURIComponent(String(vmid))}/spiceproxy`,
    { method: 'POST', data: { proxy }, notifyOnError: true },
  );
}

export function regenerateVmCloudInitImage(node: string, vmid: number | string) {
  return request<string>(
    `/api2/extjs/nodes/${encodeURIComponent(node)}/qemu/${encodeURIComponent(String(vmid))}/cloudinit`,
    {
      method: 'PUT',
      notifyOnError: true,
    },
  );
}

export function runVmMonitorCommand(node: string, vmid: number | string, command: string) {
  return request<string>(
    `/api2/extjs/nodes/${encodeURIComponent(node)}/qemu/${encodeURIComponent(String(vmid))}/monitor`,
    {
      method: 'POST',
      data: { command },
      notifyOnError: true,
    },
  );
}
