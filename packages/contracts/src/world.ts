/**
 * Phase 2 world contracts (M08–M14). Every shape is safe for the owner-
 * authenticated browser: no raw Drive IDs (media is a same-origin `mediaRef`),
 * no un-replaced `<PLACEHOLDER>` values, no correct quiz answers before an
 * answer is submitted, and no secret-achievement details before unlock.
 */

export type WorldLocationId =
  'gate' | 'beach' | 'church' | 'cafe' | 'arcade' | 'cottage' | 'farm' | 'museum' | 'map';

/* ------------------------------------------------------------------ */
/* Keys / rewards                                                       */
/* ------------------------------------------------------------------ */

export interface WorldRewardView {
  ruleId: string;
  keyTypeId: string;
  quantity: number;
  applied: boolean;
  reason: 'awarded' | 'already_claimed' | 'not_available' | 'cap_deferred' | 'rule_missing';
}

export interface WorldAchievementView {
  achievementId: string;
  applied: boolean;
  keyReward: WorldRewardView | null;
}

/**
 * The player-facing achievements list (a catalog/progress join, not a single event's result).
 * A secret achievement that is still locked never carries its title/description/icon/points —
 * only `secret: true` and `status: 'locked'`, so the browser cannot reveal what it is in advance.
 */
export interface PlayerAchievementView {
  achievementId: string;
  category: string;
  status: 'locked' | 'unlocked';
  secret: boolean;
  points: number;
  progressValue: number;
  unlockedAt: string;
  /** Same-origin media reference (never a raw Drive id); `null` when no icon is registered. */
  iconRef: string | null;
  title: string;
  description: string;
}

export interface WorldKeyView {
  keyTypeId: string;
  locationId: string;
  shape: string;
  iconId: string;
  quantity: number;
}

/* ------------------------------------------------------------------ */
/* First journey (M14 core, used by every location)                     */
/* ------------------------------------------------------------------ */

export interface JourneyBeatView {
  beatId: string;
  sequence: number;
  locationId: string;
  sceneId: string;
  beatType: string;
  titleTextId: string;
  dialogueGroupId: string;
  requiredInteractionId: string;
  rewardRuleId: string;
  walkmanState: string;
  done: boolean;
}

export type JourneyPhase = 'original' | 'replay_offer' | 'replay' | 'free';

export interface JourneyStateResponse {
  ok: true;
  routeId: string;
  storyVersion: string;
  phase: JourneyPhase;
  completed: boolean;
  mapUnlocked: boolean;
  forced: boolean;
  currentBeat: JourneyBeatView | null;
  beats: JourneyBeatView[];
  /** Where the client starts: the Cottage after completion, otherwise the current beat's location. */
  startLocation: string;
  accessibleLocations: string[];
  keys: WorldKeyView[];
  walkmanUnlocked: boolean;
  /** Keys still missing for the Everkeep entrance, resolved server-side. */
  museumRequirement: { keyTypeId: string; required: number; owned: number }[];
  /** Beats finished by this request (advance/ack responses only). */
  advanced?: { beatId: string; reward: WorldRewardView | null }[];
}

/* ------------------------------------------------------------------ */
/* M08 Church                                                           */
/* ------------------------------------------------------------------ */

export interface ChurchTextView {
  contentId: string;
  title: string;
  text: string;
  reference: string;
  locale: string;
  direction: 'ltr' | 'rtl';
  imageRefs: string[];
  activeDate: string;
}

export interface ChurchQuizQuestionView {
  questionId: string;
  question: string;
  questionType: 'multiple_choice' | 'true_false';
  options: { id: string; text: string }[];
  locale: string;
  direction: 'ltr' | 'rtl';
  answered: boolean;
}

