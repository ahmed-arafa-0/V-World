import { AppError } from '../errors/app-error.js';
import type { SheetGateway, ReadOptions } from '../repositories/sheet-gateway.js';
import { parseJsonObject, type WorldCtx } from './common.js';

/**
 * Per-user location state. The workbook has no dedicated tab for candles,
 * quiz progress, farm inventory, decor, etc., and Phase 2 adds no tabs, so
 * each system keeps ONE small JSON document in
 * `37_CHARACTER_STATE.story_flags_json` on the row `<userId>|world_<system>`.
 * It is still Sheet-authoritative player state (no browser-only or
 * in-memory truth), scoped to the session user, and serialized per
 * (user, system) by the shared mutex.
 */
export type WorldSystem =
  'journey' | 'rewards' | 'church' | 'cafe' | 'arcade' | 'cottage' | 'farm' | 'museum' | 'birthday';

export interface JourneyDoc {
  /** Beats completed in the original run. */
  beats: string[];
  /** Pure-acknowledgment interactions the player has confirmed (`cottage_enter`, ...). */
  acks: string[];
  /** Beats/acks of a forced replay run (Admin `force_first_journey`). */
  replay?: { beats: string[]; acks: string[]; startedAt: string };
}
export interface RewardsDoc {
  /** rule_id -> period key it was last claimed for (`once`, or a day for daily rules). */
  claimed: Record<string, string>;
}
export interface ChurchDoc {
  visited: boolean;
  candles: Record<string, string[]>;
  /** Candles lit on an occasion day (Sheet-flagged); they stay lit permanently. */
  preservedCandles: string[];
  candlesLitEver: number;
  quiz: Record<string, { answered: string[]; wrong: number; completed: boolean; perfect: boolean }>;
  openedStories: string[];
  /** True once the player has customized the tray (Add/Remove); false means "show the original slots". */
  candleCustomized: boolean;
  /** The candle ids currently placed in the tray, once customized (ignored while candleCustomized is false). */
  candlePresent: string[];
  /** Monotonic counter for player-added candle ids (`candle_a<n>`), never reused. */
  candleSeq: number;
  /** Recent Add request ids → the candle id each produced, so a retried Add can never create a second candle. */
  candleAddRequests: Record<string, string>;
}
export interface CafeDoc {
  gramophoneOpened: boolean;
  walkmanUnlocked: boolean;
  walkman: { songId: string; playing: boolean } | null;
  cardsRead: string[];
}
export interface ArcadeDoc {
  unlocked: string[];
  introWon: boolean;
  visited: boolean;
}
export interface CottageDoc {
  entered: boolean;
  firstMessageDelivered: boolean;
  firstMessageOpened: boolean;
  /** True when Ahmed's first message has no written content yet — the journey must not stall on missing personal content. */
  firstMessageContentPending: boolean;
  decor: Record<string, string>;
  /**
   * Permanent decorations granted outright (never harvested, never consumed) — e.g. the birthday
   * sunflower vase. A `decor` slot value found in this list is placed/cleared for free; anything
   * else is treated as a farm crop and still goes through `consumeProduce`/`returnProduce`.
   */
  ownedDecorations: string[];
  lastInitialLocale: string;
}
export interface FarmDoc {
  starterGranted: boolean;
  seeds: Record<string, number>;
  produce: Record<string, number>;
  plantedFirst: boolean;
  wateredFirst: boolean;
  cropsPlanted: string[];
  plantCount: number;
  harvests: number;
  rainWateredOn: string[];
}
export interface MuseumDoc {
  entryVerified: boolean;
  puzzleSolved: boolean;
  artifactViewed: boolean;
}

/**
 * birthday_2026 (M16 narrow scope). One Cottage-garden celebration flow,
 * separate from `first_journey_completed` and from the ordinary Cottage
 * countdown. `wish` is private (Living Bible: never analytics, never a
 * public log) — this field is the only place it is ever stored, and it is
 * returned only to the owning player's own authenticated session.
 */
export interface BirthdayDoc {
  dismissedAt: string;
  acceptedAt: string;
  wish: string;
  wishSkippedAt: string;
  candleExtinguished: boolean;
  /** Set once the letter + decoration + achievement are granted together, idempotently. */
  giftsClaimed: boolean;
  /** Set once, the first time the sequence is finished; a later replay never overwrites it. */
  completedAt: string;
  replayCount: number;
  /**
   * The `replayOperationId` of the last replay actually counted. A `completeCelebration` retry
   * carrying the same id (or no id at all) never increments `replayCount` again — only a genuinely
   * new id, from an explicit "replay the celebration" action, counts as one more replay.
   */
  lastReplayOperationId: string;
}

