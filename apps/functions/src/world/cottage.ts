import type {
  CottageStateResponse,
  CountdownView,
  MailboxDeliveryResponse,
  MailboxMessageView,
  WorldRewardView,
} from '@veoullas-world/contracts';
import type { NormalizedRow } from '@veoullas-world/sheet-schema';
import { AppError } from '../errors/app-error.js';
import { getCharacterState } from '../services/character-state.service.js';
import { calendarDateKey } from '../services/authoritative-time.service.js';
import {
  directionFor,
  getDayClock,
  groupBy,
  isFirstVisitSentinel,
  isScheduledDue,
  readAppConfig,
  usable,
  type WorldCtx,
} from './common.js';
import { consumeProduce, returnProduce } from './farm.js';
import { assertLocationAccess, syncJourney } from './journey.js';
import { marcelinoPresence, timeOfDay } from './marcelino.js';
import { resolveAssetRefs } from './media.js';
import { mutateWorldDoc, readWorldDoc } from './state.js';
import { readWeather } from './weather.js';

const DEFAULT_DECOR_SLOTS = 4;
const IMPORTANT = new Set(['1', 'important', 'high']);

interface MessageGroup {
  messageId: string;
  rows: NormalizedRow[];
  important: boolean;
  scheduledFirstVisit: boolean;
}

/** Enabled messages addressed to this player (or to everyone), grouped by `message_id`. */
async function loadMessageGroups(ctx: WorldCtx): Promise<MessageGroup[]> {
  const table = await ctx.gateway.readTab('19_MESSAGES');
  const mine = table.rows.filter(
    (r) =>
      r.values.enabled === true &&
      (!usable(r.raw.recipient_user_id) || r.raw.recipient_user_id === ctx.userId),
  );
  return [...groupBy(mine, (r) => r.raw.message_id ?? '').entries()]
    .filter(([id]) => usable(id))
    .map(([messageId, rows]) => ({
      messageId,
      rows,
      important: IMPORTANT.has((rows[0]?.raw.priority ?? '').trim().toLowerCase()),
      scheduledFirstVisit: rows.some((r) => isFirstVisitSentinel(r.raw.delivery_at)),
    }));
}

/** Locales in which a message actually has written text (placeholders never count). */
function writtenLocales(group: MessageGroup): string[] {
  return group.rows.filter((r) => usable(r.raw.text)).map((r) => r.raw.locale ?? '');
}

async function bumpDeliveries(ctx: WorldCtx, batches: number): Promise<void> {
  if (batches < 1) return;
  const key = `${ctx.userId}|marcelino`;
  const existing = await ctx.gateway.findByPrimaryKey('37_CHARACTER_STATE', key, { bypass: true });
  if (existing) {
    await ctx.gateway.updateByPrimaryKey('37_CHARACTER_STATE', key, {
      deliveries_count: String((Number(existing.row.raw.deliveries_count) || 0) + batches),
      last_seen_at: ctx.now.toISOString(),
      updated_at: ctx.now.toISOString(),
    });
  } else {
    await ctx.gateway.appendRow('37_CHARACTER_STATE', {
      user_character_key: key,
      user_id: ctx.userId,
      character_id: 'marcelino',
      relationship_level: 'new',
      current_location: 'cottage',
      known_words_count: '0',
      deliveries_count: String(batches),
      story_flags_json: '{}',
      last_seen_at: ctx.now.toISOString(),
      updated_at: ctx.now.toISOString(),
    });
  }
}

/**
 * Delivers one message: picks its initial language at random among the locales
 * where it has written text (avoiding the previous message's language when
 * another is available), records the delivery, and is idempotent by
 * (user, message). A message with no written text anywhere is never delivered
 * — it retries on a later visit once Ahmed has written it.
 */
