import { headerFor, row } from '@veoullas-world/test-fixtures';
import { claimRuleReward } from '../../src/world/rewards.js';
import { mutateWorldDoc } from '../../src/world/state.js';
import type { WorldCtx } from '../../src/world/common.js';
import { appendRows, completePhase1, WORLD_USER } from './world-fixture.js';

type Tab = Parameters<typeof headerFor>[0];
type Workbook = Record<string, string[][]>;

const BEAT_ORDER = [
  'beat_01_boot',
  'beat_02_gate',
  'beat_03_var_reveal',
  'beat_04_gate_open',
  'beat_05_beach',
  'beat_06_naming',
  'beat_07_church',
  'beat_08_cafe',
  'beat_09_walkman',
  'beat_10_arcade',
  'beat_11_cottage',
  'beat_12_marcelino',
  'beat_13_message',
  'beat_14_farm',
  'beat_15_museum_approach',
  'beat_16_hall',
  'beat_17_map_unlock',
  'beat_18_complete',
];
const BEAT_REWARDS: Record<string, string> = {
  beat_07_church: 'rule_first_candle',
  beat_08_cafe: 'rule_first_music',
  beat_10_arcade: 'rule_first_token',
  beat_12_marcelino: 'rule_first_letter',
  beat_14_farm: 'rule_first_sunflower',
};

function replaceTabRows(wb: Workbook, tab: Tab, rows: string[][]): void {
  wb[tab] = [headerFor(tab), ...rows];
}

/** Marks the first journey done up to (not including) `beatId`, granting the keys those beats pay. */
export async function unlockThrough(ctx: WorldCtx, beatId: string): Promise<void> {
  const upTo = BEAT_ORDER.slice(0, BEAT_ORDER.indexOf(beatId));
  await completePhase1(ctx.gateway, ctx.userId);
  await mutateWorldDoc(ctx, 'journey', (doc) => {
    doc.beats = upTo;
  });
  await mutateWorldDoc(ctx, 'cafe', (doc) => {
    doc.walkmanUnlocked = upTo.includes('beat_09_walkman');
  });
  for (const id of upTo) {
    const rule = BEAT_REWARDS[id];
    if (rule) await claimRuleReward(ctx, rule);
  }
}

export function addCafeContent(wb: Workbook): void {
  const song = (id: string, title: string, release: string, extra: Record<string, string> = {}) =>
    row('20_SONGS', {
      song_id: id,
      title,
      artist: 'Fixture Artist',
      release_at: release,
      location_id: 'cafe',
      audio_asset_id: `audio_${id}`,
      cover_asset_id: `cover_${id}`,
      explanation_text_id: `expl_${id}`,
      available_in_walkman: 'TRUE',
      enabled: 'TRUE',
      ...extra,
    });
  replaceTabRows(wb, '20_SONGS', [
    song('song_welcome', 'Welcome Song', '<FIRST_VISIT>'),
    song('song_today_a', 'Today A', '2026-09-26'),
    song('song_today_b', 'Today B', '2026-09-26'),
    song('song_old', 'Old Song', '2026-09-01'),
    song('song_future', 'Future Song', '2026-10-30'),
    song('song_placeholder', '<WELCOME SONG>', '<FIRST_VISIT>'),
    row('20_SONGS', {
      song_id: 'hymn_1',
      title: 'Fixture Hymn',
      release_at: '<FIRST_VISIT>',
      location_id: 'church',
      audio_asset_id: 'audio_hymn_1',
      available_in_walkman: 'TRUE',
      enabled: 'TRUE',
    }),
  ]);
  const asset = (id: string, type: string) =>
    row('10_ASSETS', {
      asset_id: id,
      asset_type: type,
      drive_file_id: `drive_${id}`,
      enabled: 'TRUE',
      version: '1',
    });
  appendRows(wb, '10_ASSETS', [
    asset('audio_song_welcome', 'audio'),
    asset('audio_song_today_a', 'audio'),
    asset('cover_song_today_a', 'image'),
    asset('audio_hymn_1', 'audio'),
  ]);
  appendRows(wb, '08_UI_TEXT', [
    row('08_UI_TEXT', {
      ui_text_row_id: 'ex_en',
      text_id: 'expl_song_today_a',
      locale: 'en',
      text: 'Why this song',
      enabled: 'TRUE',
    }),
    row('08_UI_TEXT', {
      ui_text_row_id: 'ex_ar',
      text_id: 'expl_song_today_a',
      locale: 'ar-EG',
      text: 'ليه الأغنية دي',
      enabled: 'TRUE',
    }),
  ]);
}

