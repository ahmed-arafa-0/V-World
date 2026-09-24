import type {
  MapLocationView,
  MapStateResponse,
  MuseumExhibitView,
  MuseumStateResponse,
  WorldRewardView,
} from '@veoullas-world/contracts';
import { AppError } from '../errors/app-error.js';
import { getPlayerAchievements } from '../services/player-achievements.service.js';
import { getPlayerKeys } from '../services/player-keys.service.js';
import {
  getDayClock,
  groupBy,
  isScheduledDue,
  parseJsonObject,
  usable,
  type WorldCtx,
} from './common.js';
import {
  assertLocationAccess,
  getJourneyState,
  museumRequirement,
  syncJourney,
} from './journey.js';
import { resolveAssetRef, resolveAssetRefs } from './media.js';
import { mutateWorldDoc, readWorldDoc } from './state.js';

const SECRET_TYPE = 'empty_secret_slot';
const ARCHIVE_LINK_TYPE = 'archive_portal';

/**
 * The one deliberate exception to "media comes from Drive": an
 * `archive_portal` exhibit's `source_content_id` holds a raw external URL
 * instead of a `10_ASSETS` asset ID, and is exposed to the browser as-is —
 * never proxied, never embedded server-side. Only a well-formed `https://`
 * URL is ever exposed; anything else (blank, `http://`, a typo, a
 * non-URL placeholder) resolves to `null`, same as a missing asset.
 */
function validHttpsUrl(value: string | undefined): string | null {
  const trimmed = (value ?? '').trim();
  if (!trimmed) return null;
  try {
    const url = new URL(trimmed);
    return url.protocol === 'https:' ? url.toString() : null;
  } catch {
    return null;
  }
}

/** Whether the final road (before the Everkeep's door) demands its puzzle, per the Sheet's key rule. */
async function puzzleRequired(ctx: WorldCtx): Promise<boolean> {
  const rules = await ctx.gateway.readTab('22_KEY_RULES');
  const rule = rules.rows.find(
    (r) => r.values.enabled === true && r.raw.source_id === 'museum_key_check',
  );
  return parseJsonObject(rule?.raw.condition_json).final_road_puzzle === true;
}