async function deliverOne(ctx: WorldCtx, group: MessageGroup): Promise<boolean> {
  const locales = writtenLocales(group);
  if (locales.length === 0) return false;
  const doc = await readWorldDoc(ctx.gateway, ctx.userId, 'cottage', { bypass: true });
  const pool = locales.length > 1 ? locales.filter((l) => l !== doc.lastInitialLocale) : locales;
  const pick =
    pool[Math.min(pool.length - 1, Math.floor((ctx.random ?? Math.random)() * pool.length))]!;
  const result = await ctx.gateway.appendIfAbsent(
    '27_PLAYER_MESSAGES',
    `${ctx.userId}|${group.messageId}`,
    () => ({
      user_message_key: `${ctx.userId}|${group.messageId}`,
      user_id: ctx.userId,
      message_id: group.messageId,
      delivery_status: 'delivered',
      read_status: 'unread',
      delivered_at: ctx.now.toISOString(),
      initial_locale: pick,
      current_translation_locale: '',
      voice_played: 'FALSE',
      gift_claimed: 'FALSE',
      updated_at: ctx.now.toISOString(),
    }),
  );
  if (result.created) {
    await mutateWorldDoc(ctx, 'cottage', (d) => {
      d.lastInitialLocale = pick;
    });
  }
  return result.created;
}

