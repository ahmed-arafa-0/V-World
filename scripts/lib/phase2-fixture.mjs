/**
 * Phase 2 sample-content fixture server. A real built React app + the real,
 * unchanged Express backend, but with an IN-MEMORY Sheet and Drive holding
 * clearly-labelled SAMPLE content (never real religious text, songs, or
 * Ahmed's messages). Used only for the local preview and browser
 * verification, so no live Sheet row — and none of the real owner's progress —
 * is ever touched.
 */
import fs from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';
import express from 'express';
import { buildM02Workbook, headerFor, row, M02_FAKE_GATE_CODE } from '@veoullas-world/test-fixtures';
import { createApp } from '../../apps/functions/lib/app.js';
import { SheetGateway } from '../../apps/functions/lib/repositories/sheet-gateway.js';
import { SCENE_CHARACTER_ASSET_SEED_ROWS } from '../../apps/functions/lib/services/phase1-scene-character-assets-seed.service.js';
import { SCENE_ICON_SEED_SPECS } from '../../apps/functions/lib/services/phase1-scene-icons-seed.service.js';
import {
  buildSessionId,
  createOrReconcileSession,
} from '../../apps/functions/lib/services/session.service.js';

export { M02_FAKE_GATE_CODE };

async function loadFakeSheets() {
  const out = path.resolve('scripts', '.fake-sheets.generated.mjs');
  fs.writeFileSync(
    out,
    ts.transpileModule(fs.readFileSync('apps/functions/tests/helpers/fake-sheets-client.ts', 'utf8'), {
      compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 },
    }).outputText,
  );
  try {
    return (await import(pathToFileURL(out).href)).FakeGoogleSheetsClient;
  } finally {
    fs.unlinkSync(out);
  }
}

/** A 1-second silent WAV, so sample songs are real, playable audio without any licensed music. */
function silentWav() {
  const rate = 8000;
  const data = Buffer.alloc(rate, 128);
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + data.length, 4);
  header.write('WAVEfmt ', 8);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(rate, 24);
  header.writeUInt32LE(rate, 28);
  header.writeUInt16LE(1, 32);
  header.writeUInt16LE(8, 34);
  header.write('data', 36);
  header.writeUInt32LE(data.length, 40);
  return Buffer.concat([header, data]);
}

const BEATS = [
  ['beat_01_boot', 'gate', 'cinematic', '', ''],
  ['beat_02_gate', 'gate', 'interaction', 'gate_dials', ''],
  ['beat_03_var_reveal', 'gate', 'dialogue', '', ''],
  ['beat_04_gate_open', 'gate', 'cinematic', 'gate_success', ''],
  ['beat_05_beach', 'beach', 'location_intro', 'beach_signature', 'rule_first_shell'],
  ['beat_06_naming', 'beach', 'choice', 'cat_name_gender', ''],
  ['beat_07_church', 'church', 'location_intro', 'church_first_interaction', 'rule_first_candle'],
  ['beat_08_cafe', 'cafe', 'location_intro', 'cafe_first_interaction', 'rule_first_music'],
  ['beat_09_walkman', 'cafe', 'unlock', 'walkman_receive', ''],
  ['beat_10_arcade', 'arcade', 'location_intro', 'arcade_intro_game', 'rule_first_token'],
  ['beat_11_cottage', 'cottage', 'location_intro', 'cottage_enter', ''],
  ['beat_12_marcelino', 'cottage', 'delivery', 'first_message_delivery', 'rule_first_letter'],
  ['beat_13_message', 'cottage', 'message', 'open_first_message', ''],
  ['beat_14_farm', 'farm', 'location_intro', 'farm_first_interaction', 'rule_first_sunflower'],
  ['beat_15_museum_approach', 'museum', 'unlock', 'museum_key_check', 'rule_museum_unlock'],
  ['beat_16_hall', 'museum', 'location_intro', 'hall_artifact_view', ''],
  ['beat_17_map_unlock', 'museum', 'unlock', 'map_receive', ''],
  ['beat_18_complete', 'map', 'completion', 'map_open', ''],
];
const LOCATIONS = [
  ['gate', ''],
  ['beach', 'key_shell'],
  ['church', 'key_candle'],
  ['cafe', 'key_music'],
  ['arcade', 'key_token'],
  ['cottage', 'key_letter'],
  ['farm', 'key_sunflower'],
  ['museum', 'key_everkeep'],
];
const RULES = [
  ['rule_first_shell', 'key_shell', ''],
  ['rule_first_candle', 'key_candle', ''],
  ['rule_first_music', 'key_music', ''],
  ['rule_first_token', 'key_token', '{"min_score":1}'],
  ['rule_first_letter', 'key_letter', ''],
  ['rule_first_sunflower', 'key_sunflower', ''],
  ['rule_museum_unlock', 'key_everkeep', '{"final_road_puzzle":true}'],
];