export function addArcadeContent(wb: Workbook): void {
  const game = (id: string, slot: number, family: string, cost: number, enabled = true) =>
    row('32_ARCADE_GAMES', {
      game_id: id,
      cabinet_slot: String(slot),
      display_name_text_id: `${id}_name`,
      game_family: family,
      key_cost_type_id: cost ? 'key_token' : '',
      key_cost_quantity: String(cost),
      difficulty_mode: 'adaptive',
      score_mode: 'score',
      walkman_volume_percent: '25',
      music_enabled: 'TRUE', // the Sheet says yes; the runtime must still never enable game music
      sfx_enabled: 'TRUE',
      enabled: enabled ? 'TRUE' : 'FALSE',
    });
  replaceTabRows(wb, '32_ARCADE_GAMES', [
    game('game_memory', 1, 'memory_cards', 0),
    game('game_catch', 2, 'catch_items', 2),
    game('game_puzzle', 3, 'picture_puzzle', 3),
    game('game_maze', 4, 'var_maze', 4, false),
    game('game_trivia', 5, 'trivia', 5, false),
  ]);
  appendRows(wb, '23_ACHIEVEMENTS', [
    row('23_ACHIEVEMENTS', {
      achievement_id: 'ach_arcade_three',
      category: 'arcade',
      trigger_type: 'arcade',
      trigger_rule_json: '{"game_id":"game_memory","attempts":3}',
      reward_quantity: '0',
      enabled: 'TRUE',
    }),
  ]);
}

export function addArcadeTriviaContent(wb: Workbook): void {
  replaceTabRows(wb, '42_ARCADE_TRIVIA', [
    row('42_ARCADE_TRIVIA', {
      question_row_id: 'triv_1_en',
      question_id: 'triv_1',
      locale: 'en',
      question: 'Which shape is the Farm key?',
      question_type: 'multiple_choice',
      option_a: 'Sunflower',
      option_b: 'Candle',
      option_c: 'Shell',
      option_d: 'Envelope',
      correct_answer: 'a',
      explanation: 'The Farm key is sunflower-shaped.',
      enabled: 'TRUE',
      review_status: 'pending_review',
    }),
    row('42_ARCADE_TRIVIA', {
      question_row_id: 'triv_1_ar',
      question_id: 'triv_1',
      locale: 'ar-EG',
      question: 'مفتاح المزرعة شكله إيه؟',
      question_type: 'multiple_choice',
      option_a: 'عباد شمس',
      option_b: 'شمعة',
      option_c: 'صدفة',
      option_d: 'ظرف',
      correct_answer: 'a',
      explanation: 'مفتاح المزرعة شكله زهرة عباد الشمس.',
      enabled: 'TRUE',
      review_status: 'pending_review',
    }),
    row('42_ARCADE_TRIVIA', {
      question_row_id: 'triv_2_en',
      question_id: 'triv_2',
      locale: 'en',
      question: 'The Café key is music-note shaped.',
      question_type: 'true_false',
      correct_answer: 'true',
      explanation: 'Yes — the Café key is a music note.',
      enabled: 'TRUE',
      review_status: 'pending_review',
    }),
    row('42_ARCADE_TRIVIA', {
      question_row_id: 'triv_3_disabled_en',
      question_id: 'triv_3_disabled',
      locale: 'en',
      question: 'Not yet reviewed.',
      question_type: 'true_false',
      correct_answer: 'true',
      explanation: '',
      enabled: 'FALSE',
      review_status: 'pending_review',
    }),
  ]);
}

