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
};

export type PveGroupDetail = {
  comment?: string;
};

export type EditUserPayload = {
  userid: string;
  groups?: string;
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

export function getUsers() {
  return request<PveUser[]>('/api2/json/access/users', {
    method: 'GET',
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

export function updateUserPassword(userid: string, password: string) {
  return request('/api2/extjs/access/password', {
    method: 'PUT',
    data: toFormParams({ userid, password }),
    notifyOnError: true,
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
