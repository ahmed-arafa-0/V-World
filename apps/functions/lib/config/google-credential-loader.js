import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const CREDENTIAL_FILENAME = 'google-service-account.json';
const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_CONFIG_DIR = path.join(moduleDir, '..', '..', 'config-private');
function hasRequiredFields(value) {
    return (typeof value === 'object' && value !== null && 'client_email' in value && 'private_key' in value);
}
export function resolveCredentialPath(configDir = DEFAULT_CONFIG_DIR) {
    return path.join(configDir, CREDENTIAL_FILENAME);
}
/**
 * Loads the server-only Google service account credential if present.
 * Missing or malformed credentials never throw and never leak file paths,
 * parse errors, or content — callers get a typed status only.
 */
export function loadGoogleServiceAccount(configDir) {
    const filePath = resolveCredentialPath(configDir);
    if (!existsSync(filePath)) {
        return {
            credential: null,
            status: { googleServiceAccount: { present: false, reason: 'not_configured' } },
        };
    }
    try {
        const raw = readFileSync(filePath, 'utf-8');
        const parsed = JSON.parse(raw);
        if (!hasRequiredFields(parsed)) {
            return {
                credential: null,
                status: { googleServiceAccount: { present: false, reason: 'invalid_format' } },
            };
        }
        return {
            credential: parsed,
            status: { googleServiceAccount: { present: true, reason: 'configured' } },
        };
    }
    catch {
        return {
            credential: null,
            status: { googleServiceAccount: { present: false, reason: 'invalid_format' } },
        };
    }
}
//# sourceMappingURL=google-credential-loader.js.map