function todayKey(timeZone) {
  return new Intl.DateTimeFormat('en-CA', { timeZone }).format(new Date());
}

/**
 * SAMPLE composition guide (NOT artwork): a labelled grid at the real art sizes, so crops and
 * anchors can be checked before final paintings exist. Desktop 1672x941, mobile 941x1672.
 */
function guideSvg(label, width, height) {
  const lines = [];
  for (let i = 1; i < 10; i++) {
    const x = (width * i) / 10;
    const y = (height * i) / 10;
    lines.push(
      `<line x1="${x}" y1="0" x2="${x}" y2="${height}" stroke="#ffffff55"/><line x1="0" y1="${y}" x2="${width}" y2="${y}" stroke="#ffffff55"/>`,
      `<text x="${x + 4}" y="18" fill="#fff" font-size="14">${i * 10}</text><text x="4" y="${y - 4}" fill="#fff" font-size="14">${i * 10}</text>`,
    );
  }
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#7d6a52"/><stop offset="1" stop-color="#3f3226"/></linearGradient></defs><rect width="100%" height="100%" fill="url(#g)"/>${lines.join('')}<text x="50%" y="52%" text-anchor="middle" fill="#ffe7b0" font-size="${Math.round(width / 22)}" font-family="sans-serif">SAMPLE composition guide</text><text x="50%" y="58%" text-anchor="middle" fill="#ffe7b0" font-size="${Math.round(width / 34)}" font-family="sans-serif">${label} ${width}x${height} - not artwork</text></svg>`,
  );
}
export const COMPOSITION_GUIDE_ASSET_IDS = [
  'cottage_exterior_scene',
  'cottage_interior_scene',
  'junction_scene',
];

const ART_PACK = 'assets/veoulla-art-pack';
const ART_WEB = 'assets/veoulla-art-web';
export const ART_PACK_PRESENT =
  fs.existsSync(path.join(ART_PACK, 'asset_manifest.json')) && fs.existsSync(path.join(ART_WEB, 'derivatives.json'));

/**
 * Registers the selected art pack for the local SAMPLE preview only: scenes from the original PNGs (desktop + mobile),
 * sprites/icons from the trimmed web derivatives (\`npm run art:derivatives\`). Asset ids are the manifest's existing
 * ids and its documented proposals; nothing here is a Drive id and none of it reaches the live Sheet.
 */
