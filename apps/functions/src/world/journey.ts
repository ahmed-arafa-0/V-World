import type {
  JourneyBeatView,
  JourneyPhase,
  JourneyStateResponse,
  WorldKeyView,
  WorldRewardView,
} from '@veoullas-world/contracts';
import { AppError } from '../errors/app-error.js';
import { appendEntryLogIfAbsent } from '../services/entry-log.service.js';
import { checkpointProgress } from '../services/player-progress.service.js';
import { getPlayerKeys } from '../services/player-keys.service.js';
import { parseJsonObject, readAppConfig, usable, type WorldCtx } from './common.js';
import { claimRuleReward } from './rewards.js';
import { mutateWorldDoc, readAllWorldDocs, type JourneyDoc, type WorldDocs } from './state.js';

export const FIRST_JOURNEY_ROUTE = 'first_journey';
/** Phase-1 route/beat that already covers the Gate, VAR reveal, Cove arrival and naming. */
const PHASE1_ROUTE = 'first_opening';
const PHASE1_DONE_BEAT = 'naming_complete';
const PHASE1_IMPLIED = ['gate_dials', 'gate_success', 'cat_name_gender'];
/** The interaction whose acknowledgment is the authoritative "Map unlocked" moment. */
const MAP_RECEIVE = 'map_receive';
const FORCE_FLAG_ID = 'force_first_journey';

interface BeatRow {
  beatId: string;
  sequence: number;
  locationId: string;
  sceneId: string;
  beatType: string;
  titleTextId: string;
  dialogueGroupId: string;
  requiredInteractionId: string;
  rewardRuleId: string;
  checkpoint: boolean;
  walkmanState: string;
}

interface Facts {
  docs: WorldDocs;
  implied: Set<string>;
  progress: { completed: boolean; mapUnlocked: boolean; storyVersion: string; completedAt: string };
  forced: boolean;
}

async function loadBeats(ctx: WorldCtx): Promise<BeatRow[]> {
  const table = await ctx.gateway.readTab('14_STORY_BEATS');
  return table.rows
    .filter((r) => r.values.enabled === true && r.raw.route_id === FIRST_JOURNEY_ROUTE)
    .map((r) => ({
      beatId: r.primaryKeyValue ?? '',
      sequence: Number(r.raw.sequence) || 0,
      locationId: r.raw.location_id ?? '',
      sceneId: r.raw.scene_id ?? '',
      beatType: r.raw.beat_type ?? '',
      titleTextId: r.raw.title_text_id ?? '',
      dialogueGroupId: r.raw.dialogue_group_id ?? '',
      requiredInteractionId: usable(r.raw.required_interaction_id)
        ? r.raw.required_interaction_id!
        : '',
      rewardRuleId: usable(r.raw.reward_rule_id) ? r.raw.reward_rule_id! : '',
      checkpoint: r.values.checkpoint === true,
      walkmanState: r.raw.walkman_state ?? '',
    }))
    .sort((a, b) => a.sequence - b.sequence);
}

