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

export type VmTaskHistoryParams = {
  start?: number;
  limit?: number;
  userfilter?: string;
  typefilter?: string;
  statusfilter?: string[];
  since?: number;
  until?: number;
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
  data?: Record<string, unknown>
) {
  return request<string>(
    `/api2/extjs/nodes/${encodeURIComponent(node)}/qemu/${encodeURIComponent(String(vmid))}/status/${command}`,
    { method: 'POST', ...(data ? { data } : {}), notifyOnError: true }
  );
}

export function runCtPowerCommand(
  node: string,
  vmid: number | string,
  command: VmPowerCommand,
  data?: Record<string, unknown>
) {
  return request<string>(
    `/api2/extjs/nodes/${encodeURIComponent(node)}/lxc/${encodeURIComponent(String(vmid))}/status/${command}`,
    { method: 'POST', ...(data ? { data } : {}), notifyOnError: true }
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
export function getVmCpuModels(node: string, arch?: string) {
  return request<VmCpuModel[]>(
    `/api2/json/nodes/${encodeURIComponent(node)}/capabilities/qemu/cpu`,
    { method: 'GET', params: { arch }, notifyOnError: true }
  );
}

/** CPU flags supplied by the selected PVE node. */
export function getVmCpuFlags(node: string, arch?: string) {
  return request<Array<VmCpuFlag | string>>(
    `/api2/json/nodes/${encodeURIComponent(node)}/capabilities/qemu/cpu-flags`,
    { method: 'GET', params: { arch }, notifyOnError: true }
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
    }
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
  }
) {
  return request<string>(
    `/api2/extjs/nodes/${encodeURIComponent(node)}/qemu/${encodeURIComponent(String(vmid))}/migrate`,
    { method: 'POST', data, notifyOnError: true }
  );
}

export type VmMigrationPreconditions = Record<string, unknown>;

/** PVE's migration dialog obtains the guest-specific constraints before enabling submit. */
export function getVmMigrationPreconditions(node: string, vmid: number | string) {
  return request<VmMigrationPreconditions>(
    `/api2/json/nodes/${encodeURIComponent(node)}/qemu/${encodeURIComponent(String(vmid))}/migrate`,
    { method: 'GET', notifyOnError: true }
  );
}

export function getVmMigrationCapabilities(node: string) {
  return request<Record<string, unknown>>(
    `/api2/json/nodes/${encodeURIComponent(node)}/capabilities/qemu/migration`,
    { method: 'GET', notifyOnError: true }
  );
}

export function getVmCloneFeature(
  node: string,
  vmid: number | string,
  params: { feature: 'copy' | 'clone'; snapname?: string }
) {
  return request<{ nodes?: string[] }>(
    `/api2/json/nodes/${encodeURIComponent(node)}/qemu/${encodeURIComponent(String(vmid))}/feature`,
    { method: 'GET', params, notifyOnError: true }
  );
}

/** A cluster bulk action is one server-side task, rather than browser-managed per-VM requests. */
export function runVmBulkAction(
  action: 'start' | 'shutdown' | 'stop' | 'suspend' | 'migrate',
  data: Record<string, unknown> & { vms: Array<number | string>; 'max-workers'?: number }
) {
  return request<string>(`/api2/extjs/cluster/bulk-action/guest/${action}`, {
    method: 'POST',
    data,
    notifyOnError: true,
  });
}

export function migrateCt(
  node: string,
  vmid: number | string,
  data: { target: string; online?: 1; 'with-local-disks'?: 1 }
) {
  return request<string>(
    `/api2/extjs/nodes/${encodeURIComponent(node)}/lxc/${encodeURIComponent(String(vmid))}/migrate`,
    { method: 'POST', data, notifyOnError: true }
  );
}

export function getCtMigrationPreconditions(node: string, vmid: number | string) {
  return request<Record<string, unknown>>(
    `/api2/json/nodes/${encodeURIComponent(node)}/lxc/${encodeURIComponent(String(vmid))}/migrate`,
    { method: 'GET', notifyOnError: true }
  );
}

export function cloneCt(
  node: string,
  vmid: number | string,
  data: {
    newid: number | string;
    hostname?: string;
    target?: string;
    full?: 0 | 1;
    storage?: string;
    pool?: string;
  }
) {
  return request<string>(
    `/api2/extjs/nodes/${encodeURIComponent(node)}/lxc/${encodeURIComponent(String(vmid))}/clone`,
    { method: 'POST', data, notifyOnError: true }
  );
}

export function convertCtToTemplate(node: string, vmid: number | string) {
  return request<string>(
    `/api2/extjs/nodes/${encodeURIComponent(node)}/lxc/${encodeURIComponent(String(vmid))}/template`,
    { method: 'POST', notifyOnError: true }
  );
}

export function deleteCt(
  node: string,
  vmid: number | string,
  data?: { purge?: 0 | 1; 'destroy-unreferenced-disks'?: 0 | 1 }
) {
  return request<string>(
    `/api2/extjs/nodes/${encodeURIComponent(node)}/lxc/${encodeURIComponent(String(vmid))}`,
    { method: 'DELETE', ...(data ? { data } : {}), notifyOnError: true }
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
  }
) {
  return request<string>(
    `/api2/extjs/nodes/${encodeURIComponent(node)}/qemu/${encodeURIComponent(String(vmid))}/clone`,
    { method: 'POST', data, notifyOnError: true }
  );
}

export function deleteVm(
  node: string,
  vmid: number | string,
  data?: { purge?: 0 | 1; 'destroy-unreferenced-disks'?: 0 | 1 }
) {
  return request<string>(
    `/api2/extjs/nodes/${encodeURIComponent(node)}/qemu/${encodeURIComponent(String(vmid))}`,
    { method: 'DELETE', ...(data ? { data } : {}), notifyOnError: true }
  );
}

export function convertVmToTemplate(node: string, vmid: number | string) {
  return request<string>(
    `/api2/extjs/nodes/${encodeURIComponent(node)}/qemu/${encodeURIComponent(String(vmid))}/template`,
    { method: 'POST', notifyOnError: true }
  );
}

export function resizeVmDisk(node: string, vmid: number | string, disk: string, size: string) {
  return request<string>(
    `/api2/extjs/nodes/${encodeURIComponent(node)}/qemu/${encodeURIComponent(String(vmid))}/resize`,
    { method: 'PUT', data: { disk, size }, notifyOnError: true }
  );
}

export function resizeCtVolume(node: string, vmid: number | string, volume: string, size: string) {
  return request<string>(
    `/api2/extjs/nodes/${encodeURIComponent(node)}/lxc/${encodeURIComponent(String(vmid))}/resize`,
    { method: 'PUT', data: { disk: volume, size }, notifyOnError: true }
  );
}

export function moveCtVolume(
  node: string,
  vmid: number | string,
  data: { volume: string; storage: string; delete?: 0 | 1 }
) {
  return request<string>(
    `/api2/extjs/nodes/${encodeURIComponent(node)}/lxc/${encodeURIComponent(String(vmid))}/move_volume`,
    { method: 'POST', data, notifyOnError: true }
  );
}

export function reassignCtVolume(
  node: string,
  vmid: number | string,
  data: { volume: string; 'target-vmid': number | string; 'target-volume': string }
) {
  return request<string>(
    `/api2/extjs/nodes/${encodeURIComponent(node)}/lxc/${encodeURIComponent(String(vmid))}/move_volume`,
    { method: 'POST', data, notifyOnError: true }
  );
}

export function moveVmDisk(
  node: string,
  vmid: number | string,
  data: { disk: string; storage: string; delete?: 0 | 1; format?: string }
) {
  return request<string>(
    `/api2/extjs/nodes/${encodeURIComponent(node)}/qemu/${encodeURIComponent(String(vmid))}/move_disk`,
    { method: 'POST', data, notifyOnError: true }
  );
}

export function createVm(node: string, data: Record<string, unknown>) {
  return request<string>(`/api2/extjs/nodes/${encodeURIComponent(node)}/qemu`, {
    method: 'POST',
    data,
    notifyOnError: true,
  });
}

export function createCt(node: string, data: Record<string, unknown>) {
  return request<string>(`/api2/extjs/nodes/${encodeURIComponent(node)}/lxc`, {
    method: 'POST',
    data,
    notifyOnError: true,
  });
}

export function getCtNextId(vmid?: number | string) {
  return request<number | string>('/api2/extjs/cluster/nextid', {
    method: 'GET',
    ...(vmid === undefined ? {} : { params: { vmid } }),
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
    'prune-backups'?: string;
    'pbs-change-detection-mode'?: 'legacy' | 'data' | 'metadata';
  }
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
    }
  );
}

