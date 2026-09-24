import { buildM02Workbook, headerFor, row } from '@veoullas-world/test-fixtures';
import { KeyMutex } from '../../src/repositories/key-mutex.js';
import { SheetGateway } from '../../src/repositories/sheet-gateway.js';
import type { WorldCtx } from '../../src/world/common.js';
import { FakeGoogleSheetsClient } from './fake-sheets-client.js';

type Tab = Parameters<typeof headerFor>[0];
type Workbook = Record<string, string[][]>;

/** The instant every world test runs at (matches the fixture content's `active_date`). */
export const WORLD_NOW = new Date('2026-09-26T10:00:00.000Z');
export const WORLD_USER = 'world_test_user';

const BEATS: [string, string, string, string, string, string, boolean][] = [
  ['beat_01_boot', 'gate', 'cinematic', '', '', '', true],
  ['beat_02_gate', 'gate', 'interaction', 'gate_dials', '', '', true],
  ['beat_03_var_reveal', 'gate', 'dialogue', '', '', '', true],
  ['beat_04_gate_open', 'gate', 'cinematic', 'gate_success', '', '', true],
  ['beat_05_beach', 'beach', 'location_intro', 'beach_signature', 'rule_first_shell', '', true],
  ['beat_06_naming', 'beach', 'choice', 'cat_name_gender', '', '', true],
  [
    'beat_07_church',
    'church',
    'location_intro',
    'church_first_interaction',
    'rule_first_candle',
    '',
    true,
  ],
  [
    'beat_08_cafe',
    'cafe',
    'location_intro',
    'cafe_first_interaction',
    'rule_first_music',
    'unlock',
    true,
  ],
  ['beat_09_walkman', 'cafe', 'unlock', 'walkman_receive', '', 'available', true],
  ['beat_10_arcade', 'arcade', 'location_intro', 'arcade_intro_game', 'rule_first_token', '', true],
  ['beat_11_cottage', 'cottage', 'location_intro', 'cottage_enter', '', '', true],
  [
    'beat_12_marcelino',
    'cottage',
    'delivery',
    'first_message_delivery',
    'rule_first_letter',
    '',
    true,
  ],
  ['beat_13_message', 'cottage', 'message', 'open_first_message', '', '', true],
  [
    'beat_14_farm',
    'farm',
    'location_intro',
    'farm_first_interaction',
    'rule_first_sunflower',
    '',
    true,
  ],
  [
    'beat_15_museum_approach',
    'museum',
    'unlock',
    'museum_key_check',
    'rule_museum_unlock',
    '',
    true,
  ],
  ['beat_16_hall', 'museum', 'location_intro', 'hall_artifact_view', '', '', true],
  ['beat_17_map_unlock', 'museum', 'unlock', 'map_receive', '', '', true],
  ['beat_18_complete', 'map', 'completion', 'map_open', '', '', true],
];

const LOCATIONS: [string, string, string, number][] = [
  ['gate', '', '', 1],
  ['beach', 'key_shell', 'shell', 2],
  ['church', 'key_candle', 'candle', 3],
  ['cafe', 'key_music', 'music_note', 4],
  ['arcade', 'key_token', 'retro_token', 5],
  ['cottage', 'key_letter', 'letter_envelope', 6],
  ['farm', 'key_sunflower', 'sunflower', 7],
  ['museum', 'key_everkeep', 'ancient_golden', 8],
];

const RULES: [string, string, string, string][] = [
  ['rule_first_shell', 'key_shell', 'beat_05_beach', ''],
  ['rule_first_candle', 'key_candle', 'beat_07_church', ''],
  ['rule_first_music', 'key_music', 'beat_08_cafe', ''],
  ['rule_first_token', 'key_token', 'beat_10_arcade', '{"min_score":1}'],
  ['rule_first_letter', 'key_letter', 'beat_12_marcelino', ''],
  ['rule_first_sunflower', 'key_sunflower', 'beat_14_farm', ''],
  ['rule_museum_unlock', 'key_everkeep', 'beat_15_museum_approach', '{"final_road_puzzle":true}'],
];

function replaceTab(wb: Workbook, tab: Tab, rows: string[][]): void {
  wb[tab] = [headerFor(tab), ...rows];
}

export function appendRows(wb: Workbook, tab: Tab, rows: string[][]): void {
  wb[tab] = [...(wb[tab] ?? [headerFor(tab)]), ...rows];
}

