import { headers } from 'next/headers';

// The API has no public route: only this server reaches it, over the internal Docker network.
const apiBase = process.env.API_INTERNAL_URL ?? 'http://api:8080';

export interface ApiErrorBody {
  error: string;
  fields?: Record<string, string>;
  retryAfter?: number;
  email?: string;
}

export type ApiResult<T> =
  { ok: true; status: number; data: T } | { ok: false; status: number; body: ApiErrorBody };

interface ApiRequest {
  method?: 'GET' | 'POST';
  body?: unknown;
  token?: string;
}

async function clientAddress(): Promise<string> {
  const incoming = await headers();
  // The edge proxy overwrites X-Real-IP with the address it saw, so it cannot be spoofed
  // by the browser; X-Forwarded-For is only a fallback for local development.
  return (
    incoming.get('x-real-ip') ?? incoming.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown'
  );
}

// Axum answers malformed bodies with a plain-text rejection, not the JSON error shape.
async function readJson(response: Response): Promise<unknown> {
  const text = await response.text();
  try {
    return text ? (JSON.parse(text) as unknown) : null;
  } catch {
    return null;
  }
}

export async function callApi<T>(path: string, request: ApiRequest = {}): Promise<ApiResult<T>> {
  const requestHeaders: Record<string, string> = { 'x-client-ip': await clientAddress() };
  if (request.body !== undefined) requestHeaders['content-type'] = 'application/json';
  if (request.token) requestHeaders.authorization = `Bearer ${request.token}`;

  let response: Response;
  try {
    response = await fetch(`${apiBase}${path}`, {
      method: request.method ?? 'GET',
      headers: requestHeaders,
      body: request.body === undefined ? undefined : JSON.stringify(request.body),
      cache: 'no-store',
    });
  } catch {
    return { ok: false, status: 503, body: { error: 'unavailable' } };
  }

  const parsed = await readJson(response);
  if (response.ok) {
    return { ok: true, status: response.status, data: parsed as T };
  }
  const body =
    parsed && typeof parsed === 'object' && 'error' in parsed
      ? (parsed as ApiErrorBody)
      : { error: response.status >= 500 ? 'unavailable' : 'invalid_input' };
  return { ok: false, status: response.status, body };
}