async function loadFacts(ctx: WorldCtx, bypass = false): Promise<Facts> {
  const options = bypass ? { bypass: true } : undefined;
  const [docs, progressTab, keyRows, keyTable] = await Promise.all([
    readAllWorldDocs(ctx.gateway, ctx.userId, options),
    ctx.gateway.readTab('24_PLAYER_PROGRESS', options),
    getPlayerKeys(ctx.gateway, ctx.userId),
    ctx.gateway.readTab('21_KEYS'),
  ]);
  const mine = progressTab.rows.filter((r) => r.raw.user_id === ctx.userId);
  const journeyRow = mine.find((r) => r.raw.story_route_id === FIRST_JOURNEY_ROUTE);
  const opening = mine.find((r) => r.raw.story_route_id === PHASE1_ROUTE);

  const implied = new Set<string>();
  if (opening?.raw.current_beat_id === PHASE1_DONE_BEAT) {
    PHASE1_IMPLIED.forEach((id) => implied.add(id));
  }
  // The Beach signature (shell) is awarded by the Phase-1 flow; it counts once a Beach key is owned.
  const beachKeys = new Set(
    keyTable.rows.filter((k) => k.raw.location_id === 'beach').map((k) => k.primaryKeyValue),
  );
  if (keyRows.some((k) => beachKeys.has(k.keyTypeId) && k.quantityFound > 0)) {
    implied.add('beach_signature');
  }

  // The Admin's replay flag is set by hand; a copy up to 15 s old is plenty and saves a request per step.
  const flags = await ctx.gateway.readTab(
    '04_ADMIN_FLAGS',
    bypass ? { bypass: true, maxAgeMs: 15_000 } : undefined,
  );
  const flag = flags.rows.find(
    (f) =>
      f.primaryKeyValue === FORCE_FLAG_ID &&
      f.values.enabled === true &&
      (f.raw.value ?? '').trim() === '1' &&
      (!usable(f.raw.target_user_id) || f.raw.target_user_id === ctx.userId),
  );
  const rowForced = journeyRow?.values.force_first_journey === true;

  return {
    docs,
    implied,
    progress: {
      completed: journeyRow?.values.first_journey_completed === true,
      mapUnlocked: journeyRow?.values.map_unlocked === true,
      storyVersion: journeyRow?.raw.story_version ?? '',
      completedAt: journeyRow?.raw.completed_at ?? '',
    },
    forced: Boolean(flag) || rowForced,
  };
}

function phaseOf(facts: Facts): JourneyPhase {
  if (facts.docs.journey.replay) return 'replay';
  if (!facts.progress.completed) return 'original';
  return facts.forced ? 'replay_offer' : 'free';
}

function ackSet(doc: JourneyDoc, phase: JourneyPhase): Set<string> {
  return new Set(phase === 'replay' ? (doc.replay?.acks ?? []) : doc.acks);
}

/** True when the world facts satisfy a beat's required interaction. Unknown ids need an explicit acknowledgment. */
function interactionSatisfied(
  id: string,
  facts: Facts,
  acks: Set<string>,
  phase: JourneyPhase,
): boolean {
  const { docs } = facts;
  // A forced replay re-tells the story: every step is confirmed by the player again, so the
  // persisted proof of the original run (candles lit, songs opened, ...) must not auto-advance it.
  if (phase === 'replay') return acks.has(id);
  switch (id) {
    case 'church_first_interaction':
      return docs.church.candlesLitEver > 0;
    case 'cafe_first_interaction':
      return docs.cafe.gramophoneOpened;
    case 'arcade_intro_game':
      return docs.arcade.introWon;
    case 'first_message_delivery':
      return docs.cottage.firstMessageDelivered;
    case 'open_first_message':
      return docs.cottage.firstMessageOpened;
    case 'farm_first_interaction':
      return docs.farm.plantedFirst && docs.farm.wateredFirst;
    case 'museum_key_check':
      return docs.museum.entryVerified;
    case 'hall_artifact_view':
      return docs.museum.artifactViewed;
    default:
      // Phase-1 interactions are implied; everything else (cottage_enter,
      // walkman_receive, map_receive, and any interaction id a later Sheet
      // edit introduces) is a story acknowledgment the player must confirm.
      return facts.implied.has(id) || acks.has(id);
  }
}

function doneBeatIds(beats: BeatRow[], facts: Facts, phase: JourneyPhase): Set<string> {
  const done = new Set<string>();
  if (phase === 'free' || phase === 'replay_offer') {
    beats.forEach((b) => done.add(b.beatId));
    return done;
  }
  const doc = facts.docs.journey;
  const recorded = new Set(phase === 'replay' ? (doc.replay?.beats ?? []) : doc.beats);
  const lastImpliedSequence = Math.max(
    0,
    ...beats.filter((b) => PHASE1_IMPLIED.includes(b.requiredInteractionId)).map((b) => b.sequence),
  );
  let previousDone = true;
  for (const beat of beats) {
    const impliedByPhase1 = facts.implied.size > 0 && beat.sequence <= lastImpliedSequence;
    // A beat with no interaction (pure story) completes as soon as its predecessor has.
    const storyOnly: boolean = previousDone && beat.requiredInteractionId === '';
    const isDone: boolean = recorded.has(beat.beatId) || impliedByPhase1 || storyOnly;
    if (isDone) done.add(beat.beatId);
    previousDone = isDone;
  }
  return done;
}

