import type {
  BirthdayAchievementView,
  BirthdayLetterView,
  BirthdayStateResponse,
  BirthdayWindow,
} from '@veoullas-world/contracts';
import { getCharacterState } from '../services/character-state.service.js';
import { getPlayerAchievementViews } from '../services/player-achievements.service.js';
import { grantOwnedDecoration } from './cottage.js';
import { directionFor, pickLocaleRow, usable, type WorldCtx } from './common.js';
import { resolveAssetRef, resolveSceneMediaRefs } from './media.js';
import { unlockAchievement } from './rewards.js';
import { mutateWorldDoc, readWorldDoc } from './state.js';

const EVENT_ID = 'birthday_2026';
const ACHIEVEMENT_ID = 'birthday_2026_celebrated';
const MESSAGE_ID = 'msg_birthday_2026';
/** The companion's `36_CHARACTERS`/`37_CHARACTER_STATE` id — the Living Bible's cat-like companion. */
const CAT_CHARACTER_ID = 'var';
/** "Display the final 20 seconds" — the whole approved flow (invitation → countdown → …) opens this far before `targetAt`. */
const COUNTDOWN_LEAD_SECONDS = 20;
/** The permanent Cottage decoration's catalog id, granted once via `grantOwnedDecoration` and
 * placeable through the ordinary `/cottage/decor` flow — never a farm crop id. */
const DECORATION_ID = 'birthday_cottage_decoration';

/**
 * Configurable asset ids — not asserted to exist. `resolveAssetRef`/`resolveSceneMediaRefs` return
 * null for any unregistered one. `garden` is ONE logical scene asset (desktop `drive_file_id` +
 * portrait `mobile_drive_file_id` on the same `10_ASSETS` row), matching the convention every other
 * scene background uses — not two separate asset ids.
 */
const ASSET_IDS = {
  garden: 'birthday_garden',
  cake: 'birthday_cake',
  decoration: DECORATION_ID,
  candleUnlit: 'birthday_candle_unlit',
  candleFlame: 'birthday_candle_flame',
} as const;

interface EventRow {
  enabled: boolean;
  targetAt: string;
  endAt: string;
  timeZone: string;
}

/**
 * `row.values.<date column>` is already normalized by `packages/sheet-schema`'s `normalizeDate`
 * (ISO-like text or a Google Sheets date serial, epoch 1899-12-30, both handled there) into a real
 * ISO-8601 UTC string — or `null` when blank. On a normalization failure the schema layer leaves the
 * unparsed raw cell in `.values` as a plain string, which is why this still re-validates rather than
 * trusting the type: a value that survives this check is guaranteed to be a finite instant.
 */
function normalizedInstant(value: unknown): string | null {
  if (typeof value !== 'string' || value === '') return null;
  return Number.isNaN(new Date(value).getTime()) ? null : value;
}

async function loadEvent(ctx: WorldCtx): Promise<EventRow | null> {
  const events = await ctx.gateway.readTab('17_EVENTS');
  const row = events.rows.find((r) => r.primaryKeyValue === EVENT_ID);
  if (!row || row.values.enabled !== true) return null;
  const targetAt = normalizedInstant(row.values.target_at);
  if (!targetAt) {
    // Reject explicitly rather than let a bare Sheets serial (e.g. "46040") fall through
    // `Date.parse` and get silently misread as a year far in the future — see CLAUDE.md M16 note.
    console.error(
      `birthday_2026: 17_EVENTS.target_at ("${row.raw.target_at ?? ''}") is not a valid date; treating the event as disabled instead of guessing.`,
    );
    return null;
  }
  const endAt = normalizedInstant(row.values.end_at);
  if (usable(row.raw.end_at) && !endAt) {
    console.error(
      `birthday_2026: 17_EVENTS.end_at ("${row.raw.end_at ?? ''}") is not a valid date; falling back to target_at.`,
    );
  }
  return {
    enabled: true,
    targetAt,
    endAt: endAt ?? targetAt,
    timeZone: usable(row.raw.time_zone) ? row.raw.time_zone! : 'Africa/Cairo',
  };
}

function windowOf(now: Date, event: EventRow): BirthdayWindow {
  // event.targetAt/endAt are already validated finite ISO instants (see normalizedInstant above),
  // so this Date construction can never produce NaN — no bare Date.parse of unnormalized input.
  const target = new Date(event.targetAt).getTime();
  const end = new Date(event.endAt).getTime();
  const leadMs = COUNTDOWN_LEAD_SECONDS * 1000;
  const t = now.getTime();
  if (t < target - leadMs) return 'before';
  if (t < target) return 'countdown';
  if (t < end) return 'live';
  return 'after';
}

/** The one birthday letter's locale rows — enabled only, exactly like every other Mailbox message. */
async function loadLetterRows(ctx: WorldCtx) {
  const table = await ctx.gateway.readTab('19_MESSAGES');
  return table.rows.filter(
    (r) =>
      r.raw.message_id === MESSAGE_ID &&
      r.values.enabled === true &&
      (!usable(r.raw.recipient_user_id) || r.raw.recipient_user_id === ctx.userId),
  );
}

