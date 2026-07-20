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

export function deleteStorageContent(node: string, storage: string, volid: string) {
  return request<string>(`/api2/extjs/nodes/${node}/storage/${storage}/content/${encodeURIComponent(volid)}`, {
    method: 'DELETE',
    params: { delay: 5 },
    notifyOnError: true,
  });
}

export function getVmResources() {
  return request<PveRecord[]>('/api2/json/cluster/resources', {
    method: 'GET',
    params: { type: 'vm' },
    notifyOnError: true,
  });
}

export function uploadStorageContent(
  node: string,
  storage: string,
  file: File,
  content: string,
  onProgress?: (percent: number, total: number) => void,
) {
  const session = useSessionStore();
  const form = new FormData();
  form.append('content', content);
  form.append('filename', file);

  return new Promise<string>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `/api2/json/nodes/${encodeURIComponent(node)}/storage/${encodeURIComponent(storage)}/upload`);
    xhr.withCredentials = true;
    if (session.csrfToken) xhr.setRequestHeader('CSRFPreventionToken', session.csrfToken);

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress?.(event.loaded / event.total, event.total);
    };

    xhr.onload = () => {
      try {
        const payload = JSON.parse(xhr.responseText || '{}') as { data?: string; message?: string; success?: boolean };
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
    xhr.send(form);
  });
}
