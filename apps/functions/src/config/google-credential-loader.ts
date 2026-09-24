import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { BackendConfigStatus } from '@veoullas-world/contracts';

const CREDENTIAL_FILENAME = 'google-service-account.json';
const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_CONFIG_DIR = path.join(moduleDir, '..', '..', 'config-private');

export interface CredentialLoadResult {
  status: BackendConfigStatus;
  /** Raw parsed credential, for backend-only use. Never forward this to a response body. */
  credential: Record<string, unknown> | null;
}

function hasRequiredFields(
  value: unknown,
): value is { client_email: unknown; private_key: unknown } {
  return (
    typeof value === 'object' && value !== null && 'client_email' in value && 'private_key' in value
  );
}

/**
 * Resolution order: an explicit `configDir` argument (tests only) always
 * wins; otherwise `GOOGLE_SERVICE_ACCOUNT_PATH` — the exact file path a
 * host's secret-file mechanism placed the credential at (e.g. Render's
 * Secret Files, which mount at a path outside this repo, not under
 * `apps/functions/config-private`) — is used verbatim if set; otherwise the
 * original local/Firebase default path.
 */
export function resolveCredentialPath(configDir?: string): string {
  if (configDir !== undefined) return path.join(configDir, CREDENTIAL_FILENAME);
  const override = process.env.GOOGLE_SERVICE_ACCOUNT_PATH?.trim();
  if (override) return override;
  return path.join(DEFAULT_CONFIG_DIR, CREDENTIAL_FILENAME);
}

/**
 * Loads the server-only Google service account credential if present.
 * Missing or malformed credentials never throw and never leak file paths,
 * parse errors, or content — callers get a typed status only.
 */
export function loadGoogleServiceAccount(configDir?: string): CredentialLoadResult {
  const filePath = resolveCredentialPath(configDir);

  if (!existsSync(filePath)) {
    return {
      credential: null,
      status: { googleServiceAccount: { present: false, reason: 'not_configured' } },
    };
  }

  try {
    const raw = readFileSync(filePath, 'utf-8');
    const parsed: unknown = JSON.parse(raw);

    if (!hasRequiredFields(parsed)) {
      return {
        credential: null,
        status: { googleServiceAccount: { present: false, reason: 'invalid_format' } },
      };
    }

    return {
      credential: parsed as Record<string, unknown>,
      status: { googleServiceAccount: { present: true, reason: 'configured' } },
    };
  } catch {
    return {
      credential: null,
      status: { googleServiceAccount: { present: false, reason: 'invalid_format' } },
    };
  }
}