function artPackRows() {
  const manifest = JSON.parse(fs.readFileSync(path.join(ART_PACK, 'asset_manifest.json'), 'utf8')).assets;
  const files = {};
  const assets = [];
  const icons = [];
  const image = (assetId, desktopFile, mobileFile) =>
    row('10_ASSETS', { asset_id: assetId, asset_type: 'image', drive_file_id: desktopFile, mobile_drive_file_id: mobileFile ?? '', preload_priority: '1', enabled: 'TRUE', version: '1' });
  const scenes = new Map();
  for (const a of manifest) {
    const base = path.basename(a.path);
    if (a.path.startsWith('phase2/scenes/')) {
      const entry = scenes.get(a.asset_id) ?? {};
      entry[a.variant === 'mobile' ? 'mobile' : 'desktop'] = a.path;
      scenes.set(a.asset_id, entry);
      continue;
    }
    const web = a.path.replace(/^phase2\//, '');
    const webFile = path.join(ART_WEB, web);
    if (a.asset_id === 'map_island_transparent') {
      files[base] = fs.readFileSync(path.join(ART_PACK, a.path));
      assets.push(image(a.asset_id, base));
      continue;
    }
    if (a.path.startsWith('phase2/closeups/') || a.path.startsWith('phase1/')) continue;
    if (a.path.startsWith('phase2/props/farm_plot') || base.startsWith('marcelino_walk')) continue; // supplemental / optional, not consumed
    if (!fs.existsSync(webFile)) continue;
    files[base] = fs.readFileSync(webFile);
    assets.push(image(a.asset_id, base));
  }
  for (const [assetId, e] of scenes) {
    for (const p of [e.desktop, e.mobile]) files[path.basename(p)] = fs.readFileSync(path.join(ART_PACK, p));
    assets.push(image(assetId, path.basename(e.desktop), path.basename(e.mobile)));
  }
  const icon = (iconId, assetId, name, category) =>
    icons.push(row('09_ICONS', { icon_id: iconId, category, display_name: name, asset_id: assetId, format: 'png', rtl_mirror: 'FALSE', enabled: 'TRUE', version: '1' }));
  for (const key of ['shell', 'candle', 'music', 'token', 'letter', 'sunflower', 'everkeep']) icon(`key_${key}_icon`, `asset_key_${key}_icon`, `Key ${key}`, 'key');
  for (const crop of ['sunflower', 'mango', 'blueberry']) {
    icon(`seed_${crop}_icon`, `asset_seed_${crop}_icon`, `Seed ${crop}`, 'farm');
    icon(`crop_${crop}_icon`, `asset_crop_${crop}_icon`, `Crop ${crop}`, 'farm');
  }
  for (const id of ['first_step', 'perfect_quiz', 'first_harvest', 'secret_001']) icon(`ach_${id}_icon`, `asset_achievement_${id}`, `Achievement ${id}`, 'achievement');
  return { files, assets, icons };
}

export function buildPhase2Workbook({ compositionGuides = false, artPack = false } = {}) {
  const wb = structuredClone(buildM02Workbook());
  const files = {};
  const set = (tab, rows) => {
    wb[tab] = [headerFor(tab), ...rows];
  };
  const today = todayKey('Africa/Cairo');

  // Sheet skeleton in the live workbook's shape.
  set('14_STORY_BEATS', BEATS.map(([id, loc, type, interaction, reward], i) => row('14_STORY_BEATS', {
    beat_id: id, route_id: 'first_journey', sequence: String(i + 1), scene_id: `scene_${loc}`, location_id: loc,
    beat_type: type, dialogue_group_id: `dlg_${id}`, required_interaction_id: interaction, reward_rule_id: reward,
    checkpoint: 'TRUE', next_beat_id: BEATS[i + 1]?.[0] ?? '', map_locked: i < 16 ? 'TRUE' : 'FALSE', enabled: 'TRUE',
  })));
  set('11_LOCATIONS', LOCATIONS.map(([id, key], i) => row('11_LOCATIONS', {
    location_id: id, display_name_text_id: `location_${id}`, map_order: String(i), first_visit_order: String(i + 1),
    key_type_id: key, enabled: 'TRUE',
  })));
  set('21_KEYS', LOCATIONS.filter(([, k]) => k).map(([id, key]) => row('21_KEYS', {
    key_type_id: key, location_id: id, shape: key.replace('key_', ''), icon_id: `${key}_icon`, max_per_day: '1', enabled: 'TRUE',
  })));
  set('22_KEY_RULES', RULES.map(([id, key, cond]) => row('22_KEY_RULES', {
    rule_id: id, key_type_id: key, source_type: 'story_interaction', source_id: id === 'rule_museum_unlock' ? 'museum_key_check' : id,
    available_from: '<FIRST_VISIT>', period_type: 'once', reward_quantity: '1', condition_json: cond || '{}', enabled: 'TRUE',
  })));
  set('04_ADMIN_FLAGS', [row('04_ADMIN_FLAGS', { flag_id: 'force_first_journey', scope: 'user', value: '0', value_type: 'boolean_int', enabled: 'TRUE' })]);
  set('23_ACHIEVEMENTS', [
    row('23_ACHIEVEMENTS', { achievement_id: 'ach_quiz_first', category: 'church', trigger_type: 'quiz', trigger_rule_json: '{"completed_quizzes":1}', reward_quantity: '0', enabled: 'TRUE' }),
    ...(artPack && ART_PACK_PRESENT
      ? [
          ['ach_first_step', 'ach_first_step_icon', 'FALSE'],
          ['ach_perfect_quiz', 'ach_perfect_quiz_icon', 'FALSE'],
          ['ach_first_harvest', 'ach_first_harvest_icon', 'FALSE'],
          ['ach_secret_001', 'ach_secret_001_icon', 'TRUE'],
        ].map(([id, icon, secret]) => row('23_ACHIEVEMENTS', { achievement_id: id, category: 'sample', trigger_type: 'sample', trigger_rule_json: '{}', reward_quantity: '0', icon_id: icon, secret, enabled: 'TRUE' }))
      : []),
  ]);
  const cfg = (key, value) => row('01_APP_CONFIG', { config_key: key, value, enabled: 'TRUE' });
  wb['01_APP_CONFIG'] = [...(wb['01_APP_CONFIG'] ?? [headerFor('01_APP_CONFIG')]),
    cfg('normal_start_location', 'cottage'), cfg('current_story_version', 'first_journey_v1'), cfg('current_event_id', 'event_sample'),
  ];

  // Assets: the real Phase 1 art + icons (from the local handoff folder), plus sample audio.
  const assets = [];
  for (const spec of SCENE_CHARACTER_ASSET_SEED_ROWS) {
    for (const [folder, filename] of [['desktop', spec.desktopFile], ['mobile', spec.mobileFile], ['characters', spec.singleFile]]) {
      if (filename && fs.existsSync(path.join('assets/phase1', folder, filename))) files[filename] = fs.readFileSync(path.join('assets/phase1', folder, filename));
    }
    assets.push(row('10_ASSETS', { asset_id: spec.assetId, asset_type: 'image', drive_file_id: spec.desktopFile ?? spec.singleFile, mobile_drive_file_id: spec.mobileFile ?? '', preload_priority: '1', enabled: 'TRUE', version: '1' }));
  }
  const iconRows = [];
  for (const spec of SCENE_ICON_SEED_SPECS) {
    const file = path.join('assets/phase1/icons', spec.filename);
    if (!fs.existsSync(file)) continue;
    files[spec.filename] = fs.readFileSync(file);
    assets.push(row('10_ASSETS', { asset_id: spec.assetId, asset_type: 'image', drive_file_id: spec.filename, enabled: 'TRUE', version: '1' }));
    iconRows.push(row('09_ICONS', { icon_id: spec.iconId, category: 'ui', display_name: spec.displayName, asset_id: spec.assetId, format: 'svg', rtl_mirror: 'FALSE', alt_text_id: spec.altTextId, enabled: 'TRUE', version: '1' }));
  }
  files['sample.wav'] = silentWav();
  for (const id of ['audio_sample_1', 'audio_sample_2', 'audio_sample_hymn']) {
    assets.push(row('10_ASSETS', { asset_id: id, asset_type: 'audio', drive_file_id: 'sample.wav', enabled: 'TRUE', version: '1' }));
  }
  if (compositionGuides) {
    for (const id of COMPOSITION_GUIDE_ASSET_IDS) {
      files[`${id}_desktop.svg`] = guideSvg(id, 1672, 941);
      files[`${id}_mobile.svg`] = guideSvg(id, 941, 1672);
      assets.push(
        row('10_ASSETS', {
          asset_id: id,
          asset_type: 'image',
          drive_file_id: `${id}_desktop.svg`,
          mobile_drive_file_id: `${id}_mobile.svg`,
          preload_priority: '1',
          enabled: 'TRUE',
          version: '1',
        }),
      );
    }
  }
  if (artPack && ART_PACK_PRESENT) {
    const art = artPackRows();
    Object.assign(files, art.files);
    const have = new Set(assets.map((r) => r[0]));
    assets.push(...art.assets.filter((r) => !have.has(r[0])));
    iconRows.push(...art.icons);
  }
  set('10_ASSETS', assets);
  set('09_ICONS', iconRows);

  // SAMPLE content — every string says so; none of it is real content.
  const church = (id, type, locale, text, extra = {}) => row('30_CHURCH_CONTENT', {
    content_row_id: `${id}_${locale}`, content_id: id, content_type: type, active_date: today, locale, title: `SAMPLE ${type}`, text,
    direction: locale === 'ar-EG' ? 'rtl' : 'ltr', bible_reference: 'SAMPLE 0:0', review_status: 'approved', enabled: 'TRUE', ...extra,
  });
  set('30_CHURCH_CONTENT', [
    church('verse_s', 'verse', 'en', 'SAMPLE verse text for the preview only — not real scripture.'),
    church('verse_s', 'verse', 'ar-EG', 'نص آية تجريبي للمعاينة فقط — مش نص حقيقي.'),
    church('story_s', 'story', 'en', 'SAMPLE Bible story text for the preview only.'),
    church('photo_s', 'photo', 'en', 'SAMPLE photo story — Ahmed will supply the real photo and story.', { active_date: '<FIRST_VISIT>' }),
  ]);
  const quiz = (id, locale, question, type, correct, extra = {}) => row('31_CHURCH_QUIZ', {
    question_row_id: `${id}_${locale}`, question_id: id, active_date: today, locale, question, question_type: type, correct_answer: correct,
    explanation: `SAMPLE explanation (${locale}).`, bible_reference: 'SAMPLE 0:0', achievement_id: 'ach_quiz_first', review_status: 'approved', enabled: 'TRUE', ...extra,
  });
  set('31_CHURCH_QUIZ', [
    quiz('q1', 'en', 'SAMPLE question one — which option is B?', 'multiple_choice', 'B', { option_a: 'Option A', option_b: 'Option B', option_c: 'Option C' }),
    quiz('q2', 'en', 'SAMPLE question two — is this a sample?', 'true_false', 'true'),
  ]);
  const song = (id, title, release, loc = 'cafe', asset = 'audio_sample_1') => row('20_SONGS', {
    song_id: id, title, artist: 'SAMPLE artist', release_at: release, location_id: loc, audio_asset_id: asset, explanation_text_id: `expl_${id}`, available_in_walkman: 'TRUE', enabled: 'TRUE',
  });
  set('20_SONGS', [
    song('song_a', 'SAMPLE song A', today), song('song_b', 'SAMPLE song B', today, 'cafe', 'audio_sample_2'),
    song('song_old', 'SAMPLE earlier song', '2026-01-05'), song('song_first', 'SAMPLE welcome song', '<FIRST_VISIT>'),
    song('hymn_s', 'SAMPLE hymn', '<FIRST_VISIT>', 'church', 'audio_sample_hymn'),
  ]);
  set('08_UI_TEXT', [row('08_UI_TEXT', { ui_text_row_id: 'e1', text_id: 'expl_song_a', locale: 'en', text: 'SAMPLE reason this song was chosen.', enabled: 'TRUE' })]);
  const msg = (locale, text) => row('19_MESSAGES', {
    message_row_id: `first_${locale}`, message_id: 'msg_first', sender_id: 'admin_ahmed', delivery_at: '<FIRST_VISIT>', priority: '1', message_type: 'letter',
    locale, text, direction: locale === 'ar-EG' ? 'rtl' : 'ltr', archive_after_open: 'TRUE', enabled: 'TRUE',
  });
  set('19_MESSAGES', [msg('en', 'SAMPLE message — this is NOT Ahmed’s writing. His real first message replaces it.'), msg('ar-EG', 'رسالة تجريبية — دي مش كلام أحمد الحقيقي.')]);
  set('17_EVENTS', [row('17_EVENTS', { event_id: 'event_sample', event_name: 'SAMPLE event', event_type: 'sample', target_at: new Date(Date.now() + 30 * 86_400_000).toISOString(), enabled: 'TRUE' })]);
  const game = (id, slot, family, cost, on = true) => row('32_ARCADE_GAMES', {
    game_id: id, cabinet_slot: String(slot), display_name_text_id: `${id}_name`, game_family: family, key_cost_type_id: cost ? 'key_token' : '',
    key_cost_quantity: String(cost), difficulty_mode: 'adaptive', score_mode: 'score', walkman_volume_percent: '25', sfx_enabled: 'TRUE', enabled: on ? 'TRUE' : 'FALSE',
  });
  set('32_ARCADE_GAMES', [game('game_memory', 1, 'memory_cards', 0), game('game_catch', 2, 'catch_items', 2), game('game_puzzle', 3, 'picture_puzzle', 3), game('game_maze', 4, 'var_maze', 4, false), game('game_trivia', 5, 'trivia', 5, false)]);
  const crop = (id, grow, water, wilt, y) => row('28_FARM_CROPS', { crop_id: id, display_name_text_id: `crop_${id}`, grow_hours: String(grow), watering_interval_hours: String(water), wilt_after_hours: String(wilt), rain_waters: 'TRUE', harvest_yield: String(y), rarity: 'common', enabled: 'TRUE' });
  set('28_FARM_CROPS', [crop('sunflower', 72, 24, 36, 1), crop('mango', 168, 48, 72, 3), crop('blueberry', 96, 24, 36, 5)]);
  set('34_MUSEUM_EXHIBITS', [
    row('34_MUSEUM_EXHIBITS', { exhibit_id: 'exhibit_archive', wing_id: 'archive_wing', display_name_text_id: 'Archive', exhibit_type: 'archive_portal', unlock_type: 'story_progress', unlock_rule_json: '{"route":"first_journey"}', position_id: 'archive_01', personal_only: 'TRUE', enabled: 'TRUE' }),
    row('34_MUSEUM_EXHIBITS', { exhibit_id: 'exhibit_comic', wing_id: 'stories_wing', display_name_text_id: 'Comic', exhibit_type: 'pdf_book', source_content_id: 'comic_pdf_2025', unlock_type: 'story_progress', unlock_rule_json: '{}', position_id: 'book_01', personal_only: 'TRUE', enabled: 'TRUE' }),
    row('34_MUSEUM_EXHIBITS', { exhibit_id: 'exhibit_secret', wing_id: 'secret_wing', exhibit_type: 'empty_secret_slot', unlock_type: 'achievement', unlock_rule_json: '{"achievement_id":"ach_secret"}', position_id: 'secret_01', personal_only: 'TRUE', enabled: 'TRUE' }),
  ]);
  // Sample narration for two beats only — proves the text-only, player-paced narration path.
  // SAMPLE lines for the first-opening screens (Gate, doors, naming) so the preview shows real text
  // paths. Placeholders only — never approved story text; the live Sheet holds the real rows.
  const sample = (id, group, en, ar, mode = 'speech_bubble') => [
    row('15_DIALOGUE', { dialogue_row_id: `${id}_en`, dialogue_id: id, group_id: group, sequence: '1', speaker_id: 'var', locale: 'en', text: en, direction: 'ltr', display_mode: mode, enabled: 'TRUE' }),
    row('15_DIALOGUE', { dialogue_row_id: `${id}_ar`, dialogue_id: id, group_id: group, sequence: '1', speaker_id: 'var', locale: 'ar-EG', text: ar, direction: 'rtl', display_mode: mode, enabled: 'TRUE' }),
  ];
  set('15_DIALOGUE', [
    ...sample('dlg_gate_01', 'dlg_gate_01', 'SAMPLE line (Gate opening) — the approved wording is not in this preview.', 'سطر تجريبي (بوابة) — الصياغة المعتمدة مش في المعاينة.', 'narration'),
    ...sample('dlg_name_01', 'dlg_name_01', 'SAMPLE prompt (naming) — what should I be called?', 'سؤال تجريبي (الاسم) — تحبي أتسمى إيه؟'),
    ...sample('dlg_gate_open_n1', 'dlg_beat_04_gate_open', 'SAMPLE narration (doors open) — the real script has not been written yet.', 'سرد تجريبي (الأبواب بتفتح) — النص الحقيقي لسه ماتكتبش.', 'narration'),
    row('15_DIALOGUE', { dialogue_row_id: 'church_n1_en', dialogue_id: 'church_n1', group_id: 'dlg_beat_07_church', sequence: '1', speaker_id: 'var', locale: 'en', text: 'SAMPLE narration (Church intro) — the real script has not been written yet.', direction: 'ltr', display_mode: 'narration', enabled: 'TRUE' }),
    row('15_DIALOGUE', { dialogue_row_id: 'church_n1_ar', dialogue_id: 'church_n1', group_id: 'dlg_beat_07_church', sequence: '1', speaker_id: 'var', locale: 'ar-EG', text: 'سرد تجريبي — النص الحقيقي لسه ماتكتبش.', direction: 'rtl', display_mode: 'narration', enabled: 'TRUE' }),
  ]);
  return { wb, files };
}

const MIME = { '.png': 'image/png', '.svg': 'image/svg+xml', '.wav': 'audio/wav', '.jpg': 'image/jpeg' };

export async function startPhase2Fixture({ port = 0, weather, compositionGuides = false, artPack = false } = {}) {
  const FakeGoogleSheetsClient = await loadFakeSheets();
  const { wb, files } = buildPhase2Workbook({ compositionGuides, artPack });
  const gateway = new SheetGateway(new FakeGoogleSheetsClient(wb), { ttlSeconds: 60 });
  const drive = {
    async getFileMetadata(id) {
      return { id, name: id, mimeType: MIME[path.extname(id)] ?? 'application/octet-stream', size: files[id]?.length ?? 0, parents: ['fixture_drive_root_folder_id'], trashed: false };
    },
    async getFileContentStream(id) {
      if (!files[id]) throw Error(`Missing fixture ${id}`);
      return { stream: Readable.from(files[id]) };
    },
    async findFilesByName() {
      return [];
    },
  };
  const app = express();
  const dist = path.resolve('apps/web/dist');
  app.use(express.static(dist));
  app.use(createApp({ getGateway: () => gateway, getDriveClient: () => drive, isProduction: () => false, getEnvironment: () => 'local', weatherProvider: weather ?? { rainHours: async () => [] } }));
  app.get('*', (_req, res) => res.sendFile(path.join(dist, 'index.html')));
  const server = await new Promise((resolve) => {
    const s = app.listen(port, '127.0.0.1', () => resolve(s));
  });
  return { server, gateway, origin: `http://127.0.0.1:${server.address().port}` };
}

/** Marks Gate → naming done for `userId` (as the real First Opening flow leaves it) and mints an owner session. */
export async function seedPhase1Player(gateway, userId, { naming = true } = {}) {
  const now = new Date();
  const iso = now.toISOString();
  await gateway.appendRow('24_PLAYER_PROGRESS', { user_route_key: `${userId}|first_opening`, user_id: userId, story_route_id: 'first_opening', status: 'in_progress', current_beat_id: naming ? 'naming_complete' : 'gate_success', last_checkpoint_id: naming ? 'naming_complete' : 'gate_success', updated_at: iso });
  if (naming) await gateway.appendRow('25_PLAYER_KEYS', { user_key_type: `${userId}|key_shell`, user_id: userId, key_type_id: 'key_shell', quantity_found: '1', quantity_spent: '0', quantity_available: '1', last_award_date: '2026-01-01', last_source_id: 'first_opening_beach_shell_v1' });
  if (naming) await gateway.appendRow('37_CHARACTER_STATE', { user_character_key: `${userId}|var`, user_id: userId, character_id: 'var', personal_name: 'Preview', selected_gender: 'female', updated_at: iso });
  const sessionId = buildSessionId('gate', `phase2_${userId}`);
  await createOrReconcileSession(gateway, { sessionId, userId, ip: '127.0.0.1', deviceId: `phase2-${userId}`, createdAt: now, expiresAt: new Date(now.getTime() + 8 * 3600_000) });
  return sessionId;
}
