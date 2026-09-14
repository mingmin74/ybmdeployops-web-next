import { PveApiError, request } from './request';

export type CephSetupState = 'ready' | 'not-installed' | 'not-initialized' | 'unavailable';
export function cephSetupState(error: unknown): CephSetupState {
  const message = error instanceof Error ? error.message : String(error);
  if (/not installed/i.test(message)) return 'not-installed';
  if (/not initialized/i.test(message)) return 'not-initialized';
  if (/rados_connect failed/i.test(message)) return 'unavailable';
  throw error;
}

export async function probeCeph(node: string): Promise<CephSetupState> {
  try {
    await request(`/nodes/${encodeURIComponent(node)}/ceph/status`, { silent: true });
    return 'ready';
  } catch (error) {
    return cephSetupState(error);
  }
}

export type CephRelease = {
  release: string;
  version: string;
  available: boolean | number;
  unsupported?: boolean | number;
  'is-default'?: boolean | number;
};
export async function getCephReleases(node: string) {
  try {
    return await request<CephRelease[]>(`/api2/json/nodes/${encodeURIComponent(node)}/ceph/releases`);
  } catch (error) {
    // Older PVE ships this list in PVE.ceph.CephVersionSelector instead of a releases API.
    // Match the deployed native wizard, including its default and technology preview flag.
    const missingEndpoint =
      error instanceof PveApiError &&
      (error.status === 404 ||
        error.status === 501 ||
        (error.status === 500 && /no .*handler|not implemented/i.test(error.message)));
    if (!missingEndpoint) throw error;
    return {
      success: true,
      data: [
        { release: 'squid', version: '19.2', available: true, 'is-default': true },
        { release: 'tentacle', version: '20.2', available: true, unsupported: true },
      ] satisfies CephRelease[],
    };
  }
}
export function initializeCeph(
  node: string,
  data: {
    network: string;
    'cluster-network'?: string;
    size?: number;
    min_size?: number;
  }
) {
  return request(`/nodes/${encodeURIComponent(node)}/ceph/init`, {
    method: 'POST',
    data,
    silent: true,
  });
}