export interface WorldDocs {
  journey: JourneyDoc;
  rewards: RewardsDoc;
  church: ChurchDoc;
  cafe: CafeDoc;
  arcade: ArcadeDoc;
  cottage: CottageDoc;
  farm: FarmDoc;
  museum: MuseumDoc;
  birthday: BirthdayDoc;
}

export function defaultDoc<S extends WorldSystem>(system: S): WorldDocs[S] {
  const defaults: WorldDocs = {
    journey: { beats: [], acks: [] },
    rewards: { claimed: {} },
    church: {
      visited: false,
      candles: {},
      preservedCandles: [],
      candlesLitEver: 0,
      quiz: {},
      openedStories: [],
      candleCustomized: false,
      candlePresent: [],
      candleSeq: 0,
      candleAddRequests: {},
    },
    cafe: { gramophoneOpened: false, walkmanUnlocked: false, walkman: null, cardsRead: [] },
    arcade: { unlocked: [], introWon: false, visited: false },
    cottage: {
      entered: false,
      firstMessageDelivered: false,
      firstMessageOpened: false,
      firstMessageContentPending: false,
      decor: {},
      ownedDecorations: [],
      lastInitialLocale: '',
    },
    farm: {
      starterGranted: false,
      seeds: {},
      produce: {},
      plantedFirst: false,
      wateredFirst: false,
      cropsPlanted: [],
      plantCount: 0,
      harvests: 0,
      rainWateredOn: [],
    },
    museum: { entryVerified: false, puzzleSolved: false, artifactViewed: false },
    birthday: {
      dismissedAt: '',
      acceptedAt: '',
      wish: '',
      wishSkippedAt: '',
      candleExtinguished: false,
      giftsClaimed: false,
      completedAt: '',
      replayCount: 0,
      lastReplayOperationId: '',
    },
  };
  return structuredClone(defaults[system]);
}

function docKey(userId: string, system: WorldSystem): string {
  return `${userId}|world_${system}`;
}

/** Current on-disk document version. A newer version is never overwritten by an older build. */
export const WORLD_DOC_VERSION = 1;

const tagOf = (value: unknown): string =>
  Array.isArray(value) ? 'array' : value === null ? 'null' : typeof value;

/**
 * Typed read of one stored document. Every known field must have the same
 * shape as its default; a malformed field falls back to its default (it never
 * crashes a request), while UNKNOWN fields (state a later version or another
 * feature wrote) are kept untouched so a save never drops them. The stored
 * `v` is the document version; a missing `v` is version 0 (same shape,
 * upgraded on the next real save).
 */
export function parseDoc<S extends WorldSystem>(system: S, raw: string | undefined): WorldDocs[S] {
  const defaults = defaultDoc(system) as unknown as Record<string, unknown>;
  const stored = parseJsonObject(raw);
  const doc: Record<string, unknown> = { ...stored };
  for (const [field, fallback] of Object.entries(defaults)) {
    // A null default marks an optional object (e.g. the Walkman selection).
    const ok =
      fallback === null
        ? stored[field] === null || tagOf(stored[field]) === 'object'
        : tagOf(stored[field]) === tagOf(fallback);
    doc[field] = ok ? stored[field] : fallback;
  }
  delete doc.v;
  return doc as unknown as WorldDocs[S];
}

/** Stored version of a raw cell (0 when absent). */
export function storedVersion(raw: string | undefined): number {
  const v = parseJsonObject(raw).v;
  return typeof v === 'number' && Number.isInteger(v) ? v : 0;
}

function isCorrupt(raw: string | undefined): boolean {
  if (!raw || raw.trim() === '') return false;
  try {
    const parsed: unknown = JSON.parse(raw);
    return !parsed || typeof parsed !== 'object' || Array.isArray(parsed);
  } catch {
    return true;
  }
}

export async function readWorldDoc<S extends WorldSystem>(
  gateway: SheetGateway,
  userId: string,
  system: S,
  options?: ReadOptions,
): Promise<WorldDocs[S]> {
  const found = await gateway.findByPrimaryKey(
    '37_CHARACTER_STATE',
    docKey(userId, system),
    options,
  );
  return parseDoc(system, found?.row.raw.story_flags_json);
}