/** The M02 access fixture plus a live-Sheet-shaped Phase 2 skeleton (beats, locations, keys, rules). */
export function buildWorldWorkbook(customize?: (wb: Workbook) => void): Workbook {
  const wb = structuredClone(buildM02Workbook()) as Workbook;
  replaceTab(
    wb,
    '14_STORY_BEATS',
    BEATS.map(([id, location, type, interaction, reward, walkman, checkpoint], i) =>
      row('14_STORY_BEATS', {
        beat_id: id,
        route_id: 'first_journey',
        sequence: String(i + 1),
        scene_id: `scene_${location}`,
        location_id: location,
        beat_type: type,
        dialogue_group_id: `dlg_${id}`,
        required_interaction_id: interaction,
        reward_rule_id: reward,
        checkpoint: checkpoint ? 'TRUE' : 'FALSE',
        next_beat_id: BEATS[i + 1]?.[0] ?? '',
        map_locked: i < 16 ? 'TRUE' : 'FALSE',
        walkman_state: walkman,
        enabled: 'TRUE',
      }),
    ),
  );
  replaceTab(
    wb,
    '11_LOCATIONS',
    LOCATIONS.map(([id, key, , order]) =>
      row('11_LOCATIONS', {
        location_id: id,
        display_name_text_id: `location_${id}`,
        map_order: String(order - 1),
        first_visit_order: String(order),
        key_type_id: key,
        enabled: 'TRUE',
      }),
    ),
  );
  replaceTab(
    wb,
    '21_KEYS',
    LOCATIONS.filter(([, key]) => key).map(([id, key, shape]) =>
      row('21_KEYS', {
        key_type_id: key,
        location_id: id,
        shape,
        icon_id: `${key}_icon`,
        max_per_day: '1',
        inventory_cap: '999',
        enabled: 'TRUE',
      }),
    ),
  );
  replaceTab(
    wb,
    '22_KEY_RULES',
    RULES.map(([id, key, beat, condition]) =>
      row('22_KEY_RULES', {
        rule_id: id,
        key_type_id: key,
        source_type: 'story_interaction',
        source_id: id === 'rule_museum_unlock' ? 'museum_key_check' : id,
        available_from: '<FIRST_VISIT>',
        required_story_beat: beat,
        max_awards_per_period: '1',
        period_type: 'once',
        reward_quantity: '1',
        condition_json: condition || '{}',
        enabled: 'TRUE',
      }),
    ),
  );
  replaceTab(wb, '23_ACHIEVEMENTS', []);
  replaceTab(wb, '04_ADMIN_FLAGS', [
    row('04_ADMIN_FLAGS', {
      flag_id: 'force_first_journey',
      scope: 'user',
      target_user_id: WORLD_USER,
      value: '0',
      value_type: 'boolean_int',
      enabled: 'TRUE',
    }),
  ]);
  const config = wb['01_APP_CONFIG'] ?? [headerFor('01_APP_CONFIG')];
  if (!config.some((r) => r[0] === 'authoritative_time_zone')) {
    appendRows(wb, '01_APP_CONFIG', [
      row('01_APP_CONFIG', {
        config_key: 'authoritative_time_zone',
        value: 'UTC',
        enabled: 'TRUE',
      }),
    ]);
  }
  appendRows(wb, '01_APP_CONFIG', [
    row('01_APP_CONFIG', {
      config_key: 'normal_start_location',
      value: 'cottage',
      enabled: 'TRUE',
    }),
    row('01_APP_CONFIG', {
      config_key: 'current_story_version',
      value: 'first_journey_v1',
      enabled: 'TRUE',
    }),
  ]);
  customize?.(wb);
  return wb;
}

export function worldGateway(wb: Workbook = buildWorldWorkbook()): SheetGateway {
  return new SheetGateway(new FakeGoogleSheetsClient(structuredClone(wb)), { ttlSeconds: 60 });
}

export function worldCtx(gateway: SheetGateway, overrides?: Partial<WorldCtx>): WorldCtx {
  return {
    gateway,
    mutex: new KeyMutex(),
    userId: WORLD_USER,
    now: WORLD_NOW,
    random: () => 0,
    ...overrides,
  };
}

/** Marks the Phase-1 flow (Gate → naming) done for a user, as the live First Opening flow does. */
export async function completePhase1(gateway: SheetGateway, userId = WORLD_USER): Promise<void> {
  await gateway.appendRow('24_PLAYER_PROGRESS', {
    user_route_key: `${userId}|first_opening`,
    user_id: userId,
    story_route_id: 'first_opening',
    status: 'in_progress',
    current_beat_id: 'naming_complete',
    last_checkpoint_id: 'naming_complete',
    updated_at: WORLD_NOW.toISOString(),
  });
  await gateway.appendRow('25_PLAYER_KEYS', {
    user_key_type: `${userId}|key_shell`,
    user_id: userId,
    key_type_id: 'key_shell',
    quantity_found: '1',
    quantity_spent: '0',
    quantity_available: '1',
    last_award_date: '2026-09-25',
    last_source_id: 'first_opening_beach_shell_v1',
  });
}

