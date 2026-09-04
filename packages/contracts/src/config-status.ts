/**
 * Backend-only, credential-free summary of whether server-side Google
 * configuration is present. Never carries credential contents, key material,
 * or raw provider error text — only a typed reason code the frontend can
 * safely render.
 */
export type BackendConfigReason = 'not_configured' | 'configured' | 'invalid_format';

export interface BackendConfigStatus {
  googleServiceAccount: {
    present: boolean;
    reason: BackendConfigReason;
  };
}
