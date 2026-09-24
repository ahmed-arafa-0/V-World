export type WorldResult<T> =
  | { status: 'online'; data: T }
  | {
      status: 'offline';
      message: string;
      code?: string;
      retryable: boolean;
      /** The request may have reached the server (timeout / dropped response): the write is unconfirmed. */
      unconfirmed?: boolean;
    };

/** Bounded deadlines: nothing in the world waits on the network without an end. */
export const WORLD_GET_TIMEOUT_MS = 12_000;
export const WORLD_POST_TIMEOUT_MS = 30_000;
const GET_RETRY_DELAYS_MS = [700, 1800];

type Offline = Extract<WorldResult<unknown>, { status: 'offline' }>;

// ---- pending / failure signals (drive the non-blocking "Working…" and failure notices) ----
let pendingActions = 0;
const pendingListeners = new Set<() => void>();
const failureListeners = new Set<(failure: Offline) => void>();
const setPending = (delta: number) => {
  pendingActions = Math.max(0, pendingActions + delta);
  pendingListeners.forEach((l) => l());
};
export const actionPending = {
  subscribe(listener: () => void): () => void {
    pendingListeners.add(listener);
    return () => pendingListeners.delete(listener);
  },
  count: () => pendingActions,
};
/** Retryable / unconfirmed failures of a player action, so the world can say so instead of staying silent. */
export function onActionFailure(listener: (failure: Offline) => void): () => void {
  failureListeners.add(listener);
  return () => failureListeners.delete(listener);
}

async function attempt<T>(
  method: 'GET' | 'POST',
  path: string,
  body: unknown,
  timeoutMs: number,
): Promise<WorldResult<T>> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`/api/world${path}`, {
      method,
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });
    if (!response.ok) {
      let message = `Backend responded with status ${response.status}`;
      let code: string | undefined;
      try {
        const parsed = (await response.json()) as { message?: string; code?: string };
        if (typeof parsed.message === 'string') message = parsed.message;
        code = parsed.code;
      } catch {
        // Not JSON: keep the safe status message.
      }
      return {
        status: 'offline',
        message,
        code,
        retryable: response.status === 429 || response.status >= 500,
        // A 5xx to a write may still have been applied before the failure.
        unconfirmed: method === 'POST' && response.status >= 500,
      };
    }
    return { status: 'online', data: (await response.json()) as T };
  } catch {
    return {
      status: 'offline',
      message: controller.signal.aborted ? 'The request timed out' : 'Backend is unreachable',
      retryable: true,
      unconfirmed: method === 'POST',
    };
  } finally {
    clearTimeout(timer);
  }
}

const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

async function getWithRetry<T>(path: string): Promise<WorldResult<T>> {
  let result = await attempt<T>('GET', path, undefined, WORLD_GET_TIMEOUT_MS);
  for (const wait of GET_RETRY_DELAYS_MS) {
    if (result.status === 'online' || !result.retryable) break;
    await delay(wait);
    result = await attempt<T>('GET', path, undefined, WORLD_GET_TIMEOUT_MS);
  }
  return result;
}

/**
 * A write that is safe to repeat (the server applies it once whatever the number of sends: entering a
 * place, opening a catalog) may be retried a bounded number of times on a transient failure, so the
 * player is not left on a dead screen by a momentary quota answer.
 */
async function postIdempotent<T>(
  path: string,
  body: Record<string, unknown>,
): Promise<WorldResult<T>> {
  let result = await post<T>(path, body);
  for (const wait of GET_RETRY_DELAYS_MS) {
    if (result.status === 'online' || !result.retryable) break;
    await delay(wait);
    result = await post<T>(path, body);
  }
  return result;
}

/** Identical in-flight writes share one request: a double tap can never submit twice. */
const inflightWrites = new Map<string, Promise<WorldResult<unknown>>>();

function post<T>(
  path: string,
  body: Record<string, unknown>,
  handled = false,
): Promise<WorldResult<T>> {
  const key = `${path}|${JSON.stringify(body)}`;
  const existing = inflightWrites.get(key);
  if (existing) return existing as Promise<WorldResult<T>>;
  setPending(1);
  const run = attempt<T>('POST', path, body, WORLD_POST_TIMEOUT_MS)
    .then((result) => {
      if (!handled && result.status === 'offline' && (result.retryable || result.unconfirmed)) {
        failureListeners.forEach((l) => l(result));
      }
      return result;
    })
    .finally(() => {
      inflightWrites.delete(key);
      setPending(-1);
    });
  inflightWrites.set(key, run);
  return run;
}

const withLocale = (path: string, locale?: string) =>
  locale ? `${path}${path.includes('?') ? '&' : '?'}locale=${encodeURIComponent(locale)}` : path;

/** Owner-session-protected world API. Every reward and unlock is decided server-side; nothing here sends a user id or a quantity. */
export const worldApi = {
  /** A single bounded authoritative reconciliation read; the owning view supplies recovery UI. */
  getOnce: <T>(path: string, locale?: string) =>
    attempt<T>('GET', withLocale(path, locale), undefined, WORLD_GET_TIMEOUT_MS),
  postHandled: <T>(path: string, body: Record<string, unknown>, locale?: string) =>
    post<T>(path, locale ? { ...body, locale } : body, true),
  get: <T>(path: string, locale?: string) => getWithRetry<T>(withLocale(path, locale)),
  post: <T>(path: string, body: Record<string, unknown> = {}, locale?: string) =>
    post<T>(path, locale ? { ...body, locale } : body),
  /** Like `post`, for writes the server applies once however often they are sent. */
  postIdempotent: <T>(path: string, body: Record<string, unknown> = {}, locale?: string) =>
    postIdempotent<T>(path, locale ? { ...body, locale } : body),
};

const PENDING_KEY = (userId: string) =>
  `vw_pending_journey_complete_v1:${encodeURIComponent(userId)}`;

/**
 * If the Sheet write for the final Map unlock is temporarily unavailable, the
 * completion is remembered on this device so the player is never trapped in the
 * introduction; the world retries it against the backend until it succeeds.
 */
export const pendingCompletion = {
  has(userId: string): boolean {
    try {
      return window.localStorage.getItem(PENDING_KEY(userId)) === '1';
    } catch {
      return false;
    }
  },
  set(userId: string): void {
    try {
      window.localStorage.setItem(PENDING_KEY(userId), '1');
    } catch {
      // Storage may be blocked; the retry then simply relies on the backend state.
    }
  },
  clear(userId: string): void {
    try {
      window.localStorage.removeItem(PENDING_KEY(userId));
    } catch {
      // ignore
    }
  },
};
