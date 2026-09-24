import type { NextFunction, Request, Response } from 'express';
import type { ApiError } from '@veoullas-world/contracts';

/**
 * Server-side development-environment boundary for backend-only preview
 * capabilities (currently: the Phase 1 item B developer map-composition
 * preview). Responds with the exact same generic `404` shape the app's
 * catch-all not-found handler uses — indistinguishable from "this route
 * does not exist" — for any environment other than `local`/`emulator`, so a
 * production or staging deployment never reveals that a development-only
 * capability exists at all, regardless of frontend session state or
 * routing. This check runs BEFORE any authentication check on the routes it
 * guards, so it never leaks "you'd need to log in" information either.
 *
 * `isDevelopmentEnvironment` is injected (never reads `process.env`
 * directly here) so tests can exercise both branches deterministically
 * without mutating global environment state.
 */
export function createDevelopmentOnlyMiddleware(isDevelopmentEnvironment: () => boolean) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!isDevelopmentEnvironment()) {
      const notFound: ApiError = {
        ok: false,
        code: 'not_found',
        message: `No route for ${req.method} ${req.path}`,
      };
      res.status(404).json(notFound);
      return;
    }
    next();
  };
}
