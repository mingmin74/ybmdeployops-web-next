import { request } from './request';

export type LoginPayload = {
  username: string;
  password: string;
  realm: string;
};

export type TicketData = {
  ticket: string;
  username: string;
  CSRFPreventionToken: string;
  cap: Record<string, unknown>;
};

export function loginPve(data: LoginPayload) {
  return request<TicketData>('/api2/extjs/access/ticket', {
    method: 'POST',
    data,
    notifyOnError: true,
  });
}

export function keepLoginAlive(username: string, password: string) {
  return request<TicketData>('/api2/json/access/ticket', {
    method: 'POST',
    data: { username, password },
  });
}

export function getPveVersion() {
  return request('/api2/json/version', { method: 'GET', notifyOnError: true });
}

export function getClusterResources() {
  return request('/api2/json/cluster/resources', { method: 'GET', notifyOnError: true });
}
