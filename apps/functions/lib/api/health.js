import { loadGoogleServiceAccount } from '../config/google-credential-loader.js';
const MILESTONE = 'M00';
export function resolveEnvironment() {
    if (process.env.FUNCTIONS_EMULATOR === 'true') {
        return 'emulator';
    }
    if (process.env.NODE_ENV === 'production') {
        return 'production';
    }
    return 'local';
}
export function buildHealthResponse() {
    const { status } = loadGoogleServiceAccount();
    return {
        ok: true,
        service: 'veoullas-world-functions',
        environment: resolveEnvironment(),
        timestamp: new Date().toISOString(),
        milestone: MILESTONE,
        config: status,
    };
}
export function healthHandler(_req, res) {
    res.status(200).json(buildHealthResponse());
}
//# sourceMappingURL=health.js.map