export type ApiFetchResult<T> =
  { status: 'loading' } | { status: 'online'; data: T } | { status: 'offline'; message: string };

/**
 * Calls a same-origin backend endpoint. Never reaches Google Sheets, Google
 * Drive, Gemini, or any credential directly — the backend stays in between
 * and only ever returns sanitized, typed JSON.
 */
export async function fetchJson<T>(url: string): Promise<ApiFetchResult<T>> {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      let message = `Backend responded with status ${response.status}`;
      try {
        const body: unknown = await response.json();
        if (
          body &&
          typeof body === 'object' &&
          'message' in body &&
          typeof body.message === 'string'
        ) {
          message = body.message;
        }
      } catch {
        // Response wasn't JSON; keep the generic status message.
      }
      return { status: 'offline', message };
    }
    const data = (await response.json()) as T;
    return { status: 'online', data };
  } catch {
    return { status: 'offline', message: 'Backend is unreachable' };
  }
}
