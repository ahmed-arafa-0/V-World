import { Router, type Request, type RequestHandler, type Response } from 'express';
import { SUPPORTED_LOCALES, type ApiError } from '@veoullas-world/contracts';
import { AppError, toSafeApiError } from '../errors/app-error.js';
import type { KeyMutex } from '../repositories/key-mutex.js';
import type { SheetGateway } from '../repositories/sheet-gateway.js';
import type { WorldCtx } from '../world/common.js';
import {
  addCandle,
  answerQuiz,
  enterChurch,
  getChurchState,
  extinguishCandle,
  lightCandle,
  openStory,
  removeCandle,
} from '../world/church.js';
import { claimBeachSignature } from '../world/beach.js';
import {
  enterArcade,
  getArcadeState,
  recordAttempt,
  unlockCabinet,
  recoverArcadeIntroReward,
} from '../world/arcade.js';
import { getTriviaQuestions, submitTriviaAnswer } from '../world/arcade-trivia.js';
import { resolveCompanionHint } from '../world/companion-hints.service.js';
import {
  getCafeState,
  openGramophone,
  readSongCard,
  requestSong,
  setWalkmanSelection,
} from '../world/cafe.js';
import {
  deliverDueMessages,
  deliverFirstMessage,
  enterCottage,
  getCottageState,
  openMessage,
  setDecor,
  translateMessage,
} from '../world/cottage.js';
import { enterFarm, getFarmState, harvestPlot, plantSeed, waterPlot } from '../world/farm.js';
import {
  getMapState,
  getMuseumState,
  solveFinalRoadPuzzle,
  travelOnMap,
  verifyEntrance,
  viewArtifact,
  viewExhibit,
} from '../world/museum.js';
import {
  acknowledgeInteraction,
  chooseReplay,
  completeFirstJourney,
  getJourneyState,
  syncJourney,
} from '../world/journey.js';
import {
  acceptInvitation,
  claimGifts,
  completeCelebration,
  dismissInvitation,
  extinguishCandle as extinguishBirthdayCandle,
  getBirthdayState,
  saveWish as saveBirthdayWish,
} from '../world/birthday.js';

export interface WorldRouterDeps {
  getGateway: () => SheetGateway | null;
  mutex: KeyMutex;
  now: () => Date;
  weather?: import('../world/weather.js').WeatherProvider;
  /**
   * birthday_2026 (M16 narrow scope) dev-preview seam: when set, only the `/birthday/*` routes below
   * use this clock instead of `now`. Every other world route (journey, church, cafe, farm, ...) always
   * uses `now` unchanged — this is deliberately event-scoped, never a general server-clock override.
   * Defaults to `now` when not supplied (production `createApp()` wires a dev-only-gated version;
   * nothing else needs to pass this).
   */
  birthdayNow?: (userId: string) => Date;
}

const ID_PATTERN = /^[A-Za-z0-9_.:-]{1,80}$/;

export function requireId(value: unknown, field: string): string {
  if (typeof value !== 'string' || !ID_PATTERN.test(value)) {
    throw new AppError('invalid_request', `A valid ${field} is required.`);
  }
  return value;
}

export function localeOf(req: Request): string {
  const raw = (req.query.locale ??
    (req.body as { locale?: unknown } | undefined)?.locale) as unknown;
  return typeof raw === 'string' && (SUPPORTED_LOCALES as readonly string[]).includes(raw)
    ? raw
    : 'en';
}

export function sendWorldError(res: Response, err: unknown): void {
  const { code, message, httpStatus } = toSafeApiError(err);
  const error: ApiError = { ok: false, code, message };
  res.status(httpStatus).json(error);
}

/** Builds the per-request context from the resolved owner session — never from client input. */
export function contextFor(deps: WorldRouterDeps, res: Response): WorldCtx {
  const gateway = deps.getGateway();
  if (!gateway) {
    throw new AppError('backend_not_configured', 'Google Sheets backend is not configured.');
  }
  const userId = res.locals.ownerUserId;
  if (typeof userId !== 'string' || userId.length === 0) {
    throw new AppError('backend_not_configured', 'No authenticated owner user was resolved.');
  }
  return { gateway, mutex: deps.mutex, userId, now: deps.now(), weather: deps.weather };
}

/** Wraps a handler so it gets a session-scoped context and safe error mapping. */
export function worldHandler(
  deps: WorldRouterDeps,
  fn: (ctx: WorldCtx, req: Request) => Promise<unknown>,
): RequestHandler {
  return async (req, res) => {
    try {
      const body = await fn(contextFor(deps, res), req);
      res.status(200).json(body);
    } catch (err) {
      sendWorldError(res, err);
    }
  };
}

