import type {
  CafeSongView,
  CafeStateResponse,
  SongRequestResponse,
} from '@veoullas-world/contracts';
import { AppError } from '../errors/app-error.js';
import { appendEntryLogIfAbsent } from '../services/entry-log.service.js';
import { getDayClock, isScheduledDue, scheduledDayKey, usable, type WorldCtx } from './common.js';
import { assertLocationAccess, syncJourney } from './journey.js';
import { resolveAssetRefs } from './media.js';
import { mutateWorldDoc, readWorldDoc } from './state.js';

const MAX_REQUEST_LENGTH = 200;
const MAX_REQUESTS_PER_DAY = 5;

/** Songs the Café may list: enabled, at the Café, titled, and already released. */
async function loadSongs(ctx: WorldCtx, locale: string) {
  const [clock, songs, uiText] = await Promise.all([
    getDayClock(ctx.gateway, ctx.now),
    ctx.gateway.readTab('20_SONGS'),
    ctx.gateway.readTab('08_UI_TEXT'),
  ]);
  const rows = songs.rows.filter(
    (s) =>
      s.values.enabled === true &&
      s.raw.location_id === 'cafe' &&
      usable(s.raw.title) &&
      isScheduledDue(s.raw.release_at, clock),
  );
  const refs = await resolveAssetRefs(
    ctx.gateway,
    rows.flatMap((s) => [s.raw.audio_asset_id ?? '', s.raw.cover_asset_id ?? '']),
  );
  const explanationFor = (textId: string | undefined): string => {
    if (!usable(textId)) return '';
    const candidates = uiText.rows.filter(
      (t) => t.values.enabled !== false && t.raw.text_id === textId && usable(t.raw.text),
    );
    return (
      candidates.find((t) => t.raw.locale === locale)?.raw.text ??
      candidates.find((t) => t.raw.locale === 'en')?.raw.text ??
      ''
    );
  };
  const views: CafeSongView[] = rows.map((s) => {
    const day = scheduledDayKey(s.raw.release_at, clock.timeZone);
    const releaseDay = day === null || day === 'invalid' ? 'first_visit' : day;
    return {
      songId: s.primaryKeyValue ?? '',
      title: s.raw.title!,
      artist: usable(s.raw.artist) ? s.raw.artist! : '',
      releaseDay,
      isToday: releaseDay === clock.today,
      coverRef: refs.get(s.raw.cover_asset_id ?? '') ?? null,
      audioRef: refs.get(s.raw.audio_asset_id ?? '') ?? null,
      explanation: explanationFor(s.raw.explanation_text_id),
      availableInWalkman: s.values.available_in_walkman === true,
    };
  });
  return { clock, views };
}

export async function getCafeState(ctx: WorldCtx, locale: string): Promise<CafeStateResponse> {
  const [{ clock, views }, doc] = await Promise.all([
    loadSongs(ctx, locale),
    readWorldDoc(ctx.gateway, ctx.userId, 'cafe'),
  ]);
  // Retained past songs stay listed; days are newest first, `first_visit` (the welcome song) last.
  const days = [...new Set(views.map((v) => v.releaseDay))].sort((a, b) => {
    if (a === 'first_visit') return 1;
    if (b === 'first_visit') return -1;
    return b.localeCompare(a);
  });
  return {
    ok: true,
    today: clock.today,
    releases: days.map((day) => ({ day, songs: views.filter((v) => v.releaseDay === day) })),
    gramophoneOpened: doc.gramophoneOpened,
    walkmanUnlocked: doc.walkmanUnlocked,
    walkman: doc.walkman,
    cardsRead: doc.cardsRead,
  };
}

/**
 * Opening the gramophone is the Café's first-visit interaction. Entering the
 * Café never starts a song — playback only ever begins from a deliberate tap.
 */
export async function openGramophone(ctx: WorldCtx, locale: string): Promise<CafeStateResponse> {
  await assertLocationAccess(ctx, 'cafe');
  await mutateWorldDoc(ctx, 'cafe', (doc) => {
    doc.gramophoneOpened = true;
  });
  const journey = await syncJourney(ctx);
  const state = await getCafeState(ctx, locale);
  return {
    ...state,
    rewards: (journey.advanced ?? []).flatMap((a) => (a.reward ? [a.reward] : [])),
  };
}

