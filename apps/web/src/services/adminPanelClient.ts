import type {
  AdminDashboardResponse,
  AdminLogQuery,
  AdminLogsResponse,
  AdminPlayerInspectResponse,
} from '@veoullas-world/contracts';
import { fetchJson, type ApiFetchResult } from './apiClient';

export function fetchAdminDashboard(): Promise<ApiFetchResult<AdminDashboardResponse>> {
  return fetchJson<AdminDashboardResponse>('/api/admin/dashboard');
}

export function fetchAdminLogs(
  query: AdminLogQuery = {},
): Promise<ApiFetchResult<AdminLogsResponse>> {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== '') params.set(key, String(value));
  }
  const qs = params.toString();
  return fetchJson<AdminLogsResponse>(`/api/admin/logs${qs ? `?${qs}` : ''}`);
}

export function fetchAdminPlayer(
  userId: string,
): Promise<ApiFetchResult<AdminPlayerInspectResponse>> {
  return fetchJson<AdminPlayerInspectResponse>(`/api/admin/players/${encodeURIComponent(userId)}`);
}
