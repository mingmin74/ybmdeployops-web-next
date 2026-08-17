import { request } from './request';
import type { PveRecord } from './resources';
import { useSessionStore } from '@/stores/session';

export function getNodeStorage(node: string, content: string) {
  return request<PveRecord[]>(`/api2/json/nodes/${node}/storage`, {
    method: 'GET',
    params: { format: 1, content },
    notifyOnError: true,
  });
}

export function getStorageStatus(node: string, storage: string) {
  return request<PveRecord>(`/api2/json/nodes/${node}/storage/${storage}/status`, {
    method: 'GET',
    notifyOnError: true,
  });
}

export function getStorageContent(node: string, storage: string, content: string) {
  return request<PveRecord[]>(`/api2/json/nodes/${node}/storage/${storage}/content`, {
    method: 'GET',
    params: { content },
    notifyOnError: true,
  });
}

export function deleteStorageContent(node: string, storage: string, volid: string, delay?: number) {
  return request<string>(
    `/api2/extjs/nodes/${node}/storage/${storage}/content/${encodeURIComponent(volid)}`,
    {
      method: 'DELETE',
      ...(delay === undefined ? {} : { params: { delay } }),
      notifyOnError: true,
    }
  );
}

export function updateStorageContent(
  node: string,
  storage: string,
  volid: string,
  data: Record<string, unknown>
) {
  return request(
    `/api2/extjs/nodes/${encodeURIComponent(node)}/storage/${encodeURIComponent(storage)}/content/${encodeURIComponent(volid)}`,
    {
      method: 'PUT',
      data,
      notifyOnError: true,
    }
  );
}

export function getVmResources() {
  return request<PveRecord[]>('/api2/json/cluster/resources', {
    method: 'GET',
    params: { type: 'vm' },
    notifyOnError: true,
  });
}

export function getContainerTemplates(node: string) {
  return request<PveRecord[]>(`/api2/json/nodes/${encodeURIComponent(node)}/aplinfo`, {
    method: 'GET',
    notifyOnError: true,
  });
}

export function downloadContainerTemplate(node: string, storage: string, template: string) {
  return request<string>(`/api2/extjs/nodes/${encodeURIComponent(node)}/aplinfo`, {
    method: 'POST',
    data: { storage, template },
    notifyOnError: true,
  });
}

export function queryOciRepositoryTags(node: string, reference: string) {
  return request<string[]>(`/api2/json/nodes/${encodeURIComponent(node)}/query-oci-repo-tags`, {
    method: 'GET',
    params: { reference },
    notifyOnError: true,
  });
}

export function pullOciRegistryImage(node: string, storage: string, data: Record<string, unknown>) {
  return request<string>(
    `/api2/extjs/nodes/${encodeURIComponent(node)}/storage/${encodeURIComponent(storage)}/oci-registry-pull`,
    {
      method: 'POST',
      data,
      notifyOnError: true,
    }
  );
}

export function queryUrlMetadata(node: string, url: string, verifyCertificates: boolean) {
  return request<PveRecord>(`/api2/json/nodes/${encodeURIComponent(node)}/query-url-metadata`, {
    method: 'GET',
    params: { url, 'verify-certificates': verifyCertificates ? 1 : 0 },
    notifyOnError: true,
  });
}

export function downloadStorageUrl(node: string, storage: string, data: Record<string, unknown>) {
  return request<string>(
    `/api2/extjs/nodes/${encodeURIComponent(node)}/storage/${encodeURIComponent(storage)}/download-url`,
    {
      method: 'POST',
      data,
      notifyOnError: true,
    }
  );
}

export function previewStorageBackupPrune(
  node: string,
  storage: string,
  params: Record<string, unknown>
) {
  return request<PveRecord[]>(
    `/api2/json/nodes/${encodeURIComponent(node)}/storage/${encodeURIComponent(storage)}/prunebackups`,
    {
      method: 'GET',
      params,
      notifyOnError: true,
    }
  );
}

export function pruneStorageBackups(node: string, storage: string, data: Record<string, unknown>) {
  return request<string>(
    `/api2/extjs/nodes/${encodeURIComponent(node)}/storage/${encodeURIComponent(storage)}/prunebackups`,
    {
      method: 'DELETE',
      data,
      notifyOnError: true,
    }
  );
}

export function listStorageBackupFiles(storage: string, volume: string, filepath = '') {
  return request<PveRecord[]>(
    `/api2/json/nodes/localhost/storage/${encodeURIComponent(storage)}/file-restore/list`,
    {
      method: 'GET',
      params: { volume, filepath },
      notifyOnError: true,
    }
  );
}

export function getStorageBackupFileDownloadUrl(
  storage: string,
  volume: string,
  filepath: string,
  archive = 'all'
) {
  const params = new URLSearchParams({ volume, filepath, archive });
  return `/api2/json/nodes/localhost/storage/${encodeURIComponent(storage)}/file-restore/download?${params.toString()}`;
}

export function uploadStorageContent(
  node: string,
  storage: string,
  file: File,
  content: string,
  onProgress?: (percent: number, total: number) => void,
  options: {
    filename?: string;
    checksumAlgorithm?: string;
    checksum?: string;
    onAbortReady?: (abort: () => void) => void;
  } = {}
) {
  const session = useSessionStore();
  const form = new FormData();
  form.append('content', content);
  form.append('filename', file, options.filename || file.name);
  if (options.checksumAlgorithm && options.checksumAlgorithm !== '__default__') {
    form.append('checksum-algorithm', options.checksumAlgorithm);
    if (options.checksum) form.append('checksum', options.checksum.trim());
  }

  return new Promise<string>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open(
      'POST',
      `/api2/json/nodes/${encodeURIComponent(node)}/storage/${encodeURIComponent(storage)}/upload`
    );
    xhr.withCredentials = true;
    if (session.csrfToken) xhr.setRequestHeader('CSRFPreventionToken', session.csrfToken);

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress?.(event.loaded / event.total, event.total);
    };

    xhr.onload = () => {
      try {
        const payload = JSON.parse(xhr.responseText || '{}') as {
          data?: string;
          message?: string;
          success?: boolean;
        };
        if (xhr.status >= 200 && xhr.status < 300 && payload.success !== false) {
          resolve(payload.data || '');
          return;
        }
        reject(new Error(payload.message || xhr.statusText || 'Upload failed'));
      } catch (error) {
        reject(error instanceof Error ? error : new Error('Upload failed'));
      }
    };
    xhr.onerror = () => reject(new Error('Connection error - server offline?'));
    xhr.onabort = () => reject(new Error('Upload aborted'));
    options.onAbortReady?.(() => xhr.abort());
    xhr.send(form);
  });
}
