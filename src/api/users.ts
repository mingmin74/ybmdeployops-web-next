import { request } from './request';

export type PveUser = {
  userid: string;
  enable?: number | boolean;
  expire?: number;
  firstname?: string;
  lastname?: string;
  comment?: string;
  email?: string;
  groups?: string;
  keys?: string;
  'realm-type'?: string;
  'totp-locked'?: boolean;
  'tfa-locked-until'?: number;
};

export type PveUserDetail = {
  enable?: number | boolean;
  expire?: number;
  firstname?: string;
  lastname?: string;
  comment?: string;
  email?: string;
  groups?: string;
  keys?: string;
};

export type PveRealm = {
  realm: string;
  comment?: string;
  tfa?: string;
};

export type PveGroup = {
  groupid: string;
  comment?: string;
  users?: string;
};

export type PveGroupDetail = {
  comment?: string;
};

export type PveTfaEntry = {
  id: string;
  type: string;
  description?: string;
  created?: number;
  enable?: boolean;
};

export type PveTfaUser = {
  userid: string;
  entries?: PveTfaEntry[];
  'tfa-locked-until'?: number;
  'totp-locked'?: boolean;
};

export type EditUserPayload = {
  userid: string;
  groups?: string | string[];
  expire: number;
  enable: 0 | 1;
  firstname?: string;
  lastname?: string;
  email?: string;
  comment?: string;
  keys?: string;
  password?: string;
};

export type EditGroupPayload = {
  groupid: string;
  comment?: string;
};

function toFormParams(data: Record<string, unknown>) {
  const params = new URLSearchParams();
  const appendParam = (key: string, value: unknown) => {
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      params.append(key, String(value));
    }
  };

  Object.entries(data).forEach(([key, value]) => {
    if (value === undefined || value === null) return;

    if (Array.isArray(value)) {
      value.forEach((item) => {
        appendParam(key, item);
      });
      return;
    }

    appendParam(key, value);
  });

  return params;
}

export function getUsers(full = false) {
  return request<PveUser[]>('/api2/json/access/users', {
    method: 'GET',
    ...(full ? { params: { full: 1 } } : {}),
    notifyOnError: true,
  });
}

export function getUser(userid: string) {
  return request<PveUserDetail>(`/api2/extjs/access/users/${encodeURIComponent(userid)}`, {
    method: 'GET',
    notifyOnError: true,
  });
}

export function getRealms() {
  return request<PveRealm[]>('/api2/json/access/domains', {
    method: 'GET',
    notifyOnError: true,
  });
}

export function getGroups() {
  return request<PveGroup[]>('/api2/json/access/groups', {
    method: 'GET',
    notifyOnError: true,
  });
}

export function getTfaUsers() {
  return request<PveTfaUser[]>('/api2/json/access/tfa', {
    method: 'GET',
    notifyOnError: true,
  });
}

export function getGroup(groupid: string) {
  return request<PveGroupDetail>(`/api2/json/access/groups/${encodeURIComponent(groupid)}`, {
    method: 'GET',
    notifyOnError: true,
  });
}

export function createUser(data: EditUserPayload) {
  return request('/api2/extjs/access/users', {
    method: 'POST',
    data: toFormParams(data),
    notifyOnError: true,
  });
}

export function updateUser(userid: string, data: Omit<EditUserPayload, 'userid'>) {
  return request(`/api2/extjs/access/users/${encodeURIComponent(userid)}`, {
    method: 'PUT',
    data: toFormParams(data),
    notifyOnError: true,
  });
}

export function updateUserPassword(userid: string, password: string, confirmationPassword?: string) {
  return request('/api2/extjs/access/password', {
    method: 'PUT',
    data: toFormParams({ userid, password, 'confirmation-password': confirmationPassword }),
    notifyOnError: true,
  });
}

export function unlockUserTfa(userid: string) {
  return request(`/api2/extjs/access/users/${encodeURIComponent(userid)}/unlock-tfa`, {
    method: 'PUT',
    notifyOnError: true,
  });
}

export type EditApiTokenPayload = {
  privsep: 0 | 1;
  expire: number;
  comment?: string;
};

export function createApiToken(userid: string, tokenid: string, data: EditApiTokenPayload) {
  return request<{ value?: string; 'full-tokenid'?: string }>(
    `/api2/extjs/access/users/${encodeURIComponent(userid)}/token/${encodeURIComponent(tokenid)}`,
    { method: 'POST', data: toFormParams(data), notifyOnError: true },
  );
}

export function updateApiToken(userid: string, tokenid: string, data: Partial<EditApiTokenPayload> & { regenerate?: 1 }) {
  return request<{ value?: string; 'full-tokenid'?: string }>(
    `/api2/extjs/access/users/${encodeURIComponent(userid)}/token/${encodeURIComponent(tokenid)}`,
    { method: 'PUT', data: toFormParams(data), notifyOnError: true },
  );
}

export function removeApiToken(userid: string, tokenid: string) {
  return request(`/api2/extjs/access/users/${encodeURIComponent(userid)}/token/${encodeURIComponent(tokenid)}`, {
    method: 'DELETE', notifyOnError: true,
  });
}

export function updateTfaEntry(id: string, data: { description?: string; enable?: 0 | 1; password?: string }) {
  return request(`/api2/extjs/access/tfa/${id.split('/').map(encodeURIComponent).join('/')}`, {
    method: 'PUT', data: toFormParams(data), notifyOnError: true,
  });
}

export function removeTfaEntry(id: string, password?: string) {
  return request(`/api2/extjs/access/tfa/${id.split('/').map(encodeURIComponent).join('/')}`, {
    method: 'DELETE', ...(password ? { params: { password } } : {}), notifyOnError: true,
  });
}

export type CreateTfaEntryResponse = { recovery?: string[]; challenge?: string };

export function createTfaEntry(userid: string, data: Record<string, string>) {
  return request<CreateTfaEntryResponse>(`/api2/extjs/access/tfa/${encodeURIComponent(userid)}`, {
    method: 'POST', data: toFormParams(data), notifyOnError: true,
  });
}

export function getTfaRecovery(userid: string) {
  return request<Record<string, unknown>>(`/api2/extjs/access/tfa/${encodeURIComponent(userid)}/recovery`, {
    method: 'GET', notifyOnError: false,
  });
}

export function removeUser(userid: string) {
  return request(`/api2/extjs/access/users/${encodeURIComponent(userid)}`, {
    method: 'DELETE',
    notifyOnError: true,
  });
}

export function createGroup(data: EditGroupPayload) {
  return request('/api2/json/access/groups', {
    method: 'POST',
    data: toFormParams(data),
    notifyOnError: true,
  });
}

export function updateGroup(groupid: string, data: Omit<EditGroupPayload, 'groupid'>) {
  return request(`/api2/extjs/access/groups/${encodeURIComponent(groupid)}`, {
    method: 'PUT',
    data: toFormParams(data),
    notifyOnError: true,
  });
}

export function removeGroup(groupid: string) {
  return request(`/api2/extjs/access/groups/${encodeURIComponent(groupid)}`, {
    method: 'DELETE',
    notifyOnError: true,
  });
}
