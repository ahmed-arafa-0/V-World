import type { Request, Response } from 'express';
import type { BackendEnvironment, HealthResponse } from '@veoullas-world/contracts';
export declare function resolveEnvironment(): BackendEnvironment;
export declare function buildHealthResponse(): HealthResponse;
export declare function healthHandler(_req: Request, res: Response): void;
//# sourceMappingURL=health.d.ts.map