export function getVmTaskHistory(
  node: string,
  vmid: number | string,
  params: VmTaskHistoryParams = {}
) {
  return request<VmTask[]>(`/api2/json/nodes/${encodeURIComponent(node)}/tasks`, {
    method: 'GET',
    params: { vmid, ...params },
    notifyOnError: true,
  });
}

/** Builds PVE's full task-log download URL for the task's node encoded in its UPID. */
export function getVmTaskLogDownloadUrl(upid: string) {
  const [, node] = upid.match(/^UPID:([^:]+):/) || [];
  if (!node) return '';

  const baseUrl = import.meta.env.VITE_PVE_BASE_URL || '';
  return `${baseUrl}/api2/json/nodes/${encodeURIComponent(node)}/tasks/${encodeURIComponent(upid)}/log?download=1`;
}

export function restoreVmBackup(
  node: string,
  data: {
    vmid: number | string;
    archive?: string;
    ostemplate?: string;
    restore?: 0 | 1;
    storage?: string;
    bwlimit?: number;
    unique?: 0 | 1;
    force?: 0 | 1;
    name?: string;
    hostname?: string;
    cores?: number;
    memory?: number;
    sockets?: number;
    start?: 0 | 1;
    'live-restore'?: 0 | 1;
    'ha-managed'?: 0 | 1;
    unprivileged?: 0 | 1;
  },
  type: 'qemu' | 'lxc' = 'qemu'
) {
  return request<string>(`/api2/json/nodes/${encodeURIComponent(node)}/${type}`, {
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
    { method: 'POST', data: { proxy }, notifyOnError: true }
  );
}

export function regenerateVmCloudInitImage(node: string, vmid: number | string) {
  return request<string>(
    `/api2/extjs/nodes/${encodeURIComponent(node)}/qemu/${encodeURIComponent(String(vmid))}/cloudinit`,
    {
      method: 'PUT',
      notifyOnError: true,
    }
  );
}

export function runVmMonitorCommand(node: string, vmid: number | string, command: string) {
  return request<string>(
    `/api2/extjs/nodes/${encodeURIComponent(node)}/qemu/${encodeURIComponent(String(vmid))}/monitor`,
    {
      method: 'POST',
      data: { command },
      notifyOnError: true,
    }
  );
}