export interface ChurchStateResponse {
  ok: true;
  today: string;
  verse: ChurchTextView | null;
  story: ChurchTextView | null;
  gallery: ChurchTextView[];
  photo: ChurchTextView | null;
  hymns: { songId: string; title: string; artist: string; audioRef: string | null }[];
  /** The Gospel reading that replaced the hymn feature in the player experience (Ahmed's decision, 2026-09-22, Living Bible §18B-1). Null until `audio_church_gospel_reading` is registered/enabled. */
  gospelReadingAudioRef: string | null;
  quiz: {
    questions: ChurchQuizQuestionView[];
    completed: boolean;
    perfect: boolean;
    wrongAttempts: number;
  };
  candles: {
    /** The candles currently placed in the tray (player-arranged via Add/Remove), in display order. */
    slots: string[];
    lit: string[];
    preserved: string[];
    litToday: number;
    /** Max candles the tray holds at once (`church_candle_slots`, reused as the arrangement capacity). */
    capacity: number;
    /** Recent Add operation receipts, for reconciling a lost response without creating another candle. */
    addRequests?: Record<string, string>;
  };
  /** True until the player has performed the first-visit interaction (lighting a candle). */
  firstInteractionDone: boolean;
  /** Rewards/achievements produced by the request (mutation responses only). */
  rewards?: WorldRewardView[];
  achievements?: WorldAchievementView[];
}

export interface ChurchAnswerResponse {
  ok: true;
  correct: boolean;
  explanation: string;
  reference: string;
  completed: boolean;
  perfect: boolean;
  state: ChurchStateResponse;
}

/* ------------------------------------------------------------------ */
/* M09 Vinyl Café + Walkman                                             */
/* ------------------------------------------------------------------ */

export interface CafeSongView {
  songId: string;
  title: string;
  artist: string;
  /** Authoritative release day (`YYYY-MM-DD`), or `first_visit` for songs available from the first visit. */
  releaseDay: string;
  isToday: boolean;
  coverRef: string | null;
  audioRef: string | null;
  explanation: string;
  availableInWalkman: boolean;
}

export interface CafeStateResponse {
  ok: true;
  today: string;
  /** One entry per release day, newest first; several songs may share a day. */
  releases: { day: string; songs: CafeSongView[] }[];
  gramophoneOpened: boolean;
  walkmanUnlocked: boolean;
  walkman: { songId: string; playing: boolean } | null;
  cardsRead: string[];
  rewards?: WorldRewardView[];
}

export interface SongRequestResponse {
  ok: true;
  /** Always `pending_review`: a request is written for Admin review and never published automatically. */
  status: 'pending_review';
  requestId: string;
}

/* ------------------------------------------------------------------ */
/* M10 VARcade                                                          */
/* ------------------------------------------------------------------ */

export interface ArcadeGameView {
  gameId: string;
  cabinetSlot: number;
  family: string;
  displayNameTextId: string;
  /** Installed cabinets are the Sheet-enabled ones; up to five slots are supported. */
  installed: boolean;
  unlocked: boolean;
  keyCost: { keyTypeId: string; quantity: number };
  canAfford: boolean;
  walkmanVolumePercent: number;
  sfxEnabled: boolean;
  musicEnabled: boolean;
  /** Server-computed adaptive difficulty for the next attempt (1–5). */
  difficulty: number;
  scoreMode: string;
  personalBest: number | null;
  attempts: number;
  recent: { playedAt: string; score: number; result: string }[];
}

export interface ArcadeStateResponse {
  ok: true;
  supportedSlots: number;
  games: ArcadeGameView[];
  tokens: number;
  introWon: boolean;
  rewards?: WorldRewardView[];
  achievements?: WorldAchievementView[];
}

export interface ArcadeAttemptResponse {
  ok: true;
  attemptId: string;
  duplicate: boolean;
  personalBest: boolean;
  nextDifficulty: number;
  state: ArcadeStateResponse;
}

/** A Trivia cabinet question, sent to the client WITHOUT `correct_answer` — that is validated server-side only. */
export interface TriviaQuestionView {
  questionId: string;
  question: string;
  questionType: 'multiple_choice' | 'true_false';
  options: { id: string; text: string }[];
  locale: string;
  direction: 'ltr' | 'rtl';
}

export interface TriviaQuestionsResponse {
  ok: true;
  questions: TriviaQuestionView[];
}

export interface TriviaAnswerResponse {
  ok: true;
  correct: boolean;
  explanation: string;
}

/* ------------------------------------------------------------------ */
/* M11 Cottage, Mailbox, Marcelino                                      */
/* ------------------------------------------------------------------ */