function viewOf(beat: BeatRow, done: boolean): JourneyBeatView {
  return {
    beatId: beat.beatId,
    sequence: beat.sequence,
    locationId: beat.locationId,
    sceneId: beat.sceneId,
    beatType: beat.beatType,
    titleTextId: beat.titleTextId,
    dialogueGroupId: beat.dialogueGroupId,
    requiredInteractionId: beat.requiredInteractionId,
    rewardRuleId: beat.rewardRuleId,
    walkmanState: beat.walkmanState,
    done,
  };
}

/** Which locations a player may enter right now. */
function accessibleLocations(
  beats: BeatRow[],
  done: Set<string>,
  phase: JourneyPhase,
  allLocations: string[],
): string[] {
  if (phase === 'free' || phase === 'replay_offer') return allLocations;
  const current = beats.find((b) => !done.has(b.beatId));
  if (!current) return allLocations;
  const reached = new Set(
    beats.filter((b) => b.sequence <= current.sequence).map((b) => b.locationId),
  );
  return allLocations.filter((id) => reached.has(id));
}

export async function museumRequirement(
  ctx: WorldCtx,
): Promise<{ keyTypeId: string; required: number; owned: number }[]> {
  const [rules, keys, locations, owned] = await Promise.all([
    ctx.gateway.readTab('22_KEY_RULES'),
    ctx.gateway.readTab('21_KEYS'),
    ctx.gateway.readTab('11_LOCATIONS'),
    getPlayerKeys(ctx.gateway, ctx.userId),
  ]);
  const rule = rules.rows.find(
    (r) => r.values.enabled === true && r.raw.source_id === 'museum_key_check',
  );
  const explicit = parseJsonObject(rule?.raw.condition_json).required_keys;
  let required: Record<string, number> = {};
  if (explicit && typeof explicit === 'object' && !Array.isArray(explicit)) {
    for (const [keyTypeId, qty] of Object.entries(explicit as Record<string, unknown>)) {
      if (typeof qty === 'number' && qty > 0) required[keyTypeId] = qty;
    }
  } else {
    // Default set (Open in the Living Bible, editable in `condition_json.required_keys`):
    // one of every other enabled location's key that precedes the Everkeep on the first-visit route.
    const museum = locations.rows.find((l) => l.primaryKeyValue === 'museum');
    const museumOrder = Number(museum?.raw.first_visit_order) || Number.MAX_SAFE_INTEGER;
    const enabledKeys = new Set(
      keys.rows.filter((k) => k.values.enabled === true).map((k) => k.primaryKeyValue),
    );
    required = {};
    for (const location of locations.rows) {
      const order = Number(location.raw.first_visit_order) || 0;
      const keyTypeId = location.raw.key_type_id ?? '';
      if (
        location.values.enabled === true &&
        location.primaryKeyValue !== 'museum' &&
        order < museumOrder &&
        enabledKeys.has(keyTypeId)
      ) {
        required[keyTypeId] = 1;
      }
    }
  }
  return Object.entries(required).map(([keyTypeId, qty]) => ({
    keyTypeId,
    required: qty,
    owned: owned.find((k) => k.keyTypeId === keyTypeId)?.quantityAvailable ?? 0,
  }));
}

/** Read-only journey state (no writes; served from the gateway cache). */
export async function getJourneyState(ctx: WorldCtx): Promise<JourneyStateResponse> {
  const [beats, facts, config, keyTable, locationTable] = await Promise.all([
    loadBeats(ctx),
    loadFacts(ctx),
    readAppConfig(ctx.gateway),
    ctx.gateway.readTab('21_KEYS'),
    ctx.gateway.readTab('11_LOCATIONS'),
  ]);
  return buildState(ctx, beats, facts, config, keyTable, locationTable);
}

