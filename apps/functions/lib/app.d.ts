import { type Express } from 'express';
import type { SheetGateway } from './repositories/sheet-gateway.js';
export interface CreateAppOptions {
    /** Defaults to the real, credential-backed production gateway (or null when unconfigured). */
    getGateway?: () => SheetGateway | null;
}
export declare function createApp(options?: CreateAppOptions): Express;
//# sourceMappingURL=app.d.ts.map