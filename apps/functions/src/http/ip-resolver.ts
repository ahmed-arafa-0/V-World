import type { Request } from 'express';

/**
 * Server-observed request IP only. Never reads a client-supplied `ip`,
 * `ip_address`, or forwarded-value field from the request body or query
 * string — those are always ignored. Relies entirely on Express's own
 * `X-Forwarded-For` handling, which requires `app.set('trust proxy', ...)`
 * to be configured deliberately once in app.ts for the Firebase
 * Hosting/Cloud Functions proxy layer; without it, `req.ip` falls back to
 * the direct socket address, which is exactly what a local/emulator
 * connection has.
 */
export function resolveObservedIp(req: Request): string {
  return req.ip || req.socket.remoteAddress || 'unknown';
}