async function buildState(
  ctx: WorldCtx,
  beats: BeatRow[],
  facts: Facts,
  config: Map<string, string>,
  keyTable: Awaited<ReturnType<WorldCtx['gateway']['readTab']>>,
  locationTable: Awaited<ReturnType<WorldCtx['gateway']['readTab']>>,
): Promise<JourneyStateResponse> {
  const phase = phaseOf(facts);
  const done = doneBeatIds(beats, facts, phase);
  const current = beats.find((b) => !done.has(b.beatId)) ?? null;
  const allLocations = locationTable.rows
    .filter((l) => l.values.enabled === true && l.primaryKeyValue !== 'gate')
    .map((l) => l.primaryKeyValue ?? '');
  const owned = await getPlayerKeys(ctx.gateway, ctx.userId);
  const keys: WorldKeyView[] = keyTable.rows
    .filter((k) => k.values.enabled === true)
    .map((k) => ({
      keyTypeId: k.primaryKeyValue ?? '',
      locationId: k.raw.location_id ?? '',
      shape: k.raw.shape ?? '',
      iconId: usable(k.raw.icon_id) ? k.raw.icon_id! : '',
      quantity: owned.find((o) => o.keyTypeId === k.primaryKeyValue)?.quantityAvailable ?? 0,
    }));
  const completed = facts.progress.completed;
  const startLocation =
    completed && phase === 'free'
      ? (config.get('normal_start_location') ?? 'cottage')
      : (current?.locationId ?? 'map');
  return {
    ok: true,
    routeId: FIRST_JOURNEY_ROUTE,
    storyVersion: config.get('current_story_version') ?? facts.progress.storyVersion,
    phase,
    completed,
    mapUnlocked: facts.progress.mapUnlocked,
    forced: facts.forced,
    currentBeat: current ? viewOf(current, false) : null,
    beats: beats.map((b) => viewOf(b, done.has(b.beatId))),
    startLocation,
    accessibleLocations: accessibleLocations(beats, done, phase, allLocations),
    keys,
    walkmanUnlocked: facts.docs.cafe.walkmanUnlocked,
    museumRequirement: await museumRequirement(ctx),
  };
}

/** Throws unless the player may enter `locationId` right now. */
export async function assertLocationAccess(ctx: WorldCtx, locationId: string): Promise<void> {
  const state = await getJourneyState(ctx);
  if (!state.accessibleLocations.includes(locationId)) {
    throw new AppError('WORLD_LOCKED', 'This place is not open yet.');
  }
}

/**
 * Advances the first journey as far as the persisted world facts allow:
 * every beat whose required interaction is now satisfied is completed, its
 * reward rule claimed (idempotently) and a checkpoint written. Call after any
 * world mutation. Pure story acknowledgments only count once `acknowledge()`
 * recorded them — a client can never skip ahead.
 */
export async function syncJourney(ctx: WorldCtx): Promise<JourneyStateResponse> {
  const beats = await loadBeats(ctx);
  const advanced: { beatId: string; reward: WorldRewardView | null }[] = [];
  const completedNow: BeatRow[] = [];

  await ctx.mutex.run(`journey-sync:${ctx.userId}`, async () => {
    const facts = await loadFacts(ctx, true);
    const phase = phaseOf(facts);
    if (phase === 'free' || phase === 'replay_offer') return;
    await mutateWorldDoc(ctx, 'journey', (doc) => {
      const local: Facts = { ...facts, docs: { ...facts.docs, journey: doc } };
      for (;;) {
        const done = doneBeatIds(beats, local, phase);
        const current = beats.find((b) => !done.has(b.beatId));
        if (!current) break;
        const acks = ackSet(doc, phase);
        if (
          current.requiredInteractionId === '' ||
          !interactionSatisfied(current.requiredInteractionId, local, acks, phase)
        ) {
          break;
        }
        const target = phase === 'replay' ? doc.replay!.beats : doc.beats;
        target.push(current.beatId);
        completedNow.push(current);
      }
    });
  });

  for (const beat of completedNow) {
    const reward = beat.rewardRuleId ? await claimRuleReward(ctx, beat.rewardRuleId) : null;
    advanced.push({ beatId: beat.beatId, reward: reward ? toRewardView(reward) : null });
    const next = beats.find((b) => b.sequence > beat.sequence);
    if (beat.checkpoint || next) {
      await checkpointProgress(ctx.gateway, {
        userId: ctx.userId,
        routeId: FIRST_JOURNEY_ROUTE,
        beatId: next?.beatId ?? beat.beatId,
        checkpoint: beat.checkpoint,
        currentLocation: next?.locationId ?? beat.locationId,
        now: ctx.now,
      });
    }
  }

  const state = await getJourneyStateFresh(ctx);
  return advanced.length > 0 ? { ...state, advanced } : state;
}

