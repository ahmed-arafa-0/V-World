import type { BackendConfigStatus } from '@veoullas-world/contracts';
export interface CredentialLoadResult {
    status: BackendConfigStatus;
    /** Raw parsed credential, for backend-only use. Never forward this to a response body. */
    credential: Record<string, unknown> | null;
}
export declare function resolveCredentialPath(configDir?: string): string;
/**
 * Loads the server-only Google service account credential if present.
 * Missing or malformed credentials never throw and never leak file paths,
 * parse errors, or content — callers get a typed status only.
 */
export declare function loadGoogleServiceAccount(configDir?: string): CredentialLoadResult;
//# sourceMappingURL=google-credential-loader.d.ts.map