/**
 * Read-modify-write of one system document, serialized per (user, system).
 * `fn` mutates the document in place and may return a value; the row is only
 * written when the serialized document actually changed (so pure reads and
 * idempotent retries cost no write).
 */
/** A tab copy fetched from Google this recently needs no second read before it is written back. */
const FRESH_ENOUGH_MS = 150;

export async function mutateWorldDoc<S extends WorldSystem, R>(
  ctx: WorldCtx,
  system: S,
  fn: (doc: WorldDocs[S]) => R | Promise<R>,
): Promise<{ doc: WorldDocs[S]; result: R }> {
  if (!ctx.userId) {
    throw new AppError('backend_not_configured', 'No authenticated owner user was resolved.');
  }
  return ctx.mutex.run(`world:${ctx.userId}:${system}`, async () => {
    const key = docKey(ctx.userId, system);
    // Optimistic retry: if another writer changed the cell while fn ran, redo on the fresh state.
    for (let attempt = 0; attempt < 3; attempt++) {
      const found = await ctx.gateway.findByPrimaryKey('37_CHARACTER_STATE', key, { bypass: true });
      const rawBefore = found?.row.raw.story_flags_json;
      // Never overwrite something we cannot understand: it may hold state we would destroy.
      if (isCorrupt(rawBefore)) {
        throw new AppError(
          'WORLD_INVALID_STATE',
          'Stored location state is unreadable; refusing to overwrite it.',
        );
      }
      if (storedVersion(rawBefore) > WORLD_DOC_VERSION) {
        throw new AppError('WORLD_INVALID_STATE', 'Stored location state is from a newer version.');
      }
      const doc = parseDoc(system, rawBefore);
      const before = JSON.stringify(doc);
      const result = await fn(doc);
      const after = JSON.stringify(doc);
      const needsUpgrade = Boolean(rawBefore) && storedVersion(rawBefore) < WORLD_DOC_VERSION;
      if (after === before && !needsUpgrade && found) return { doc, result };
      if (after === before && !found) return { doc, result };
      // Before writing, make sure nothing changed since the read. If that read was fetched from Google
      // a moment ago (fn was quick), there is nothing to re-check: skip the second read.
      let latest = found;
      let latestRaw: string[][] | undefined;
      if (ctx.gateway.tabAgeMs('37_CHARACTER_STATE') > FRESH_ENOUGH_MS) {
        const fresh = await ctx.gateway.findFresh('37_CHARACTER_STATE', key);
        latest = fresh.found;
        latestRaw = fresh.raw;
        if ((latest?.row.raw.story_flags_json ?? '') !== (rawBefore ?? '')) continue;
      }
      // Unknown fields ride along in doc (parseDoc keeps them), so unrelated state survives.
      const patch = {
        story_flags_json: JSON.stringify({ v: WORLD_DOC_VERSION, ...doc }),
        updated_at: ctx.now.toISOString(),
      };
      if (latest) {
        await ctx.gateway.updateByPrimaryKey('37_CHARACTER_STATE', key, patch, latest);
      } else {
        await ctx.gateway.appendRow(
          '37_CHARACTER_STATE',
          {
            user_character_key: key,
            user_id: ctx.userId,
            character_id: `world_${system}`,
            relationship_level: '',
            known_words_count: '0',
            deliveries_count: '0',
            ...patch,
          },
          latestRaw,
        );
      }
      return { doc, result };
    }
    throw new AppError(
      'SHEET_WRITE_CONFLICT',
      'Location state changed concurrently; please retry.',
      {
        retryable: true,
      },
    );
  });
}

/** Every system document for one user from a single tab read (cache-friendly). */
export async function readAllWorldDocs(
  gateway: SheetGateway,
  userId: string,
  options?: { bypass?: boolean },
): Promise<WorldDocs> {
  const result = await gateway.readTab('37_CHARACTER_STATE', options);
  const byKey = new Map(result.rows.map((row) => [row.primaryKeyValue, row.raw.story_flags_json]));
  const pick = <S extends WorldSystem>(system: S): WorldDocs[S] =>
    parseDoc(system, byKey.get(docKey(userId, system)));
  return {
    journey: pick('journey'),
    rewards: pick('rewards'),
    church: pick('church'),
    cafe: pick('cafe'),
    arcade: pick('arcade'),
    cottage: pick('cottage'),
    farm: pick('farm'),
    museum: pick('museum'),
    birthday: pick('birthday'),
  };
}
