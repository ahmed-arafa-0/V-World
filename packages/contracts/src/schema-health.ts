export type SchemaHealthStatus = 'healthy' | 'warning' | 'error';
export type SchemaHealthSeverity = 'ERROR' | 'WARNING' | 'INFO';

/**
 * Sanitized diagnostic entry. Must never carry values from 02_USERS access
 * fields, 03_SECRETS_DEV plaintext_value, Drive file IDs, or any other
 * private/credential content — only structural metadata and a fixed,
 * value-free message.
 */
export interface SchemaHealthDiagnostic {
  tab: string;
  code: string;
  severity: SchemaHealthSeverity;
  rowIndex?: number;
  rowId?: string;
  column?: string;
  message: string;
}

export interface SchemaHealthTabSummary {
  tab: string;
  found: boolean;
  status: SchemaHealthStatus;
  requiredColumnCount: number;
  actualColumnCount: number;
  errorCount: number;
  warningCount: number;
  infoCount: number;
}

export interface SchemaHealthSummary {
  status: SchemaHealthStatus;
  expectedTabCount: number;
  foundTabCount: number;
  healthyTabCount: number;
  errorCount: number;
  warningCount: number;
  infoCount: number;
  checkedAt: string;
}

export interface SchemaHealthResponse {
  ok: true;
  summary: SchemaHealthSummary;
  tabs: SchemaHealthTabSummary[];
  diagnostics: SchemaHealthDiagnostic[];
  /** Reminder that this endpoint is temporary and unauthenticated until M02. */
  note: string;
}
