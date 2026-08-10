export type PveEnvelope<T = unknown> = {
  data?: T;
  success?: boolean;
  message?: string;
  status?: number | string;
  errors?: Record<string, unknown>;
};

export type PveErrorDetail = {
  field: string;
  message: string;
};

export type ParsedResponse<T = unknown> = {
  result: PveEnvelope<T>;
  ok: boolean;
  success: boolean;
  status: number;
  statusText: string;
  htmlStatus: string;
  message: string;
  details: PveErrorDetail[];
};

export class PveApiError<T = unknown> extends Error {
  readonly result: PveEnvelope<T>;
  readonly status: number;
  readonly statusText: string;
  readonly htmlStatus: string;
  readonly details: PveErrorDetail[];

  constructor(parsed: ParsedResponse<T>) {
    super(parsed.message);
    this.name = 'PveApiError';
    this.result = parsed.result;
    this.status = parsed.status;
    this.statusText = parsed.statusText;
    this.htmlStatus = parsed.htmlStatus;
    this.details = parsed.details;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function stringifyValue(value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint')
    return String(value);
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map((item) => stringifyValue(item)).join(', ');
  if (isRecord(value) && typeof value.message === 'string') return value.message;
  return JSON.stringify(value);
}

function toResult(payload: unknown): PveEnvelope {
  if (!isRecord(payload)) {
    return { data: payload, success: true };
  }

  const result: PveEnvelope = { ...payload };

  if (typeof payload.success === 'boolean') {
    result.success = payload.success;
  } else if (typeof payload.success === 'number') {
    result.success = payload.success !== 0;
  }

  if (typeof payload.message === 'string') {
    result.message = payload.message;
  }

  if (typeof payload.status === 'string' || typeof payload.status === 'number') {
    result.status = payload.status;
  }

  if (isRecord(payload.errors)) {
    result.errors = payload.errors;
  }

  return result;
}

export function parseResponseText(text: string) {
  if (!text) return {};

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { message: text, success: false };
  }
}

export function extractErrorDetails(result: PveEnvelope): PveErrorDetail[] {
  if (!isRecord(result.errors)) return [];

  return Object.entries(result.errors).map(([field, message]) => ({
    field,
    message: stringifyValue(message),
  }));
}

export function extractRequestError(result: PveEnvelope, verbose = true) {
  let message = 'Successful';
  const details = extractErrorDetails(result);

  if (!result.success) {
    message = 'Unknown error';

    if (result.message) {
      message = String(result.message);
      if (result.status) {
        message += ` (${String(result.status)})`;
      }
    }
  }

  const detailText =
    verbose && details.length > 0
      ? details.map((detail) => `${detail.field}: ${detail.message}`).join('\n')
      : '';

  return {
    message,
    details,
    htmlStatus: detailText ? `${message}\n${detailText}` : message,
  };
}

export function parsePveResponse<T>(response: Response, payload: unknown): ParsedResponse<T> {
  const result = toResult(payload) as PveEnvelope<T>;
  const apiSuccess = result.success !== false;
  const transportMessage =
    response.status && response.statusText
      ? `Connection error ${response.status}: ${response.statusText}`
      : 'Connection error - server offline?';

  if (!response.ok) {
    const pveError = result.message || result.errors ? extractRequestError(result, true) : null;
    const message = pveError?.message || transportMessage;
    const details = pveError?.details || [];
    return {
      result,
      ok: false,
      success: false,
      status: response.status,
      statusText: response.statusText,
      message,
      details,
      htmlStatus: pveError?.htmlStatus || message,
    };
  }

  if (!apiSuccess) {
    const pveError = extractRequestError(result, true);
    return {
      result,
      ok: true,
      success: false,
      status: response.status,
      statusText: response.statusText,
      message: pveError.message,
      details: pveError.details,
      htmlStatus: pveError.htmlStatus,
    };
  }

  return {
    result,
    ok: true,
    success: true,
    status: response.status,
    statusText: response.statusText,
    message: 'Successful',
    details: [],
    htmlStatus: 'Successful',
  };
}

export function getUnknownErrorMessage(error: unknown) {
  if (error instanceof PveApiError) return error.htmlStatus;
  if (error instanceof DOMException && error.name === 'AbortError')
    return 'Connection error - Timeout.';
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  return 'Connection error - server offline?';
}