export async function readSongCard(
  ctx: WorldCtx,
  songId: string,
  locale: string,
): Promise<CafeStateResponse> {
  await assertLocationAccess(ctx, 'cafe');
  const { views } = await loadSongs(ctx, locale);
  if (!views.some((v) => v.songId === songId)) throw new AppError('not_found', 'Unknown song.');
  await mutateWorldDoc(ctx, 'cafe', (doc) => {
    if (!doc.cardsRead.includes(songId)) doc.cardsRead.push(songId);
  });
  return getCafeState(ctx, locale);
}

/**
 * Persists the Walkman's selected song across visits and devices. The
 * Walkman only exists once the journey's Walkman step unlocked it, and only
 * songs flagged `available_in_walkman` with a registered audio file can play.
 */
export async function setWalkmanSelection(
  ctx: WorldCtx,
  selection: { songId: string; playing: boolean } | null,
  locale: string,
): Promise<CafeStateResponse> {
  const doc = await readWorldDoc(ctx.gateway, ctx.userId, 'cafe', { bypass: true });
  if (!doc.walkmanUnlocked) throw new AppError('WORLD_LOCKED', 'The Walkman is not unlocked yet.');
  if (selection) {
    const [{ views }, church] = await Promise.all([loadSongs(ctx, locale), loadChurchHymnIds(ctx)]);
    const song = views.find((v) => v.songId === selection.songId);
    if (church.has(selection.songId) || !song || !song.availableInWalkman || !song.audioRef) {
      throw new AppError('invalid_request', 'That song cannot be played on the Walkman.');
    }
  }
  await mutateWorldDoc(ctx, 'cafe', (cafe) => {
    cafe.walkman = selection;
  });
  return getCafeState(ctx, locale);
}

/** Hymns belong to the Church and are never Walkman tracks. */
async function loadChurchHymnIds(ctx: WorldCtx): Promise<Set<string>> {
  const songs = await ctx.gateway.readTab('20_SONGS');
  return new Set(
    songs.rows.filter((s) => s.raw.location_id === 'church').map((s) => s.primaryKeyValue ?? ''),
  );
}

/**
 * A player's song request is written to the Admin-visible entry log for
 * Ahmed's review. It never touches `20_SONGS`, so nothing is published
 * automatically. Capped per day; a retry with the same client id is idempotent.
 */
export async function requestSong(
  ctx: WorldCtx,
  input: { text: string; clientRequestId: string },
  locale: string,
): Promise<SongRequestResponse> {
  await assertLocationAccess(ctx, 'cafe');
  const text = input.text.trim();
  if (text.length === 0 || text.length > MAX_REQUEST_LENGTH) {
    throw new AppError('invalid_request', `A request must be 1–${MAX_REQUEST_LENGTH} characters.`);
  }
  const clock = await getDayClock(ctx.gateway, ctx.now);
  const logs = await ctx.gateway.readTab('05_ENTRY_LOGS', { bypass: true });
  const todays = logs.rows.filter(
    (r) =>
      r.raw.event_type === 'song_request' &&
      r.raw.user_id === ctx.userId &&
      (r.raw.timestamp ?? '').startsWith(clock.today),
  );
  const requestId = `song_request:${ctx.userId}:${input.clientRequestId}`;
  if (
    !todays.some((r) => r.primaryKeyValue === requestId) &&
    todays.length >= MAX_REQUESTS_PER_DAY
  ) {
    throw new AppError('RATE_LIMITED', 'Too many song requests today. Try again tomorrow.');
  }
  await appendEntryLogIfAbsent(ctx.gateway, requestId, {
    eventType: 'song_request',
    accessResult: 'pending_review',
    timestamp: ctx.now.toISOString(),
    ip: '',
    userId: ctx.userId,
    language: locale,
    route: 'cafe',
    details: { text, status: 'pending_review' },
  });
  return { ok: true, status: 'pending_review', requestId };
}