export interface MailboxMessageView {
  messageId: string;
  messageType: string;
  important: boolean;
  senderId: string;
  deliveredAt: string;
  readStatus: 'unread' | 'read' | 'archived';
  /** Locale randomly chosen at delivery; never changed by translating. */
  initialLocale: string;
  /** Locale currently displayed (the ribbon translation, or the initial one). */
  shownLocale: string;
  availableLocales: string[];
  text: string;
  direction: 'ltr' | 'rtl';
  imageRefs: string[];
  /** Ahmed's optional personal voice note (a mailbox feature, never narration); null when absent. */
  voiceNoteRef: string | null;
  /** True when the message has no written content yet (placeholder in the Sheet). */
  contentPending: boolean;
}

export interface CountdownView {
  eventId: string;
  name: string;
  targetAt: string;
  completed: boolean;
  /** Set once the countdown finished: it becomes a framed memory bearing this date. */
  completedDate: string | null;
}

export interface CottageStateResponse {
  ok: true;
  entered: boolean;
  unreadCount: number;
  messages: MailboxMessageView[];
  countdown: CountdownView | null;
  /** Authoritative server time, so the countdown never trusts the device clock. */
  serverNow: string;
  marcelino: {
    visible: boolean;
    at: 'cottage' | 'farm' | 'away';
    deliveries: number;
    learningStage: number;
  };
  window: {
    timeOfDay: 'dawn' | 'day' | 'dusk' | 'night';
    weather: 'clear' | 'rain' | 'unknown';
  };
  decor: { slots: string[]; placed: Record<string, string>; owned: string[] };
  varName: string;
  /** Harvested produce usable for decoration. */
  produce: Record<string, number>;
  rewards?: WorldRewardView[];
}

export interface MailboxDeliveryResponse {
  ok: true;
  /** Delivered messages grouped as Marcelino carries them: an important message alone, the rest together. */
  batches: MailboxMessageView[][];
  state: CottageStateResponse;
}

/* ------------------------------------------------------------------ */
/* M12 Sunberry Fields                                                  */
/* ------------------------------------------------------------------ */

export type FarmPlotState = 'empty' | 'planted' | 'growing' | 'ready' | 'wilted';

export interface FarmPlotView {
  plotId: string;
  cropId: string | null;
  state: FarmPlotState;
  plantedAt: string;
  nextWaterDueAt: string;
  readyAt: string;
  wiltedAt: string;
  progressPercent: number;
  needsWater: boolean;
}

export interface FarmCropView {
  cropId: string;
  displayNameTextId: string;
  growHours: number;
  wateringIntervalHours: number;
  harvestYield: number;
  rarity: string;
  seeds: number;
  produce: number;
}

export interface FarmStateResponse {
  ok: true;
  plots: FarmPlotView[];
  crops: FarmCropView[];
  weather: 'raining' | 'dry' | 'unavailable';
  barn: { unlocked: boolean };
  marcelinoHere: boolean;
  harvests: number;
  rewards?: WorldRewardView[];
  achievements?: WorldAchievementView[];
  /** Plots watered by real rain during this request. */
  rainWatered?: string[];
}

/* ------------------------------------------------------------------ */
/* M13 The Everkeep                                                     */
/* ------------------------------------------------------------------ */

export interface MuseumExhibitView {
  exhibitId: string;
  wingId: string;
  positionId: string;
  exhibitType: string;
  /** Locked secret slots expose nothing but their position. */
  locked: boolean;
  secret: boolean;
  displayNameTextId: string;
  imageRefs: string[];
  audioRef: string | null;
  pdfRef: string | null;
  /**
   * A validated `https://` external link (`exhibit_type: 'archive_portal'`
   * only) — the one deliberate exception to "media comes from Drive": an
   * existing external site, opened in a new tab, never embedded and never
   * proxied through this backend. `null` when the exhibit isn't an archive
   * link, or its configured `source_content_id` isn't a well-formed
   * `https://` URL.
   */
  archiveUrl: string | null;
  bookPage: number;
  viewCount: number;
}

export interface MuseumStateResponse {
  ok: true;
  entrance: {
    open: boolean;
    requirement: { keyTypeId: string; required: number; owned: number }[];
    puzzleRequired: boolean;
    puzzleSolved: boolean;
  };
  hall: {
    artifactViewed: boolean;
    progress: { locationId: string; keyTypeId: string; owned: boolean; visited: boolean }[];
  };
  wings: { wingId: string; locked: boolean; exhibits: MuseumExhibitView[] }[];
  rewards?: WorldRewardView[];
}

/* ------------------------------------------------------------------ */
/* M14 Living Map                                                       */
/* ------------------------------------------------------------------ */

