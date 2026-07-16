import { Notify, type QNotifyCreateOptions } from 'quasar';
import { useSessionStore } from '@/stores/session';
import {
  PveApiError,
  getUnknownErrorMessage,
  parsePveResponse,
  parseResponseText,
} from './response';

export type { PveEnvelope, PveErrorDetail, ParsedResponse } from './response';
export { PveApiError, extractRequestError, extractErrorDetails } from './response';

export type RequestMethod = 'GET' | 'POST' | 'PUT' | 'DELETE';

export type RequestOptions = {
  method?: RequestMethod;
  params?: Record<string, unknown>;
  data?: Record<string, unknown> | URLSearchParams | string;
  json?: boolean;
  silent?: boolean;
  notifyOnError?: boolean;
  timeout?: number;
};

const baseUrl = import.meta.env.VITE_PVE_BASE_URL || '';
const defaultTimeout = 60_000;

function stringifyParam(value: unknown) {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') return String(value);
  if (value instanceof Date) return value.toISOString();
  return JSON.stringify(value);
}

function compactParams(params?: Record<string, unknown>) {
  const search = new URLSearchParams();

  Object.entries(params || {}).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return;

    if (Array.isArray(value)) {
      value.forEach((item) => search.append(key, stringifyParam(item)));
      return;
    }

    search.append(key, stringifyParam(value));
  });

  return search;
}

export function toFormBody(data?: Record<string, unknown> | URLSearchParams | string) {
  if (!data) return undefined;
  if (typeof data === 'string') return data;
  if (data instanceof URLSearchParams) return data.toString();

  return compactParams(data).toString();
}

function normalizeUrl(url: string) {
  const normalizedUrl = url.startsWith('/') ? url : `/${url}`;
  return normalizedUrl.startsWith('/api2') ? normalizedUrl : `/api2/extjs${normalizedUrl}`;
}

function resolveUrl(url: string, params?: Record<string, unknown>) {
  const normalizedUrl = normalizeUrl(url);
  const search = compactParams(params).toString();
  const queryJoiner = normalizedUrl.includes('?') ? '&' : '?';

  return `${baseUrl}${normalizedUrl}${search ? `${queryJoiner}${search}` : ''}`;
}

function shouldNotifyError(method: RequestMethod, options: RequestOptions) {
  if (options.silent) return false;
  return options.notifyOnError ?? method !== 'GET';
}

function notifyFailure(error: PveApiError | Error) {
  if (error instanceof PveApiError) {
    const notifyOptions: QNotifyCreateOptions = {
      type: 'negative',
      message: error.message,
      timeout: 5000,
      multiLine: true,
    };
    const caption = error.details.map((item) => `${item.field}: ${item.message}`).join('\n');

    if (caption) {
      notifyOptions.caption = caption;
    }

    Notify.create(notifyOptions);
    return;
  }

  Notify.create({ type: 'negative', message: error.message || 'Connection error - server offline?' });
}

function createRequestInit(method: RequestMethod, options: RequestOptions, csrfToken: string) {
  const headers: Record<string, string> = {};
  let body: BodyInit | undefined;

  if (csrfToken) {
    headers.CSRFPreventionToken = csrfToken;
  }

  if (method !== 'GET' && options.data !== undefined) {
    if (options.json) {
      headers['Content-Type'] = 'application/json';
      body = JSON.stringify(options.data);
    } else {
      headers['Content-Type'] = 'application/x-www-form-urlencoded';
      body = toFormBody(options.data);
    }
  }

  const requestInit: RequestInit = {
    method,
    headers,
    credentials: 'include',
  };

  if (body !== undefined) {
    requestInit.body = body;
  }

  return requestInit;
}

export async function request<T = unknown>(url: string, options: RequestOptions = {}) {
  const session = useSessionStore();
  const method = options.method || 'GET';
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), options.timeout ?? defaultTimeout);
  const requestInit = createRequestInit(method, options, session.csrfToken);
  requestInit.signal = controller.signal;

  try {
    const response = await fetch(resolveUrl(url, method === 'GET' ? options.params : undefined), requestInit);
    const payload = parseResponseText(await response.text());
    const parsed = parsePveResponse<T>(response, payload);

    if (response.status === 401) {
      session.clearSession();
      window.location.hash = '#/login';
    }

    if (!parsed.success) {
      throw new PveApiError(parsed);
    }

    return parsed.result;
  } catch (error) {
    const requestError = error instanceof PveApiError ? error : new Error(getUnknownErrorMessage(error));

    if (shouldNotifyError(method, options)) {
      notifyFailure(requestError);
    }

    throw requestError;
  } finally {
    window.clearTimeout(timeout);
  }
}