async function resolveLetter(ctx: WorldCtx, locale: string): Promise<BirthdayLetterView | null> {
  const rows = await loadLetterRows(ctx);
  if (rows.length === 0) return null;
  const written = rows
    .filter((r) => usable(r.raw.text))
    .map((r) => ({ locale: r.raw.locale ?? '', r }));
  if (written.length === 0) {
    return { text: '', direction: directionFor(locale), imageRefs: [], contentPending: true };
  }
  const picked = pickLocaleRow(written, locale);
  const row = picked?.row.r ?? written[0]!.r;
  const imageIds = (row.raw.image_asset_ids ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter((s) => usable(s));
  const refs = await Promise.all(imageIds.map((id) => resolveAssetRef(ctx.gateway, id)));
  return {
    text: row.raw.text ?? '',
    direction: directionFor(picked?.usedLocale ?? row.raw.locale ?? locale),
    imageRefs: refs.filter((r): r is string => Boolean(r)),
    contentPending: false,
  };
}

async function resolveAchievement(
  ctx: WorldCtx,
  locale: string,
): Promise<BirthdayAchievementView | null> {
  const views = await getPlayerAchievementViews(ctx.gateway, ctx.userId, locale);
  const mine = views.find((v) => v.achievementId === ACHIEVEMENT_ID);
  if (!mine) return null;
  return {
    achievementId: ACHIEVEMENT_ID,
    unlocked: mine.status === 'unlocked',
    title: mine.title,
    description: mine.description,
    iconRef: mine.iconRef,
  };
}

async function buildState(ctx: WorldCtx, locale: string): Promise<BirthdayStateResponse> {
  const event = await loadEvent(ctx);
  if (!event) {
    return {
      ok: true,
      enabled: false,
      eventId: EVENT_ID,
      targetAt: '',
      endAt: '',
      timeZone: 'Africa/Cairo',
      serverNow: ctx.now.toISOString(),
      window: 'before',
      stage: {
        dismissedAt: '',
        acceptedAt: '',
        wish: '',
        wishSkippedAt: '',
        candleExtinguished: false,
        giftsClaimed: false,
        completedAt: '',
        replayCount: 0,
      },
      cat: { name: '', gender: '' },
      letter: null,
      achievement: null,
      media: {
        gardenDesktopRef: null,
        gardenPortraitRef: null,
        cakeRef: null,
        decorationRef: null,
        candleUnlitRef: null,
        candleFlameRef: null,
      },
    };
  }
  const [
    doc,
    cat,
    letter,
    achievement,
    garden,
    cakeRef,
    decorationRef,
    candleUnlitRef,
    candleFlameRef,
  ] = await Promise.all([
    readWorldDoc(ctx.gateway, ctx.userId, 'birthday'),
    getCharacterState(ctx.gateway, ctx.userId, CAT_CHARACTER_ID),
    resolveLetter(ctx, locale),
    resolveAchievement(ctx, locale),
    resolveSceneMediaRefs(ctx.gateway, ASSET_IDS.garden),
    resolveAssetRef(ctx.gateway, ASSET_IDS.cake),
    resolveAssetRef(ctx.gateway, ASSET_IDS.decoration),
    resolveAssetRef(ctx.gateway, ASSET_IDS.candleUnlit),
    resolveAssetRef(ctx.gateway, ASSET_IDS.candleFlame),
  ]);
  return {
    ok: true,
    enabled: true,
    eventId: EVENT_ID,
    targetAt: event.targetAt,
    endAt: event.endAt,
    timeZone: event.timeZone,
    serverNow: ctx.now.toISOString(),
    window: windowOf(ctx.now, event),
    stage: {
      dismissedAt: doc.dismissedAt,
      acceptedAt: doc.acceptedAt,
      wish: doc.wish,
      wishSkippedAt: doc.wishSkippedAt,
      candleExtinguished: doc.candleExtinguished,
      giftsClaimed: doc.giftsClaimed,
      completedAt: doc.completedAt,
      replayCount: doc.replayCount,
    },
    cat: { name: cat?.personalName ?? '', gender: cat?.selectedGender ?? '' },
    letter,
    achievement,
    media: {
      gardenDesktopRef: garden.default,
      gardenPortraitRef: garden.mobile ?? garden.default,
      cakeRef,
      decorationRef,
      candleUnlitRef,
      candleFlameRef,
    },
  };
}

export async function getBirthdayState(
  ctx: WorldCtx,
  locale: string,
): Promise<BirthdayStateResponse> {
  return buildState(ctx, locale);
}

/** "Later": always safe to call again, never throws even outside the offering window. */
export async function dismissInvitation(
  ctx: WorldCtx,
  locale: string,
): Promise<BirthdayStateResponse> {
  await mutateWorldDoc(ctx, 'birthday', (doc) => {
    doc.dismissedAt = ctx.now.toISOString();
  });
  return buildState(ctx, locale);
}

/** "Celebrate now": records the acceptance. The countdown step itself decides live vs. replay from `window`. */
export async function acceptInvitation(
  ctx: WorldCtx,
  locale: string,
): Promise<BirthdayStateResponse> {
  await mutateWorldDoc(ctx, 'birthday', (doc) => {
    doc.acceptedAt = ctx.now.toISOString();
  });
  return buildState(ctx, locale);
}

/**
 * The private wish: writing is never required (`skip: true` records a plain skip). Overwriting an
 * existing wish is a normal edit, not a duplicate-reward concern — there is nothing to award here.
 * Never logged, never echoed into analytics or any other tab.
 */
export async function saveWish(
  ctx: WorldCtx,
  locale: string,
  input: { text: string } | { skip: true },
): Promise<BirthdayStateResponse> {
  await mutateWorldDoc(ctx, 'birthday', (doc) => {
    if ('skip' in input) {
      doc.wishSkippedAt = ctx.now.toISOString();
    } else {
      doc.wish = input.text.slice(0, 500);
      doc.wishSkippedAt = '';
    }
  });
  return buildState(ctx, locale);
}

/** Idempotent: extinguishing an already-extinguished candle is a harmless no-op. */
export async function extinguishCandle(
  ctx: WorldCtx,
  locale: string,
): Promise<BirthdayStateResponse> {
  await mutateWorldDoc(ctx, 'birthday', (doc) => {
    doc.candleExtinguished = true;
  });
  return buildState(ctx, locale);
}

/**
 * Grants the letter delivery, the permanent Cottage decoration, and the achievement together, all
 * idempotently: `giftsClaimed` becoming true is itself the one-time guard (mirrors `claimed` on
 * `26_PLAYER_ACHIEV`), so a retry/replay/reload never re-delivers, re-grants or re-unlocks anything.
 * The decoration is *granted* (added to the player's owned decorations) here — placing it in a
 * Cottage slot is a separate, ordinary `/cottage/decor` action the player takes whenever they like.
 * No progression key is ever awarded here (the achievement row's own `reward_key_type_id` stays blank).
 */
export async function claimGifts(ctx: WorldCtx, locale: string): Promise<BirthdayStateResponse> {
  const rows = await loadLetterRows(ctx);
  if (rows.length > 0) {
    const key = `${ctx.userId}|${MESSAGE_ID}`;
    await ctx.gateway.appendIfAbsent('27_PLAYER_MESSAGES', key, () => ({
      user_message_key: key,
      user_id: ctx.userId,
      message_id: MESSAGE_ID,
      delivery_status: 'delivered',
      read_status: 'read',
      delivered_at: ctx.now.toISOString(),
      opened_at: ctx.now.toISOString(),
      initial_locale: locale,
      current_translation_locale: '',
      voice_played: 'FALSE',
      gift_claimed: 'TRUE',
      updated_at: ctx.now.toISOString(),
    }));
    const existing = await ctx.gateway.findByPrimaryKey('27_PLAYER_MESSAGES', key, {
      bypass: true,
    });
    if (existing && existing.row.raw.gift_claimed !== 'TRUE') {
      await ctx.gateway.updateByPrimaryKey('27_PLAYER_MESSAGES', key, {
        gift_claimed: 'TRUE',
        updated_at: ctx.now.toISOString(),
      });
    }
  }
  await grantOwnedDecoration(ctx, DECORATION_ID);
  await unlockAchievement(ctx, ACHIEVEMENT_ID);
  await mutateWorldDoc(ctx, 'birthday', (doc) => {
    doc.giftsClaimed = true;
  });
  return buildState(ctx, locale);
}

/**
 * Finishes the sequence. The first call stamps `completedAt` (the one-time completion, never
 * overwritten again). A later call only increments `replayCount`, and only counts as a genuine,
 * distinct replay: `replayOperationId` is a fresh id the client mints once per explicit "replay the
 * celebration" action (e.g. `crypto.randomUUID()`), so a network retry or reload replaying the SAME
 * id (or no id at all, as the ordinary first-run flow sends) is a harmless no-op rather than a second
 * increment. Concurrent duplicate requests are safe too: `mutateWorldDoc`'s per-user mutex serializes
 * them, so the second one always observes the first one's freshly-stored `lastReplayOperationId`.
 */
export async function completeCelebration(
  ctx: WorldCtx,
  locale: string,
  replayOperationId?: string,
): Promise<BirthdayStateResponse> {
  await mutateWorldDoc(ctx, 'birthday', (doc) => {
    if (!doc.completedAt) {
      doc.completedAt = ctx.now.toISOString();
      return;
    }
    if (replayOperationId && replayOperationId !== doc.lastReplayOperationId) {
      doc.replayCount += 1;
      doc.lastReplayOperationId = replayOperationId;
    }
  });
  return buildState(ctx, locale);
}
