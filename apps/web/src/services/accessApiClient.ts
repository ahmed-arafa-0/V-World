/**
 * Low-level same-origin JSON transport for the M02 access/session API.
 * Session identity travels only in the HttpOnly cookie the backend sets —
 * this client never reads, stores, or forwards a session ID or cookie
 * value itself; `credentials: 'same-origin'` just lets the browser attach
 * whatever cookie already exists and honor `Set-Cookie` on the response.
 */

export interface NetworkFailure {
  ok: false;
  code: 'NETWORK_ERROR';
  message: string;
}

export type ClientResult<T> = T | NetworkFailure;

export function isNetworkFailure<T>(result: ClientResult<T>): result is NetworkFailure {
  return (
    typeof result === 'object' &&
    result !== null &&
    'code' in result &&
    (result as { code?: unknown }).code === 'NETWORK_ERROR'
  );
}

async function request<T>(method: string, url: string, body?: unknown): Promise<ClientResult<T>> {
  try {
    const response = await fetch(url, {
      method,
      credentials: 'same-origin',
      headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    return (await response.json()) as T;
  } catch {
    return { ok: false, code: 'NETWORK_ERROR', message: 'Network error. Please try again.' };
  }
}

export function postJson<T>(url: string, body: unknown): Promise<ClientResult<T>> {
  return request<T>('POST', url, body);
}

export function getJson<T>(url: string): Promise<ClientResult<T>> {
  return request<T>('GET', url);
}

export function deleteJson<T>(url: string): Promise<ClientResult<T>> {
  return request<T>('DELETE', url);
}