export interface MapLocationView {
  locationId: string;
  mapOrder: number;
  roadSide: string;
  elevationBand: string;
  keyTypeId: string;
  /** Shown as mist/vines on the Map. */
  locked: boolean;
  visited: boolean;
}

export interface MapStateResponse {
  ok: true;
  unlocked: boolean;
  currentLocation: string;
  locations: MapLocationView[];
}

/* ------------------------------------------------------------------ */
/* Scripted companion hints                                             */
/* ------------------------------------------------------------------ */

/**
 * A single authored, localized companion line for the player's current
 * location and journey state — never AI-generated, never a promise of
 * unavailable content. `null` `hint` means nothing eligible is authored for
 * this location/state right now (a normal, common case, not an error).
 */
export interface CompanionHintResponse {
  ok: true;
  hint: { hintId: string; text: string; direction: 'ltr' | 'rtl' } | null;
}

/* ------------------------------------------------------------------ */
/* birthday_2026 (M16 narrow scope: single Cottage-garden celebration)  */
/* ------------------------------------------------------------------ */

/**
 * `before`: earlier than the last 20 seconds — nothing is offered.
 * `countdown`: within the final 20 seconds before `targetAt` — a live, server-clock countdown applies.
 * `live`: at or after `targetAt` and before `endAt` — the full celebration is claimable; a countdown
 * step, if entered now, is an explicitly labelled cinematic replay, never the live moment.
 * `after`: at or after `endAt` — no fresh invitation; a completed player may still replay.
 */
export type BirthdayWindow = 'before' | 'countdown' | 'live' | 'after';

export interface BirthdayStageView {
  dismissedAt: string;
  acceptedAt: string;
  wish: string;
  wishSkippedAt: string;
  candleExtinguished: boolean;
  giftsClaimed: boolean;
  /** Set once, the first time the sequence is finished; never overwritten by a later replay. */
  completedAt: string;
  replayCount: number;
}

export interface BirthdayLetterView {
  text: string;
  direction: 'ltr' | 'rtl';
  imageRefs: string[];
  /** True when this player has no written letter text yet in their locale/English fallback. */
  contentPending: boolean;
}

export interface BirthdayAchievementView {
  achievementId: string;
  unlocked: boolean;
  /** Hidden (empty) while locked, exactly like the general achievements list. */
  title: string;
  description: string;
  iconRef: string | null;
}

export interface BirthdayStateResponse {
  ok: true;
  /** False when `birthday_2026` is missing/disabled in `17_EVENTS` — the overlay never renders. */
  enabled: boolean;
  eventId: string;
  targetAt: string;
  endAt: string;
  timeZone: string;
  /** Authoritative server time; the client clock is never trusted for the countdown. */
  serverNow: string;
  window: BirthdayWindow;
  stage: BirthdayStageView;
  /** The player's own companion (Living Bible: a cat-like companion), name/gender as chosen. */
  cat: { name: string; gender: string };
  /** Null until the message exists/enabled for this player; `contentPending` distinguishes "not written yet". */
  letter: BirthdayLetterView | null;
  achievement: BirthdayAchievementView | null;
  /** Same-origin media refs (never raw Drive ids); null while the art is unregistered — render a
   * clearly labelled temporary visual instead, never invent or assume the asset exists. */
  media: {
    gardenDesktopRef: string | null;
    gardenPortraitRef: string | null;
    cakeRef: string | null;
    decorationRef: string | null;
    /** Instantiated three times on the cake by the client; one shared media pair for all three. */
    candleUnlitRef: string | null;
    candleFlameRef: string | null;
  };
}

/** The two stored companion genders. Labels are localized from the Sheet (`world_gender_male` / `world_gender_female`). */
export const CANONICAL_GENDERS = ['male', 'female'] as const;
export type CanonicalGender = (typeof CANONICAL_GENDERS)[number];

/**
 * Compatibility read for a stored `selected_gender`: an exact male/female
 * (any case) maps to its canonical value; anything else — older free-text rows —
 * returns null. Nothing is ever assigned on the player's behalf and no row is rewritten.
 */
export function readStoredGender(value: string | null | undefined): CanonicalGender | null {
  const v = (value ?? '').trim().toLowerCase();
  return (CANONICAL_GENDERS as readonly string[]).includes(v) ? (v as CanonicalGender) : null;
}