async function buildState(
  ctx: WorldCtx,
  rewards?: WorldRewardView[],
): Promise<MuseumStateResponse> {
  const [
    journey,
    doc,
    requirement,
    needsPuzzle,
    exhibits,
    playerExhibits,
    achievements,
    locations,
    clock,
  ] = await Promise.all([
    getJourneyState(ctx),
    readWorldDoc(ctx.gateway, ctx.userId, 'museum'),
    museumRequirement(ctx),
    puzzleRequired(ctx),
    ctx.gateway.readTab('34_MUSEUM_EXHIBITS'),
    ctx.gateway.readTab('35_PLAYER_EXHIBITS'),
    getPlayerAchievements(ctx.gateway, ctx.userId),
    ctx.gateway.readTab('11_LOCATIONS'),
    getDayClock(ctx.gateway, ctx.now),
  ]);
  const keys = await getPlayerKeys(ctx.gateway, ctx.userId);
  const mine = new Map(
    playerExhibits.rows
      .filter((r) => r.raw.user_id === ctx.userId)
      .map((r) => [r.raw.exhibit_id ?? '', r.raw] as const),
  );
  const achieved = new Set(achievements.filter((a) => a.claimed).map((a) => a.achievementId));

  const isUnlocked = (raw: Record<string, string>): boolean => {
    if (mine.get(raw.exhibit_id ?? '')?.unlock_status === 'unlocked') return true; // Admin-granted
    const rule = parseJsonObject(raw.unlock_rule_json);
    switch (raw.unlock_type) {
      case 'story_progress':
        return journey.completed;
      case 'achievement':
        return typeof rule.achievement_id === 'string' && achieved.has(rule.achievement_id);
      case 'key':
        return (
          typeof rule.key_type_id === 'string' &&
          (keys.find((k) => k.keyTypeId === rule.key_type_id)?.quantityFound ?? 0) >=
            (Number(rule.quantity) || 1)
        );
      case 'date':
        return typeof rule.date === 'string' && isScheduledDue(rule.date, clock);
      default:
        // `event_complete` (Phase 3 birthday event) and anything unknown stay locked.
        return false;
    }
  };

  const rows = exhibits.rows.filter((r) => r.values.enabled === true);
  const imageRefs = await resolveAssetRefs(
    ctx.gateway,
    rows.flatMap((r) => [
      ...(r.raw.image_asset_ids ?? '').split(',').map((s) => s.trim()),
      r.raw.audio_asset_id ?? '',
    ]),
  );
  const pdfRefs = new Map<string, string>();
  for (const r of rows.filter((x) => x.raw.exhibit_type === 'pdf_book')) {
    const ref = await resolveAssetRef(ctx.gateway, r.raw.source_content_id ?? '');
    if (ref) pdfRefs.set(r.primaryKeyValue ?? '', ref);
  }
  const archiveUrls = new Map<string, string>();
  for (const r of rows.filter((x) => x.raw.exhibit_type === ARCHIVE_LINK_TYPE)) {
    const url = validHttpsUrl(r.raw.source_content_id);
    if (url) archiveUrls.set(r.primaryKeyValue ?? '', url);
  }

  const views: (MuseumExhibitView & { wing: string })[] = rows.map((r) => {
    const exhibitId = r.primaryKeyValue ?? '';
    const unlocked = isUnlocked({ ...r.raw, exhibit_id: exhibitId });
    const secret = r.raw.exhibit_type === SECRET_TYPE;
    const progress = mine.get(exhibitId);
    if (!unlocked) {
      // A locked exhibit exposes nothing of itself; a secret slot is only an empty position.
      return {
        wing: r.raw.wing_id ?? '',
        exhibitId: secret ? `slot:${r.raw.position_id ?? ''}` : exhibitId,
        wingId: r.raw.wing_id ?? '',
        positionId: r.raw.position_id ?? '',
        exhibitType: secret ? SECRET_TYPE : '',
        locked: true,
        secret,
        displayNameTextId: '',
        imageRefs: [],
        audioRef: null,
        pdfRef: null,
        archiveUrl: null,
        bookPage: 0,
        viewCount: 0,
      };
    }
    return {
      wing: r.raw.wing_id ?? '',
      exhibitId,
      wingId: r.raw.wing_id ?? '',
      positionId: r.raw.position_id ?? '',
      exhibitType: r.raw.exhibit_type ?? '',
      locked: false,
      secret,
      displayNameTextId: usable(r.raw.display_name_text_id) ? r.raw.display_name_text_id! : '',
      imageRefs: (r.raw.image_asset_ids ?? '')
        .split(',')
        .map((s) => imageRefs.get(s.trim()))
        .filter((x): x is string => Boolean(x)),
      audioRef: imageRefs.get(r.raw.audio_asset_id ?? '') ?? null,
      pdfRef: pdfRefs.get(exhibitId) ?? null,
      archiveUrl: archiveUrls.get(exhibitId) ?? null,
      bookPage: Number(progress?.book_page) || 0,
      viewCount: Number(progress?.view_count) || 0,
    };
  });

  const visited = (locationId: string) =>
    journey.beats.some((b) => b.locationId === locationId && b.done);
  const progress = locations.rows
    .filter(
      (l) =>
        l.values.enabled === true && l.primaryKeyValue !== 'gate' && l.primaryKeyValue !== 'museum',
    )
    .map((l) => ({
      locationId: l.primaryKeyValue ?? '',
      keyTypeId: l.raw.key_type_id ?? '',
      owned: (keys.find((k) => k.keyTypeId === l.raw.key_type_id)?.quantityFound ?? 0) > 0,
      visited: visited(l.primaryKeyValue ?? ''),
    }));

  return {
    ok: true,
    entrance: {
      open: doc.entryVerified,
      requirement,
      puzzleRequired: needsPuzzle,
      puzzleSolved: doc.puzzleSolved,
    },
    hall: { artifactViewed: doc.artifactViewed, progress },
    wings: [...groupBy(views, (v) => v.wing).entries()].map(([wingId, exhibitViews]) => ({
      wingId,
      locked: exhibitViews.every((e) => e.locked),
      exhibits: exhibitViews.map((e) => {
        const { wing, ...view } = e;
        void wing;
        return view;
      }),
    })),
    rewards,
  };
}

export async function getMuseumState(ctx: WorldCtx): Promise<MuseumStateResponse> {
  return buildState(ctx);
}

/**
 * The final-road puzzle (design still open in the Living Bible): the player
 * seats every required location key in the gate. The server checks the
 * inventory; nothing is spent — keys stay collected.
 */
export async function solveFinalRoadPuzzle(
  ctx: WorldCtx,
  keyTypeIds: string[],
): Promise<MuseumStateResponse> {
  await assertLocationAccess(ctx, 'museum');
  const requirement = await museumRequirement(ctx);
  const seated = new Set(keyTypeIds);
  const complete =
    requirement.every((r) => seated.has(r.keyTypeId)) && seated.size === requirement.length;
  if (!complete) throw new AppError('invalid_request', 'The gate needs exactly the required keys.');
  if (requirement.some((r) => r.owned < r.required)) {
    throw new AppError('WORLD_LOCKED', 'Some of those keys have not been collected yet.');
  }
  await mutateWorldDoc(ctx, 'museum', (doc) => {
    doc.puzzleSolved = true;
  });
  return buildState(ctx);
}

