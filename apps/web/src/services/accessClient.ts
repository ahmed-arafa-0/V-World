import type {
  AdminLoginRequest,
  AdminLoginResult,
  GateLoginRequest,
  GateLoginResult,
  PageOpenEvent,
  PageOpenResult,
  SessionHeartbeatResult,
  SessionKind,
  SessionLogoutResult,
  SessionResumeResult,
} from '@veoullas-world/contracts';
import { deleteJson, getJson, postJson, type ClientResult } from './accessApiClient';

export function pageOpen(payload: PageOpenEvent): Promise<ClientResult<PageOpenResult>> {
  return postJson('/api/access/page-open', payload);
}

export function gateLogin(payload: GateLoginRequest): Promise<ClientResult<GateLoginResult>> {
  return postJson('/api/auth/gate', payload);
}

export function adminLogin(payload: AdminLoginRequest): Promise<ClientResult<AdminLoginResult>> {
  return postJson('/api/auth/admin', payload);
}

function sessionPath(kind: SessionKind): string {
  return kind === 'owner' ? '/api/session/owner' : '/api/session/admin';
}

export function resumeSession(
  kind: SessionKind,
  resumeOperationId: string,
): Promise<ClientResult<SessionResumeResult>> {
  const url = `${sessionPath(kind)}?resumeOperationId=${encodeURIComponent(resumeOperationId)}`;
  return getJson(url);
}

export function heartbeatSession(kind: SessionKind): Promise<ClientResult<SessionHeartbeatResult>> {
  return postJson(`${sessionPath(kind)}/heartbeat`, {});
}

export function logoutSession(kind: SessionKind): Promise<ClientResult<SessionLogoutResult>> {
  return deleteJson(sessionPath(kind));
}
