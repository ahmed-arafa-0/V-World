import type { SchemaHealthResponse } from '@veoullas-world/contracts';
import { fetchJson, type ApiFetchResult } from './apiClient';

export type SchemaHealthResult = ApiFetchResult<SchemaHealthResponse>;

export function fetchSchemaHealth(options?: { refresh?: boolean }): Promise<SchemaHealthResult> {
  const url = options?.refresh ? '/api/admin/schema-health?refresh=1' : '/api/admin/schema-health';
  return fetchJson<SchemaHealthResponse>(url);
}
