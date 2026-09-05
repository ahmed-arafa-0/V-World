import type { Request, Response } from 'express';
import type { SessionKind } from '@veoullas-world/contracts';

/**
 * Two distinct HttpOnly session cookies (owner / Admin). A session ID is
 * never present in a JSON response or request body — this module is the
 * only place that reads or writes it, via the cookie transport.
 */
export const OWNER_SESSION_COOKIE = 'vw_owner_session';
export const ADMIN_SESSION_COOKIE = 'vw_admin_session';

function cookieNameFor(kind: SessionKind): string {
  return kind === 'owner' ? OWNER_SESSION_COOKIE : ADMIN_SESSION_COOKIE;
}

/**
 * Minimal RFC 6265 cookie-header parser (no external dependency). Only used
 * to read our own two session cookies — never trusts any other cookie
 * content as anything but an opaque string.
 */
export function parseCookieHeader(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;

  for (const part of header.split(';')) {
    const eqIndex = part.indexOf('=');
    if (eqIndex === -1) continue;
    const rawKey = part.slice(0, eqIndex).trim();
    const rawValue = part.slice(eqIndex + 1).trim();
    if (!rawKey) continue;
    try {
      out[rawKey] = decodeURIComponent(rawValue);
    } catch {
      out[rawKey] = rawValue;
    }
  }

  return out;
}

export function readSessionCookie(req: Request, kind: SessionKind): string | undefined {
  const cookies = parseCookieHeader(req.headers.cookie);
  const value = cookies[cookieNameFor(kind)];
  return value && value.length > 0 ? value : undefined;
}

export interface CookieEnv {
  /** Adds the `Secure` attribute. Must be true whenever the site is served over HTTPS in production. */
  isProduction: boolean;
}

/**
 * Sets the HttpOnly session cookie for the given kind. `expiresAt` must
 * match the session's absolute expiry exactly — the cookie never outlives
 * the Sheet-authoritative session, and never gets refreshed by a heartbeat.
 */
export function setSessionCookie(
  res: Response,
  kind: SessionKind,
  sessionId: string,
  expiresAt: Date,
  env: CookieEnv,
): void {
  res.cookie(cookieNameFor(kind), sessionId, {
    httpOnly: true,
    sameSite: 'lax',
    secure: env.isProduction,
    path: '/',
    expires: expiresAt,
  });
}

/** Clears the cookie for the given kind only — the other kind's cookie is untouched. */
export function clearSessionCookie(res: Response, kind: SessionKind, env: CookieEnv): void {
  res.clearCookie(cookieNameFor(kind), {
    httpOnly: true,
    sameSite: 'lax',
    secure: env.isProduction,
    path: '/',
  });
}