/** Same as `worldHandler`, but `ctx.now` comes from `deps.birthdayNow` (falling back to `deps.now`
 * when not supplied) — used only by the `/birthday/*` routes below, see `WorldRouterDeps.birthdayNow`. */
function birthdayWorldHandler(
  deps: WorldRouterDeps,
  fn: (ctx: WorldCtx, req: Request) => Promise<unknown>,
): RequestHandler {
  return async (req, res) => {
    try {
      const base = contextFor(deps, res);
      const ctx = { ...base, now: deps.birthdayNow?.(base.userId) ?? deps.now() };
      const body = await fn(ctx, req);
      res.status(200).json(body);
    } catch (err) {
      sendWorldError(res, err);
    }
  };
}

/**
 * Owner-session-protected world API (M08–M14). Mounted behind `requireOwner`,
 * so every handler sees `res.locals.ownerUserId` from the resolved session.
 * Rewards are decided server-side from the Sheet; no request carries a key
 * quantity, a user id, or a "correct answer".
 */
export function createWorldRouter(
  deps: WorldRouterDeps,
  extend?: (router: Router) => void,
): Router {
  const router = Router();

  router.get(
    '/journey',
    worldHandler(deps, (ctx) => getJourneyState(ctx)),
  );
  router.post(
    '/arcade/recover-intro-reward',
    worldHandler(deps, async (ctx) => ({
      ok: true,
      reward: await recoverArcadeIntroReward(ctx),
    })),
  );
  router.post(
    '/journey/sync',
    worldHandler(deps, (ctx) => syncJourney(ctx)),
  );
  router.post(
    '/journey/ack',
    worldHandler(deps, (ctx, req) =>
      acknowledgeInteraction(
        ctx,
        requireId((req.body as { interactionId?: unknown }).interactionId, 'interactionId'),
      ),
    ),
  );
  router.post(
    '/journey/replay',
    worldHandler(deps, (ctx, req) => {
      const action = (req.body as { action?: unknown }).action;
      if (action !== 'start' && action !== 'skip') {
        throw new AppError('invalid_request', 'action must be "start" or "skip".');
      }
      return chooseReplay(ctx, action);
    }),
  );
  router.post(
    '/journey/complete',
    worldHandler(deps, (ctx) => completeFirstJourney(ctx)),
  );

  router.get(
    '/church',
    worldHandler(deps, (ctx, req) => getChurchState(ctx, localeOf(req), req.query.fresh === '1')),
  );
  router.post(
    '/church/enter',
    worldHandler(deps, (ctx, req) => enterChurch(ctx, localeOf(req))),
  );
  router.post(
    '/church/candle',
    worldHandler(deps, (ctx, req) =>
      lightCandle(
        ctx,
        requireId((req.body as { candleId?: unknown }).candleId, 'candleId'),
        localeOf(req),
      ),
    ),
  );
  router.post(
    '/church/candle/extinguish',
    worldHandler(deps, (ctx, req) =>
      extinguishCandle(
        ctx,
        requireId((req.body as { candleId?: unknown }).candleId, 'candleId'),
        localeOf(req),
      ),
    ),
  );
  router.post(
    '/church/candle/add',
    worldHandler(deps, (ctx, req) =>
      addCandle(
        ctx,
        requireId((req.body as { clientRequestId?: unknown }).clientRequestId, 'clientRequestId'),
        localeOf(req),
      ),
    ),
  );
  router.post(
    '/church/candle/remove',
    worldHandler(deps, (ctx, req) =>
      removeCandle(
        ctx,
        requireId((req.body as { candleId?: unknown }).candleId, 'candleId'),
        localeOf(req),
      ),
    ),
  );
  router.post(
    '/church/story/open',
    worldHandler(deps, (ctx, req) =>
      openStory(
        ctx,
        requireId((req.body as { contentId?: unknown }).contentId, 'contentId'),
        localeOf(req),
      ),
    ),
  );
  router.post(
    '/church/quiz/answer',
    worldHandler(deps, (ctx, req) => {
      const body = req.body as { questionId?: unknown; answer?: unknown };
      return answerQuiz(
        ctx,
        requireId(body.questionId, 'questionId'),
        requireId(body.answer, 'answer'),
        localeOf(req),
      );
    }),
  );

  const body = (req: Request) => (req.body ?? {}) as Record<string, unknown>;

  // Beach signature (shell): the server decides eligibility, reward and idempotency.
  router.post(
    '/beach/shell',
    worldHandler(deps, (ctx) => claimBeachSignature(ctx)),
  );

  // M09 Vinyl Café + Walkman
  router.get(
    '/cafe',
    worldHandler(deps, (ctx, req) => getCafeState(ctx, localeOf(req))),
  );
  router.post(
    '/cafe/gramophone',
    worldHandler(deps, (ctx, req) => openGramophone(ctx, localeOf(req))),
  );
  router.post(
    '/cafe/card',
    worldHandler(deps, (ctx, req) =>
      readSongCard(ctx, requireId(body(req).songId, 'songId'), localeOf(req)),
    ),
  );
  router.post(
    '/cafe/request',
    worldHandler(deps, (ctx, req) => {
      const text = body(req).text;
      if (typeof text !== 'string')
        throw new AppError('invalid_request', 'A request text is required.');
      return requestSong(
        ctx,
        { text, clientRequestId: requireId(body(req).clientRequestId, 'clientRequestId') },
        localeOf(req),
      );
    }),
  );
  router.post(
    '/walkman',
    worldHandler(deps, (ctx, req) => {
      const songId = body(req).songId;
      const selection =
        songId === null || songId === undefined
          ? null
          : { songId: requireId(songId, 'songId'), playing: body(req).playing === true };
      return setWalkmanSelection(ctx, selection, localeOf(req));
    }),
  );

  // M10 VARcade
  router.get(
    '/arcade',
    worldHandler(deps, (ctx) => getArcadeState(ctx)),
  );
  router.post(
    '/arcade/enter',
    worldHandler(deps, (ctx) => enterArcade(ctx)),
  );
  router.post(
    '/arcade/unlock',
    worldHandler(deps, (ctx, req) => unlockCabinet(ctx, requireId(body(req).gameId, 'gameId'))),
  );
  router.post(
    '/arcade/attempt',
    worldHandler(deps, (ctx, req) => {
      const b = body(req);
      return recordAttempt(ctx, {
        gameId: requireId(b.gameId, 'gameId'),
        clientAttemptId: requireId(b.clientAttemptId, 'clientAttemptId'),
        score: typeof b.score === 'number' ? b.score : Number.NaN,
        result: b.result as 'win' | 'lose',
      });
    }),
  );
  router.post(
    '/arcade/trivia/questions',
    worldHandler(deps, (ctx, req) =>
      getTriviaQuestions(ctx, requireId(body(req).gameId, 'gameId'), localeOf(req)),
    ),
  );
  router.post(
    '/arcade/trivia/answer',
    worldHandler(deps, (ctx, req) => {
      const b = body(req);
      return submitTriviaAnswer(
        ctx,
        requireId(b.gameId, 'gameId'),
        requireId(b.questionId, 'questionId'),
        requireId(b.selectedAnswer, 'selectedAnswer'),
        localeOf(req),
      );
    }),
  );

  // M11 Cottage, Mailbox, Marcelino
  router.get(
    '/cottage',
    worldHandler(deps, (ctx) => getCottageState(ctx)),
  );
  router.post(
    '/cottage/enter',
    worldHandler(deps, (ctx) => enterCottage(ctx)),
  );
  router.post(
    '/mailbox/deliver',
    worldHandler(deps, async (ctx) => {
      const delivered = await deliverDueMessages(ctx);
      return { ok: true, delivered: delivered.length, state: await getCottageState(ctx) };
    }),
  );
  router.post(
    '/marcelino/first-delivery',
    worldHandler(deps, (ctx) => deliverFirstMessage(ctx)),
  );
  router.post(
    '/mailbox/open',
    worldHandler(deps, (ctx, req) => openMessage(ctx, requireId(body(req).messageId, 'messageId'))),
  );
  router.post(
    '/mailbox/translate',
    worldHandler(deps, (ctx, req) => {
      const locale = body(req).targetLocale;
      if (
        typeof locale !== 'string' ||
        !(SUPPORTED_LOCALES as readonly string[]).includes(locale)
      ) {
        throw new AppError('invalid_request', 'A supported targetLocale is required.');
      }
      return translateMessage(ctx, requireId(body(req).messageId, 'messageId'), locale);
    }),
  );
  router.post(
    '/cottage/decor',
    worldHandler(deps, (ctx, req) => {
      const cropId = body(req).cropId;
      return setDecor(
        ctx,
        requireId(body(req).slotId, 'slotId'),
        cropId === null || cropId === undefined ? null : requireId(cropId, 'cropId'),
      );
    }),
  );

  // M12 Sunberry Fields
  router.get(
    '/farm',
    worldHandler(deps, (ctx) => getFarmState(ctx)),
  );
  router.post(
    '/farm/enter',
    worldHandler(deps, (ctx) => enterFarm(ctx)),
  );
  router.post(
    '/farm/plant',
    worldHandler(deps, (ctx, req) =>
      plantSeed(ctx, requireId(body(req).plotId, 'plotId'), requireId(body(req).cropId, 'cropId')),
    ),
  );
  router.post(
    '/farm/water',
    worldHandler(deps, (ctx, req) => waterPlot(ctx, requireId(body(req).plotId, 'plotId'))),
  );
  router.post(
    '/farm/harvest',
    worldHandler(deps, (ctx, req) => harvestPlot(ctx, requireId(body(req).plotId, 'plotId'))),
  );

  // M13 The Everkeep
  router.get(
    '/museum',
    worldHandler(deps, (ctx) => getMuseumState(ctx)),
  );
  router.post(
    '/museum/puzzle',
    worldHandler(deps, (ctx, req) => {
      const ids = body(req).keyTypeIds;
      if (!Array.isArray(ids) || ids.length > 20)
        throw new AppError('invalid_request', 'keyTypeIds is required.');
      return solveFinalRoadPuzzle(
        ctx,
        ids.map((id) => requireId(id, 'keyTypeId')),
      );
    }),
  );
  router.post(
    '/museum/verify',
    worldHandler(deps, (ctx) => verifyEntrance(ctx)),
  );
  router.post(
    '/museum/artifact',
    worldHandler(deps, (ctx) => viewArtifact(ctx)),
  );
  router.post(
    '/museum/exhibit',
    worldHandler(deps, (ctx, req) => {
      const page = body(req).page;
      return viewExhibit(
        ctx,
        requireId(body(req).exhibitId, 'exhibitId'),
        typeof page === 'number' ? page : null,
      );
    }),
  );

  // M14 Living Map
  router.get(
    '/map',
    worldHandler(deps, (ctx) => getMapState(ctx)),
  );
  router.post(
    '/map/travel',
    worldHandler(deps, (ctx, req) =>
      travelOnMap(ctx, requireId(body(req).locationId, 'locationId')),
    ),
  );

  // birthday_2026 (M16 narrow scope): accessible even mid-first-journey — deliberately never
  // routed through assertLocationAccess/requireOwner-location gating, only the owner session itself.
  router.get(
    '/birthday',
    birthdayWorldHandler(deps, (ctx, req) => getBirthdayState(ctx, localeOf(req))),
  );
  router.post(
    '/birthday/dismiss',
    birthdayWorldHandler(deps, (ctx, req) => dismissInvitation(ctx, localeOf(req))),
  );
  router.post(
    '/birthday/accept',
    birthdayWorldHandler(deps, (ctx, req) => acceptInvitation(ctx, localeOf(req))),
  );
  router.post(
    '/birthday/wish',
    birthdayWorldHandler(deps, (ctx, req) => {
      const b = body(req);
      if (b.skip === true) return saveBirthdayWish(ctx, localeOf(req), { skip: true });
      if (typeof b.text !== 'string')
        throw new AppError('invalid_request', 'A wish text or skip is required.');
      return saveBirthdayWish(ctx, localeOf(req), { text: b.text });
    }),
  );
  router.post(
    '/birthday/candle',
    birthdayWorldHandler(deps, (ctx, req) => extinguishBirthdayCandle(ctx, localeOf(req))),
  );
  router.post(
    '/birthday/gifts/claim',
    birthdayWorldHandler(deps, (ctx, req) => claimGifts(ctx, localeOf(req))),
  );
  router.post(
    '/birthday/complete',
    birthdayWorldHandler(deps, (ctx, req) => {
      const b = body(req);
      const replayOperationId =
        typeof b.replayOperationId === 'string' ? b.replayOperationId : undefined;
      return completeCelebration(ctx, localeOf(req), replayOperationId);
    }),
  );

  // Scripted companion hints (never registered for /church — see companion-hints.service.ts)
  router.post(
    '/companion/hint',
    worldHandler(deps, (ctx, req) =>
      resolveCompanionHint(ctx, requireId(body(req).locationId, 'locationId'), localeOf(req)),
    ),
  );

  extend?.(router);
  return router;
}
