import type { HealthResponse } from '@veoullas-world/contracts';

export type HealthCheckResult =
  | { status: 'loading' }
  | { status: 'online'; data: HealthResponse }
  | { status: 'offline'; message: string };

/**
 * Calls the same-origin backend health endpoint. Never reaches Google Sheets,
 * Google Drive, Gemini, or any credential — the backend itself stays silent
 * about those and only reports a typed configuration status.
 */
export async function fetchBackendHealth(): Promise<HealthCheckResult> {
  try {
    const response = await fetch('/api/health');
    if (!response.ok) {
      return { status: 'offline', message: `Backend responded with status ${response.status}` };
    }
    const data = (await response.json()) as HealthResponse;
    return { status: 'online', data };
  } catch {
    return { status: 'offline', message: 'Backend is unreachable' };
  }
}