async function viewFor(
  ctx: WorldCtx,
  group: MessageGroup,
  player: Record<string, string>,
  refs: Map<string, string>,
  voiceRefs: Map<string, string>,
): Promise<MailboxMessageView> {
  const initial = player.initial_locale ?? 'en';
  const shown = usable(player.current_translation_locale)
    ? player.current_translation_locale!
    : initial;
  const rowFor = (locale: string) =>
    group.rows.find((r) => r.raw.locale === locale && usable(r.raw.text));
  const row = rowFor(shown) ?? rowFor(initial) ?? group.rows.find((r) => usable(r.raw.text));
  const readStatus = ['read', 'archived'].includes(player.read_status ?? '')
    ? (player.read_status as 'read' | 'archived')
    : 'unread';
  const imageIds = (row?.raw.image_asset_ids ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter((s) => usable(s));
  const voiceId = row?.raw.voiceover_id ?? '';
  return {
    messageId: group.messageId,
    messageType: row?.raw.message_type ?? 'letter',
    important: group.important,
    senderId: row?.raw.sender_id ?? '',
    deliveredAt: player.delivered_at ?? '',
    readStatus,
    initialLocale: initial,
    shownLocale: row?.raw.locale ?? shown,
    availableLocales: writtenLocales(group),
    text: row?.raw.text ?? '',
    direction: directionFor(row?.raw.locale ?? shown),
    imageRefs: imageIds.map((id) => refs.get(id)).filter((r): r is string => Boolean(r)),
    voiceNoteRef: usable(voiceId) ? (voiceRefs.get(voiceId) ?? null) : null,
    contentPending: !row,
  };
}

/**
 * Ahmed's mailbox voice notes are a deliberate, distinct feature (not story
 * narration): a note is playable only when its `16_VOICEOVER` row for the
 * message's locale points at a registered audio file, and only on a tap.
 */
async function resolveVoiceNotes(
  ctx: WorldCtx,
  groups: MessageGroup[],
): Promise<Map<string, string>> {
  const ids = new Set(
    groups.flatMap((g) => g.rows.map((r) => r.raw.voiceover_id ?? '')).filter((i) => usable(i)),
  );
  if (ids.size === 0) return new Map();
  const table = await ctx.gateway.readTab('16_VOICEOVER');
  const rows = table.rows.filter(
    (r) => r.values.enabled === true && ids.has(r.primaryKeyValue ?? ''),
  );
  const audio = await resolveAssetRefs(
    ctx.gateway,
    rows.map((r) => r.raw.audio_asset_id ?? ''),
  );
  const out = new Map<string, string>();
  for (const r of rows) {
    const ref = audio.get(r.raw.audio_asset_id ?? '');
    if (ref) out.set(r.primaryKeyValue ?? '', ref);
  }
  return out;
}

async function loadMailbox(ctx: WorldCtx): Promise<MailboxMessageView[]> {
  const [groups, player] = await Promise.all([
    loadMessageGroups(ctx),
    ctx.gateway.readTab('27_PLAYER_MESSAGES'),
  ]);
  const mine = new Map(
    player.rows
      .filter((r) => r.raw.user_id === ctx.userId)
      .map((r) => [r.raw.message_id ?? '', r.raw] as const),
  );
  const delivered = groups.filter((g) => mine.has(g.messageId));
  const imageIds = delivered.flatMap((g) =>
    g.rows.flatMap((r) => (r.raw.image_asset_ids ?? '').split(',').map((s) => s.trim())),
  );
  const [refs, voiceRefs] = await Promise.all([
    resolveAssetRefs(ctx.gateway, imageIds),
    resolveVoiceNotes(ctx, delivered),
  ]);
  const views = await Promise.all(
    delivered.map((g) => viewFor(ctx, g, mine.get(g.messageId)!, refs, voiceRefs)),
  );
  return views.sort((a, b) => b.deliveredAt.localeCompare(a.deliveredAt));
}

/** Rows grouped as Marcelino carries them: each important message alone, everything else together. */
function toBatches(views: MailboxMessageView[]): MailboxMessageView[][] {
  const important = views.filter((v) => v.important).map((v) => [v]);
  const rest = views.filter((v) => !v.important);
  return rest.length ? [...important, rest] : important;
}

/** Delivers every message whose scheduled time has come. Idempotent; a missed delivery simply happens on the next visit. */
export async function deliverDueMessages(ctx: WorldCtx): Promise<MailboxMessageView[]> {
  const [groups, clock, doc] = await Promise.all([
    loadMessageGroups(ctx),
    getDayClock(ctx.gateway, ctx.now),
    readWorldDoc(ctx.gateway, ctx.userId, 'cottage', { bypass: true }),
  ]);
  const deliveredNow: string[] = [];
  for (const group of groups) {
    const dated = group.rows.every((r) => !isFirstVisitSentinel(r.raw.delivery_at));
    // The first-journey message is delivered by Marcelino's story beat — unless that
    // beat passed while its text was still unwritten, in which case it follows once written.
    const due = dated
      ? group.rows.some((r) => isScheduledDue(r.raw.delivery_at, clock))
      : doc.firstMessageDelivered && doc.firstMessageContentPending;
    if (!due) continue;
    if (await deliverOne(ctx, group)) {
      deliveredNow.push(group.messageId);
      if (!dated) {
        await mutateWorldDoc(ctx, 'cottage', (d) => {
          d.firstMessageContentPending = false;
        });
      }
    }
  }
  const all = await loadMailbox(ctx);
  return all.filter((m) => deliveredNow.includes(m.messageId));
}

async function buildCountdown(
  ctx: WorldCtx,
  config: Map<string, string>,
  timeZone: string,
): Promise<CountdownView | null> {
  const eventId = config.get('current_event_id');
  if (!eventId) return null;
  const events = await ctx.gateway.readTab('17_EVENTS');
  const event = events.rows.find((e) => e.primaryKeyValue === eventId && e.values.enabled === true);
  const target = event?.values.target_at;
  if (!event || typeof target !== 'string' || target === '') return null;
  const completed = ctx.now.getTime() >= Date.parse(target);
  return {
    eventId,
    name: usable(event.raw.event_name) ? event.raw.event_name! : '',
    targetAt: target,
    completed,
    completedDate: completed ? calendarDateKey(new Date(target), timeZone) : null,
  };
}

async function buildState(
  ctx: WorldCtx,
  extra?: Partial<CottageStateResponse>,
): Promise<CottageStateResponse> {
  const [messages, doc, farm, config, clock, weather, varState, marcelino] = await Promise.all([
    loadMailbox(ctx),
    readWorldDoc(ctx.gateway, ctx.userId, 'cottage'),
    readWorldDoc(ctx.gateway, ctx.userId, 'farm'),
    readAppConfig(ctx.gateway),
    getDayClock(ctx.gateway, ctx.now),
    readWeather(ctx),
    getCharacterState(ctx.gateway, ctx.userId, 'var'),
    ctx.gateway.findByPrimaryKey('37_CHARACTER_STATE', `${ctx.userId}|marcelino`),
  ]);
  const slots = Array.from(
    {
      length: Math.max(
        1,
        Math.min(12, Number(config.get('cottage_decor_slots')) || DEFAULT_DECOR_SLOTS),
      ),
    },
    (_, i) => `decor_${i + 1}`,
  );
  const deliveries = Number(marcelino?.row.raw.deliveries_count) || 0;
  const stages = (config.get('marcelino_learning_stage_deliveries') ?? '')
    .split(',')
    .map((n) => Number(n.trim()))
    .filter((n) => Number.isFinite(n) && n > 0);
  const presence = marcelinoPresence(config, ctx.now, clock.timeZone);
  return {
    ok: true,
    entered: doc.entered,
    unreadCount: messages.filter((m) => m.readStatus === 'unread').length,
    messages,
    countdown: await buildCountdown(ctx, config, clock.timeZone),
    serverNow: ctx.now.toISOString(),
    marcelino: {
      visible: presence.visible,
      at: presence.at,
      deliveries,
      learningStage: stages.filter((n) => deliveries >= n).length,
    },
    window: {
      timeOfDay: timeOfDay(ctx.now, clock.timeZone),
      weather:
        weather.status === 'unavailable'
          ? 'unknown'
          : weather.status === 'raining'
            ? 'rain'
            : 'clear',
    },
    decor: { slots, placed: doc.decor, owned: doc.ownedDecorations },
    varName: varState?.personalName ?? '',
    produce: farm.produce,
    ...extra,
  };
}

export async function getCottageState(ctx: WorldCtx): Promise<CottageStateResponse> {
  return buildState(ctx);
}

/** Entering the Cottage: delivers anything due and reports the hub state. */
export async function enterCottage(ctx: WorldCtx): Promise<MailboxDeliveryResponse> {
  await assertLocationAccess(ctx, 'cottage');
  await mutateWorldDoc(ctx, 'cottage', (doc) => {
    doc.entered = true;
  });
  const delivered = await deliverDueMessages(ctx);
  const batches = toBatches(delivered);
  await bumpDeliveries(ctx, batches.length);
  const state = await buildState(ctx);
  // A delivery is itself his appearance: he arrives with the mail even outside a scheduled window.
  if (batches.length > 0) state.marcelino = { ...state.marcelino, visible: true, at: 'cottage' };
  return { ok: true, batches, state };
}

/**
 * Marcelino's first appearance (journey beat 12): delivers Ahmed's first
 * message. Missing content is a retryable content task, never proof of delivery or reading.
 */
export async function deliverFirstMessage(ctx: WorldCtx): Promise<MailboxDeliveryResponse> {
  await assertLocationAccess(ctx, 'cottage');
  const groups = await loadMessageGroups(ctx);
  const first = groups.find((g) => g.scheduledFirstVisit);
  let delivered: MailboxMessageView[] = [];
  if (!first || writtenLocales(first).length === 0) {
    throw new AppError(
      'WORLD_CONTENT_UNAVAILABLE',
      'The first message has not been written for this player. Ask Ahmed to add its enabled first-visit message text, then retry delivery.',
    );
  }
  if (first) {
    await deliverOne(ctx, first);
    const all = await loadMailbox(ctx);
    delivered = all.filter((m) => m.messageId === first.messageId);
  }
  await mutateWorldDoc(ctx, 'cottage', (doc) => {
    doc.firstMessageDelivered = true;
    doc.firstMessageContentPending = false;
  });
  if (delivered.length) await bumpDeliveries(ctx, 1);
  const journey = await syncJourney(ctx);
  const rewards: WorldRewardView[] = (journey.advanced ?? []).flatMap((a) =>
    a.reward ? [a.reward] : [],
  );
  return {
    ok: true,
    batches: delivered.length ? [delivered] : [],
    // The first delivery is a story event: Marcelino is present for it.
    state: await buildState(ctx, {
      rewards,
      marcelino: { ...(await buildState(ctx)).marcelino, visible: true, at: 'cottage' },
    }),
  };
}

/** Opens (reads) a delivered message: it becomes read, or archived when the Sheet says `archive_after_open`. */
export async function openMessage(ctx: WorldCtx, messageId: string): Promise<CottageStateResponse> {
  await assertLocationAccess(ctx, 'cottage');
  const key = `${ctx.userId}|${messageId}`;
  const existing = await ctx.gateway.findByPrimaryKey('27_PLAYER_MESSAGES', key, { bypass: true });
  if (!existing) throw new AppError('not_found', 'That message has not been delivered.');
  const groups = await loadMessageGroups(ctx);
  const group = groups.find((g) => g.messageId === messageId);
  const archive = group?.rows.some((r) => r.values.archive_after_open === true) ?? false;
  if (existing.row.raw.read_status === 'unread' || !usable(existing.row.raw.read_status)) {
    await ctx.gateway.updateByPrimaryKey('27_PLAYER_MESSAGES', key, {
      read_status: archive ? 'archived' : 'read',
      opened_at: ctx.now.toISOString(),
      archived_at: archive ? ctx.now.toISOString() : '',
      updated_at: ctx.now.toISOString(),
    });
  }
  if (group?.scheduledFirstVisit) {
    await mutateWorldDoc(ctx, 'cottage', (doc) => {
      doc.firstMessageOpened = true;
    });
  }
  const journey = await syncJourney(ctx);
  const rewards: WorldRewardView[] = (journey.advanced ?? []).flatMap((a) =>
    a.reward ? [a.reward] : [],
  );
  return buildState(ctx, { rewards });
}

/**
 * The ribbon: show a delivered message in another supported language. Uses the
 * Sheet's own translation row for that locale (never machine translation) and
 * never touches `initial_locale`.
 */
export async function translateMessage(
  ctx: WorldCtx,
  messageId: string,
  locale: string,
): Promise<CottageStateResponse> {
  const key = `${ctx.userId}|${messageId}`;
  const existing = await ctx.gateway.findByPrimaryKey('27_PLAYER_MESSAGES', key, { bypass: true });
  if (!existing) throw new AppError('not_found', 'That message has not been delivered.');
  const group = (await loadMessageGroups(ctx)).find((g) => g.messageId === messageId);
  if (!group || !writtenLocales(group).includes(locale)) {
    throw new AppError('not_found', 'That translation is not available.');
  }
  await ctx.gateway.updateByPrimaryKey('27_PLAYER_MESSAGES', key, {
    current_translation_locale: locale,
    updated_at: ctx.now.toISOString(),
  });
  return buildState(ctx);
}

/**
 * Places (or clears, with `cropId: null`) an item in a decoration slot. A harvested crop is
 * consumed/returned as before; an *owned* permanent decoration (e.g. the birthday sunflower vase,
 * granted once via `grantOwnedDecoration`) is placed/cleared for free and is never consumed —
 * placing it never overwrites another slot, and it stays available for future placement.
 */
export async function setDecor(
  ctx: WorldCtx,
  slotId: string,
  cropId: string | null,
): Promise<CottageStateResponse> {
  await assertLocationAccess(ctx, 'cottage');
  const state = await buildState(ctx);
  if (!state.decor.slots.includes(slotId))
    throw new AppError('invalid_request', 'Unknown decoration slot.');
  const current = state.decor.placed[slotId];
  if (current === (cropId ?? undefined)) return state;
  const owned = new Set(state.decor.owned);
  if (cropId && !owned.has(cropId)) await consumeProduce(ctx, cropId, 1);
  if (current && !owned.has(current)) await returnProduce(ctx, current, 1);
  await mutateWorldDoc(ctx, 'cottage', (doc) => {
    if (cropId) doc.decor[slotId] = cropId;
    else delete doc.decor[slotId];
  });
  return buildState(ctx);
}

/**
 * Grants a permanent, non-consumable decoration once (idempotent — a retry with an id already
 * owned is a no-op). It becomes available to place in any Cottage decoration slot via `setDecor`,
 * and never auto-places itself into one, so it never overwrites whatever the player already has
 * displayed.
 */
export async function grantOwnedDecoration(ctx: WorldCtx, decorationId: string): Promise<void> {
  await mutateWorldDoc(ctx, 'cottage', (doc) => {
    if (!doc.ownedDecorations.includes(decorationId)) doc.ownedDecorations.push(decorationId);
  });
}