export function addFarmContent(wb: Workbook): void {
  const crop = (
    id: string,
    grow: number,
    water: number,
    wilt: number,
    yieldQty: number,
    rain = true,
  ) =>
    row('28_FARM_CROPS', {
      crop_id: id,
      display_name_text_id: `crop_${id}`,
      grow_hours: String(grow),
      watering_interval_hours: String(water),
      wilt_after_hours: String(wilt),
      rain_waters: rain ? 'TRUE' : 'FALSE',
      harvest_yield: String(yieldQty),
      rarity: 'common',
      enabled: 'TRUE',
    });
  replaceTabRows(wb, '28_FARM_CROPS', [
    crop('sunflower', 72, 24, 36, 1),
    crop('mango', 168, 48, 72, 3),
    crop('blueberry', 96, 24, 36, 5, false),
  ]);
  appendRows(wb, '01_APP_CONFIG', [
    row('01_APP_CONFIG', { config_key: 'real_weather_enabled', value: 'TRUE', enabled: 'TRUE' }),
    row('01_APP_CONFIG', { config_key: 'weather_latitude', value: '30.0', enabled: 'TRUE' }),
    row('01_APP_CONFIG', { config_key: 'weather_longitude', value: '31.0', enabled: 'TRUE' }),
  ]);
  appendRows(wb, '23_ACHIEVEMENTS', [
    row('23_ACHIEVEMENTS', {
      achievement_id: 'ach_first_harvest',
      category: 'farm',
      trigger_type: 'farm',
      trigger_rule_json: '{"harvest_count":1}',
      reward_quantity: '0',
      enabled: 'TRUE',
    }),
  ]);
}

export function addCottageContent(wb: Workbook): void {
  const msg = (
    id: string,
    locale: string,
    text: string,
    delivery: string,
    priority: string,
    extra: Record<string, string> = {},
  ) =>
    row('19_MESSAGES', {
      message_row_id: `${id}_${locale}`,
      message_id: id,
      sender_id: 'admin_ahmed',
      recipient_user_id: WORLD_USER,
      delivery_at: delivery,
      priority,
      message_type: 'letter',
      locale,
      text,
      direction: locale === 'ar-EG' ? 'rtl' : 'ltr',
      archive_after_open: 'TRUE',
      enabled: 'TRUE',
      ...extra,
    });
  replaceTabRows(wb, '19_MESSAGES', [
    msg('msg_welcome_ahmed', 'en', 'Fixture first message', '<FIRST_VISIT>', '1'),
    msg('msg_welcome_ahmed', 'ar-EG', 'رسالة الاختبار الأولى', '<FIRST_VISIT>', '1'),
    msg('msg_plain_a', 'en', 'Plain A', '2026-09-26', '2'),
    msg('msg_plain_b', 'en', 'Plain B', '2026-09-26', '2'),
    msg('msg_important', 'en', 'Important one', '2026-09-26', '1'),
    msg('msg_future', 'en', 'Not yet', '2026-12-01', '2'),
    msg('msg_unwritten', 'en', '<WRITE THIS>', '2026-09-26', '2'),
  ]);
  appendRows(wb, '17_EVENTS', [
    row('17_EVENTS', {
      event_id: 'birthday_fixture',
      event_name: 'Fixture Event',
      event_type: 'birthday',
      target_at: '2026-10-01T00:00:00.000Z',
      enabled: 'TRUE',
    }),
  ]);
  appendRows(wb, '01_APP_CONFIG', [
    row('01_APP_CONFIG', {
      config_key: 'current_event_id',
      value: 'birthday_fixture',
      enabled: 'TRUE',
    }),
  ]);
}

export function addMuseumContent(wb: Workbook): void {
  replaceTabRows(wb, '34_MUSEUM_EXHIBITS', [
    row('34_MUSEUM_EXHIBITS', {
      exhibit_id: 'exhibit_story',
      wing_id: 'stories_wing',
      display_name_text_id: 'exhibit_story_name',
      exhibit_type: 'archive_portal',
      unlock_type: 'story_progress',
      unlock_rule_json: '{"route":"first_journey"}',
      position_id: 'book_01',
      personal_only: 'TRUE',
      enabled: 'TRUE',
    }),
    row('34_MUSEUM_EXHIBITS', {
      exhibit_id: 'exhibit_secret_001',
      wing_id: 'secret_wing',
      exhibit_type: 'empty_secret_slot',
      unlock_type: 'achievement',
      unlock_rule_json: '{"achievement_id":"ach_secret_001"}',
      display_name_text_id: 'SECRET_TITLE_MUST_NOT_LEAK',
      position_id: 'secret_01',
      personal_only: 'TRUE',
      enabled: 'TRUE',
    }),
    row('34_MUSEUM_EXHIBITS', {
      exhibit_id: 'exhibit_event',
      wing_id: 'memories_wing',
      display_name_text_id: 'exhibit_event_name',
      exhibit_type: 'birthday_memory',
      unlock_type: 'event_complete',
      unlock_rule_json: '{"event_id":"birthday_2026"}',
      position_id: 'memory_2026',
      personal_only: 'TRUE',
      enabled: 'TRUE',
    }),
  ]);
}