function toRewardView(reward: Awaited<ReturnType<typeof claimRuleReward>>): WorldRewardView {
  return { ...reward };
}

async function getJourneyStateFresh(ctx: WorldCtx): Promise<JourneyStateResponse> {
  const [beats, facts, config, keyTable, locationTable] = await Promise.all([
    loadBeats(ctx),
    loadFacts(ctx, true),
    readAppConfig(ctx.gateway),
    ctx.gateway.readTab('21_KEYS'),
    ctx.gateway.readTab('11_LOCATIONS'),
  ]);
  return buildState(ctx, beats, facts, config, keyTable, locationTable);
}

/**
 * Records a story acknowledgment (`cottage_enter`, `walkman_receive`, `map_receive`, ...).
 * Only the CURRENT beat's own required interaction can be acknowledged, so the
 * order of the route can never be skipped from the client.
 */
export async function acknowledgeInteraction(
  ctx: WorldCtx,
  interactionId: string,
): Promise<JourneyStateResponse> {
  const beats = await loadBeats(ctx);
  const facts = await loadFacts(ctx, true);
  const phase = phaseOf(facts);
  if (phase === 'free' || phase === 'replay_offer') return getJourneyStateFresh(ctx);
  const done = doneBeatIds(beats, facts, phase);
  const current = beats.find((b) => !done.has(b.beatId));
  if (!current || current.requiredInteractionId !== interactionId) {
    throw new AppError('WORLD_INVALID_STATE', 'That step is not the current one in the journey.');
  }
  if (phase === 'original' && INTERACTIONS_WITH_PROOF.has(interactionId)) {
    throw new AppError(
      'WORLD_INVALID_STATE',
      'This step is completed by playing it, not by confirming.',
    );
  }
  // `walkman_receive` has a real side effect: the Walkman becomes available.
  if (interactionId === 'walkman_receive') {
    await mutateWorldDoc(ctx, 'cafe', (cafe) => {
      cafe.walkmanUnlocked = true;
    });
  }
  await mutateWorldDoc(ctx, 'journey', (doc) => {
    const acks = phase === 'replay' ? doc.replay!.acks : doc.acks;
    if (!acks.includes(interactionId)) acks.push(interactionId);
  });
  if (interactionId === MAP_RECEIVE) {
    await syncJourney(ctx);
    return completeFirstJourney(ctx);
  }
  return syncJourney(ctx);
}

/** Interactions that are verified from world state and can never be satisfied by a bare acknowledgment. */
const INTERACTIONS_WITH_PROOF = new Set([
  'church_first_interaction',
  'cafe_first_interaction',
  'arcade_intro_game',
  'first_message_delivery',
  'open_first_message',
  'farm_first_interaction',
  'museum_key_check',
  'hall_artifact_view',
]);

/**
 * The authoritative story-completion moment (Living Bible §18J beat 17). One
 * idempotent transaction: mark `first_journey_completed` + `map_unlocked`,
 * stamp the completion, clear the checkpoint, reset any consumed force flag,
 * and log it. Historical completion fields are never cleared by a replay.
 */
