import { loadGoogleServiceAccount } from '../config/google-credential-loader.js';
import { computeSchemaHealth } from '../services/schema-health.service.js';
const MILESTONE = 'M01';
export function resolveEnvironment() {
    if (process.env.FUNCTIONS_EMULATOR === 'true') {
        return 'emulator';
    }
    if (process.env.NODE_ENV === 'production') {
        return 'production';
    }
    return 'local';
}
export async function buildHealthResponse(gateway) {
    const { status } = loadGoogleServiceAccount();
    let sheetsReachable = false;
    let schemaHealth = {
        status: 'error',
        errorCount: 0,
        warningCount: 0,
    };
    let cache = { entryCount: 0, ttlSeconds: 60 };
    if (gateway) {
        try {
            await gateway.getMetadata();
            sheetsReachable = true;
        }
        catch {
            sheetsReachable = false;
        }
        if (sheetsReachable) {
            try {
                const health = await computeSchemaHealth(gateway);
                schemaHealth = {
                    status: health.summary.status,
                    errorCount: health.summary.errorCount,
                    warningCount: health.summary.warningCount,
                };
            }
            catch {
                schemaHealth = { status: 'error', errorCount: 1, warningCount: 0 };
            }
        }
        cache = { entryCount: gateway.cacheEntryCount, ttlSeconds: gateway.ttlSeconds };
    }
    return {
        ok: true,
        service: 'veoullas-world-functions',
        environment: resolveEnvironment(),
        timestamp: new Date().toISOString(),
        milestone: MILESTONE,
        config: status,
        sheets: { reachable: sheetsReachable },
        schemaHealth,
        cache,
    };
}
export function createHealthHandler(getGateway) {
    return async (_req, res) => {
        const response = await buildHealthResponse(getGateway());
        res.status(200).json(response);
    };
}
//# sourceMappingURL=health.js.map