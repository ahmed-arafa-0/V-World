import type { Request, Response } from 'express';
import type { BackendEnvironment, HealthResponse } from '@veoullas-world/contracts';
import type { SheetGateway } from '../repositories/sheet-gateway.js';
export declare function resolveEnvironment(): BackendEnvironment;
export declare function buildHealthResponse(gateway: SheetGateway | null): Promise<HealthResponse>;
export declare function createHealthHandler(getGateway: () => SheetGateway | null): (_req: Request, res: Response) => Promise<void>;
//# sourceMappingURL=health.d.ts.map