export async function completeFirstJourney(ctx: WorldCtx): Promise<JourneyStateResponse> {
  const beats = await loadBeats(ctx);
  const facts = await loadFacts(ctx, true);
  const phase = phaseOf(facts);
  const config = await readAppConfig(ctx.gateway);
  const done = doneBeatIds(beats, facts, phase);
  const remaining = beats.filter((b) => !done.has(b.beatId) && b.requiredInteractionId !== '');
  const onlyMapLeft = remaining.every((b) => b.requiredInteractionId === 'map_open');
  if (phase !== 'free' && !onlyMapLeft) {
    throw new AppError('WORLD_INVALID_STATE', 'The journey has not reached the Map yet.');
  }

  const key = `${ctx.userId}|${FIRST_JOURNEY_ROUTE}`;
  const nowIso = ctx.now.toISOString();
  const existing = await ctx.gateway.findByPrimaryKey('24_PLAYER_PROGRESS', key, { bypass: true });
  const patch: Record<string, string> = {
    status: 'completed',
    current_beat_id: '',
    last_checkpoint_id: '',
    current_location: config.get('normal_start_location') ?? 'cottage',
    first_journey_completed: 'TRUE',
    map_unlocked: 'TRUE',
    force_first_journey: 'FALSE',
    updated_at: nowIso,
  };
  if (!facts.progress.completed) {
    patch.completed_at = nowIso;
    patch.story_version = config.get('current_story_version') ?? '';
  }
  if (existing) {
    await ctx.gateway.updateByPrimaryKey('24_PLAYER_PROGRESS', key, patch);
  } else {
    await ctx.gateway.appendRow('24_PLAYER_PROGRESS', {
      user_route_key: key,
      user_id: ctx.userId,
      story_route_id: FIRST_JOURNEY_ROUTE,
      started_at: nowIso,
      completed_at: nowIso,
      story_version: config.get('current_story_version') ?? '',
      ...patch,
    });
  }
  // A completed forced replay consumes the Admin flag (historical completion fields stay).
  await resetForceFlag(ctx);
  await mutateWorldDoc(ctx, 'journey', (doc) => {
    delete doc.replay;
    for (const beat of beats) if (!doc.beats.includes(beat.beatId)) doc.beats.push(beat.beatId);
  });
  await appendEntryLogIfAbsent(
    ctx.gateway,
    `first_journey_completed:${ctx.userId}:${facts.progress.completed ? nowIso : 'original'}`,
    {
      eventType: 'first_journey_completed',
      accessResult: 'ok',
      timestamp: nowIso,
      ip: '',
      userId: ctx.userId,
      route: FIRST_JOURNEY_ROUTE,
      details: { event: 'first_journey_completed', replay: facts.progress.completed },
    },
  );
  return getJourneyStateFresh(ctx);
}

async function resetForceFlag(ctx: WorldCtx): Promise<void> {
  const flags = await ctx.gateway.readTab('04_ADMIN_FLAGS', { bypass: true });
  const flag = flags.rows.find(
    (f) =>
      f.primaryKeyValue === FORCE_FLAG_ID &&
      (f.raw.value ?? '').trim() === '1' &&
      (!usable(f.raw.target_user_id) || f.raw.target_user_id === ctx.userId),
  );
  if (flag) {
    await ctx.gateway.updateByPrimaryKey('04_ADMIN_FLAGS', FORCE_FLAG_ID, {
      value: '0',
      updated_at: ctx.now.toISOString(),
      updated_by: 'system',
    });
  }
}

/** Forced-replay choice: start the replay run, or skip it (which consumes the flag once). */
export async function chooseReplay(
  ctx: WorldCtx,
  action: 'start' | 'skip',
): Promise<JourneyStateResponse> {
  const facts = await loadFacts(ctx, true);
  if (phaseOf(facts) !== 'replay_offer') {
    throw new AppError('WORLD_INVALID_STATE', 'No replay is on offer.');
  }
  if (action === 'skip') {
    await resetForceFlag(ctx);
    const key = `${ctx.userId}|${FIRST_JOURNEY_ROUTE}`;
    await ctx.gateway.updateByPrimaryKey('24_PLAYER_PROGRESS', key, {
      force_first_journey: 'FALSE',
      updated_at: ctx.now.toISOString(),
    });
    return getJourneyStateFresh(ctx);
  }
  await mutateWorldDoc(ctx, 'journey', (doc) => {
    doc.replay = { beats: [], acks: [], startedAt: ctx.now.toISOString() };
  });
  return syncJourney(ctx);
}
