import { describe, expect, it, vi } from 'vitest';
import {
  ADMIN_SESSION_COOKIE,
  clearSessionCookie,
  OWNER_SESSION_COOKIE,
  parseCookieHeader,
  readSessionCookie,
  setSessionCookie,
} from '../src/http/cookies.js';

function fakeReq(cookieHeader: string | undefined) {
  return { headers: { cookie: cookieHeader } } as unknown as Parameters<
    typeof readSessionCookie
  >[0];
}

function fakeRes() {
  return {
    cookie: vi.fn(),
    clearCookie: vi.fn(),
  } as unknown as Parameters<typeof setSessionCookie>[0] & {
    cookie: ReturnType<typeof vi.fn>;
    clearCookie: ReturnType<typeof vi.fn>;
  };
}

describe('parseCookieHeader', () => {
  it('returns an empty object for an undefined header', () => {
    expect(parseCookieHeader(undefined)).toEqual({});
  });

  it('parses multiple cookies separated by "; "', () => {
    expect(parseCookieHeader('a=1; b=2; c=3')).toEqual({ a: '1', b: '2', c: '3' });
  });

  it('URL-decodes values', () => {
    expect(parseCookieHeader('x=hello%20world')).toEqual({ x: 'hello world' });
  });

  it('ignores malformed segments without a "="', () => {
    expect(parseCookieHeader('a=1; garbage; b=2')).toEqual({ a: '1', b: '2' });
  });
});

describe('readSessionCookie', () => {
  it('reads the owner cookie by its distinct name', () => {
    const req = fakeReq(`${OWNER_SESSION_COOKIE}=sess_gate_abc`);
    expect(readSessionCookie(req, 'owner')).toBe('sess_gate_abc');
  });

  it('reads the admin cookie by its distinct name', () => {
    const req = fakeReq(`${ADMIN_SESSION_COOKIE}=sess_admin_xyz`);
    expect(readSessionCookie(req, 'admin')).toBe('sess_admin_xyz');
  });

  it('owner and admin cookies coexist without interfering with each other', () => {
    const req = fakeReq(
      `${OWNER_SESSION_COOKIE}=sess_gate_a; ${ADMIN_SESSION_COOKIE}=sess_admin_b`,
    );
    expect(readSessionCookie(req, 'owner')).toBe('sess_gate_a');
    expect(readSessionCookie(req, 'admin')).toBe('sess_admin_b');
  });

  it('returns undefined when the requested cookie is absent', () => {
    const req = fakeReq(`${ADMIN_SESSION_COOKIE}=sess_admin_b`);
    expect(readSessionCookie(req, 'owner')).toBeUndefined();
  });

  it('returns undefined with no Cookie header at all', () => {
    expect(readSessionCookie(fakeReq(undefined), 'owner')).toBeUndefined();
  });
});

describe('setSessionCookie', () => {
  it('sets the owner cookie as HttpOnly, SameSite=Lax, Path=/, with a matching Expires', () => {
    const res = fakeRes();
    const expiresAt = new Date('2026-01-02T00:00:00.000Z');
    setSessionCookie(res, 'owner', 'sess_gate_abc', expiresAt, { isProduction: false });

    expect(res.cookie).toHaveBeenCalledWith(
      OWNER_SESSION_COOKIE,
      'sess_gate_abc',
      expect.objectContaining({
        httpOnly: true,
        sameSite: 'lax',
        secure: false,
        path: '/',
        expires: expiresAt,
      }),
    );
  });

  it('sets Secure=true in production and Secure=false off of production (localhost/emulator compatible)', () => {
    const resProd = fakeRes();
    setSessionCookie(resProd, 'admin', 'sess_admin_xyz', new Date(), { isProduction: true });
    expect(resProd.cookie).toHaveBeenCalledWith(
      ADMIN_SESSION_COOKIE,
      'sess_admin_xyz',
      expect.objectContaining({ secure: true }),
    );

    const resLocal = fakeRes();
    setSessionCookie(resLocal, 'admin', 'sess_admin_xyz', new Date(), { isProduction: false });
    expect(resLocal.cookie).toHaveBeenCalledWith(
      ADMIN_SESSION_COOKIE,
      'sess_admin_xyz',
      expect.objectContaining({ secure: false }),
    );
  });

  it('uses distinct cookie names for owner vs admin', () => {
    const res = fakeRes();
    setSessionCookie(res, 'owner', 'a', new Date(), { isProduction: false });
    setSessionCookie(res, 'admin', 'b', new Date(), { isProduction: false });
    const names = res.cookie.mock.calls.map((call: unknown[]) => call[0]);
    expect(names).toEqual([OWNER_SESSION_COOKIE, ADMIN_SESSION_COOKIE]);
  });
});

describe('clearSessionCookie', () => {
  it('clears only the requested kind, with matching attributes to the one that set it', () => {
    const res = fakeRes();
    clearSessionCookie(res, 'owner', { isProduction: true });
    expect(res.clearCookie).toHaveBeenCalledWith(
      OWNER_SESSION_COOKIE,
      expect.objectContaining({ httpOnly: true, sameSite: 'lax', secure: true, path: '/' }),
    );
    expect(res.clearCookie).not.toHaveBeenCalledWith(ADMIN_SESSION_COOKIE, expect.anything());
  });
});