/** Verifies the entrance requirements on the server (keys + the road puzzle) and opens the Central Hall. */
export async function verifyEntrance(ctx: WorldCtx): Promise<MuseumStateResponse> {
  await assertLocationAccess(ctx, 'museum');
  const [requirement, needsPuzzle, doc] = await Promise.all([
    museumRequirement(ctx),
    puzzleRequired(ctx),
    readWorldDoc(ctx.gateway, ctx.userId, 'museum', { bypass: true }),
  ]);
  if (requirement.some((r) => r.owned < r.required)) {
    throw new AppError('WORLD_LOCKED', 'The Everkeep needs more keys.');
  }
  if (needsPuzzle && !doc.puzzleSolved) {
    throw new AppError('WORLD_LOCKED', 'The road puzzle has not been solved yet.');
  }
  await mutateWorldDoc(ctx, 'museum', (d) => {
    d.entryVerified = true;
  });
  const journey = await syncJourney(ctx);
  const rewards = (journey.advanced ?? []).flatMap((a) => (a.reward ? [a.reward] : []));
  return buildState(ctx, rewards);
}

/** Looking at the Central Hall's mysterious artifact (the hall step of the journey). */
export async function viewArtifact(ctx: WorldCtx): Promise<MuseumStateResponse> {
  await assertLocationAccess(ctx, 'museum');
  const doc = await readWorldDoc(ctx.gateway, ctx.userId, 'museum', { bypass: true });
  if (!doc.entryVerified) throw new AppError('WORLD_LOCKED', 'The Central Hall is not open yet.');
  await mutateWorldDoc(ctx, 'museum', (d) => {
    d.artifactViewed = true;
  });
  await syncJourney(ctx);
  return buildState(ctx);
}

/** Records opening an unlocked exhibit (and a PDF book's page). Locked exhibits cannot be opened. */
export async function viewExhibit(
  ctx: WorldCtx,
  exhibitId: string,
  page: number | null,
): Promise<MuseumStateResponse> {
  await assertLocationAccess(ctx, 'museum');
  const state = await buildState(ctx);
  const exhibit = state.wings.flatMap((w) => w.exhibits).find((e) => e.exhibitId === exhibitId);
  if (!exhibit || exhibit.locked)
    throw new AppError('WORLD_LOCKED', 'That exhibit is still locked.');
  const key = `${ctx.userId}|${exhibitId}`;
  const existing = await ctx.gateway.findByPrimaryKey('35_PLAYER_EXHIBITS', key, { bypass: true });
  const nowIso = ctx.now.toISOString();
  const patch: Record<string, string> = {
    unlock_status: 'unlocked',
    view_count: String((Number(existing?.row.raw.view_count) || 0) + 1),
    last_viewed_at: nowIso,
    updated_at: nowIso,
  };
  if (page !== null && Number.isInteger(page) && page >= 0) patch.book_page = String(page);
  if (existing) {
    await ctx.gateway.updateByPrimaryKey('35_PLAYER_EXHIBITS', key, patch);
  } else {
    await ctx.gateway.appendRow('35_PLAYER_EXHIBITS', {
      user_exhibit_key: key,
      user_id: ctx.userId,
      exhibit_id: exhibitId,
      unlocked_at: nowIso,
      ...patch,
    });
  }
  return buildState(ctx);
}

/* ------------------------------------------------------------------ */
/* M14 Map                                                              */
/* ------------------------------------------------------------------ */

export async function getMapState(ctx: WorldCtx): Promise<MapStateResponse> {
  const [journey, locations, progress] = await Promise.all([
    getJourneyState(ctx),
    ctx.gateway.readTab('11_LOCATIONS'),
    ctx.gateway.readTab('24_PLAYER_PROGRESS'),
  ]);
  const row = progress.rows.find((r) => r.primaryKeyValue === `${ctx.userId}|first_journey`);
  const views: MapLocationView[] = locations.rows
    .filter((l) => l.values.enabled === true && l.primaryKeyValue !== 'gate')
    .map((l) => {
      const locationId = l.primaryKeyValue ?? '';
      return {
        locationId,
        mapOrder: Number(l.raw.map_order) || 0,
        roadSide: l.raw.road_side ?? '',
        elevationBand: l.raw.elevation_band ?? '',
        keyTypeId: l.raw.key_type_id ?? '',
        locked: !journey.accessibleLocations.includes(locationId),
        visited: journey.beats.some((b) => b.locationId === locationId && b.done),
      };
    })
    .sort((a, b) => a.mapOrder - b.mapOrder);
  return {
    ok: true,
    unlocked: journey.mapUnlocked,
    currentLocation: usable(row?.raw.current_location)
      ? row!.raw.current_location!
      : journey.startLocation,
    locations: views,
  };
}

/** Moves the Map avatar to an open location (persisted so the next visit knows where she was). */
export async function travelOnMap(ctx: WorldCtx, locationId: string): Promise<MapStateResponse> {
  const state = await getMapState(ctx);
  if (!state.unlocked) throw new AppError('WORLD_LOCKED', 'The Map has not been unlocked yet.');
  const target = state.locations.find((l) => l.locationId === locationId);
  if (!target || target.locked) throw new AppError('WORLD_LOCKED', 'That place is not open yet.');
  await ctx.gateway.updateByPrimaryKey('24_PLAYER_PROGRESS', `${ctx.userId}|first_journey`, {
    current_location: locationId,
    updated_at: ctx.now.toISOString(),
  });
  return getMapState(ctx);
}