/** Approved Church content for `2026-09-26`, in two locales. */
export function addChurchContent(wb: Workbook): void {
  const content = (
    id: string,
    type: string,
    locale: string,
    text: string,
    extra: Record<string, string> = {},
  ) =>
    row('30_CHURCH_CONTENT', {
      content_row_id: `${id}_${locale}`,
      content_id: id,
      content_type: type,
      active_date: '2026-09-26',
      locale,
      title: `Title ${id}`,
      text,
      direction: locale === 'ar-EG' ? 'rtl' : 'ltr',
      bible_reference: 'TEST 1:1',
      review_status: 'approved',
      enabled: 'TRUE',
      ...extra,
    });
  appendRows(wb, '30_CHURCH_CONTENT', [
    content('verse_1', 'verse', 'en', 'Fixture verse text'),
    content('verse_1', 'verse', 'ar-EG', 'نص آية للاختبار'),
    content('story_1', 'story', 'en', 'Fixture story text'),
    content('verse_pending', 'verse', 'en', 'Should never show', {
      review_status: 'pending_review',
    }),
  ]);
  const question = (locale: string, extra: Record<string, string> = {}) =>
    row('31_CHURCH_QUIZ', {
      question_row_id: `q1_${locale}`,
      question_id: 'q1',
      active_date: '2026-09-26',
      locale,
      question: `Question ${locale}`,
      question_type: 'multiple_choice',
      option_a: 'Option A',
      option_b: 'Option B',
      option_c: 'Option C',
      correct_answer: 'B',
      explanation: `Because ${locale}`,
      bible_reference: 'TEST 2:2',
      achievement_id: 'ach_quiz_first',
      key_reward_type_id: 'key_candle',
      review_status: 'approved',
      enabled: 'TRUE',
      ...extra,
    });
  appendRows(wb, '31_CHURCH_QUIZ', [
    question('en'),
    question('ar-EG'),
    row('31_CHURCH_QUIZ', {
      question_row_id: 'q_hidden_en',
      question_id: 'q_hidden',
      active_date: '2026-09-26',
      locale: 'en',
      question: 'Unapproved',
      question_type: 'true_false',
      correct_answer: 'true',
      review_status: 'pending_review',
      enabled: 'TRUE',
    }),
  ]);
  appendRows(wb, '23_ACHIEVEMENTS', [
    row('23_ACHIEVEMENTS', {
      achievement_id: 'ach_quiz_first',
      category: 'church',
      trigger_type: 'quiz',
      trigger_rule_json: '{"completed_quizzes":1}',
      reward_quantity: '0',
      enabled: 'TRUE',
    }),
    row('23_ACHIEVEMENTS', {
      achievement_id: 'ach_quiz_perfect',
      category: 'church',
      trigger_type: 'quiz',
      trigger_rule_json: '{"score_percent":100}',
      reward_quantity: '0',
      enabled: 'TRUE',
    }),
  ]);
  // The perfect-quiz achievement is referenced by the same question rows.
  const quiz = wb['31_CHURCH_QUIZ']!;
  const header = quiz[0]!;
  const achievementColumn = header.indexOf('achievement_id');
  for (const r of quiz.slice(1)) if (r[0] === 'q1_en') r[achievementColumn] = 'ach_quiz_perfect';
}

/**
 * birthday_2026 (M16 narrow scope). `buildWorldWorkbook` clears `23_ACHIEVEMENTS` to a blank slate
 * for other tests' isolation, and GOOD_WORKBOOK's `19_MESSAGES`/`17_EVENTS` rows already carry the
 * real `veoulla` recipient id — this re-adds the achievement row and re-addresses the letter to
 * `userId` (defaults to `WORLD_USER`) so both `birthday-api.test.ts` and any browser-preview script
 * share one definition instead of duplicating it.
 */
export function addBirthdayFixtures(wb: Workbook, userId: string = WORLD_USER): void {
  wb['23_ACHIEVEMENTS'] = [
    headerFor('23_ACHIEVEMENTS'),
    row('23_ACHIEVEMENTS', {
      achievement_id: 'birthday_2026_celebrated',
      category: 'birthday',
      title_text_id: 'ach_birthday_2026_title',
      description_text_id: 'ach_birthday_2026_desc',
      secret: 'TRUE',
      points: '10',
      trigger_type: 'birthday_gift_claim',
      trigger_rule_json: '{}',
      reward_key_type_id: '',
      reward_quantity: '0',
      enabled: 'TRUE',
    }),
  ];
  const messages = wb['19_MESSAGES']!;
  const messageHeader = messages[0]!;
  const idCol = messageHeader.indexOf('message_id');
  const recipientCol = messageHeader.indexOf('recipient_user_id');
  for (const r of messages.slice(1)) {
    if (r[idCol] === 'msg_birthday_2026') r[recipientCol] = userId;
  }
}

/** A named companion (`var`) with a chosen name/gender, for birthday-preview/tests. */
export function addCompanionCat(
  wb: Workbook,
  name: string,
  gender: string,
  userId: string = WORLD_USER,
): void {
  wb['37_CHARACTER_STATE'] = [
    ...(wb['37_CHARACTER_STATE'] ?? [headerFor('37_CHARACTER_STATE')]),
    row('37_CHARACTER_STATE', {
      user_character_key: `${userId}|var`,
      user_id: userId,
      character_id: 'var',
      personal_name: name,
      selected_gender: gender,
      relationship_level: 'new',
      known_words_count: '0',
      deliveries_count: '0',
      story_flags_json: '{}',
      updated_at: WORLD_NOW.toISOString(),
    }),
  ];
}
