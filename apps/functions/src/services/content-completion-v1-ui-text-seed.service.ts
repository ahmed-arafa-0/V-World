import type { SheetGateway } from '../repositories/sheet-gateway.js';

/**
 * Locale-authored proposals from `assets/Veoulla_Content_Completion_v1/ui_text_5_locales.json` and
 * `resolved_title_proposals.json` (`beat_titles` only — see note below), mapped onto `08_UI_TEXT`'s
 * real columns. `ui_text_row_id` follows the tab's own dominant convention (785 of 867 live rows,
 * the `world_*` label family): `ui_<text_id>_<short-locale>`, except when `text_id` already starts
 * with `ui_` (then the prefix is not doubled — matches the live `ui_map`/`ui_enter` rows exactly).
 * This id has no runtime meaning (content-runtime.service.ts looks rows up by `text_id`, never by
 * row id), so it only needs to be stable and collision-free, which this rule is.
 *
 * `resolved_title_proposals.json` also proposed 4 `wing_titles` (for `34_MUSEUM_EXHIBITS.wing_id`).
 * Those are deliberately NOT included here: `34_MUSEUM_EXHIBITS` has no display-name column for a
 * wing at all (only `exhibit_id`-level `display_name_text_id`; confirmed against
 * `packages/sheet-schema/src/tabs/content-systems.ts` and `docs/content/REAL_CONTENT_GAPS.md` §9,
 * "Wings themselves have no separate display-name field in the schema"). Writing a `wing_*` text_id
 * that nothing reads would be inventing a feature, not filling a gap — flagged for Ahmed instead of
 * silently resolved.
 *
 * `beat_id_to_verify` values in the package are matched here against `14_STORY_BEATS.title_text_id`
 * as read live 2026-09-22 (all 18 beat ids exist; the package's own IDs were unverified guesses per
 * its "warning" field, now confirmed real).
 *
 * Every row is `enabled: 'FALSE'`. Unlike the pre-approved `world_*`/`player_*` fallback mirrors
 * (`phase1-player-ui-text-seed.service.ts`, `phase2-config-seed.service.ts`), this wording is
 * unreviewed ("pending_review" is the package's own status). `enabled` genuinely gates visibility
 * here: `SheetGateway.readEnabledRows`/`readEnabledRowsBatch` filter `08_UI_TEXT` to `enabled ===
 * true` (`content-runtime.service.ts`'s `computeContentRuntime`), and per-location resolvers filter
 * the same way (e.g. `world/cafe.ts`'s `explanationFor`: `t.values.enabled !== false`). Every
 * label proposed here attaches to an entity that is ALREADY live (`11_LOCATIONS`, `21_KEYS`,
 * `23_ACHIEVEMENTS`, 3 of 5 `32_ARCADE_GAMES`, `34_MUSEUM_EXHIBITS` are all `enabled: TRUE` today) —
 * so inserting these as `enabled: TRUE` would make real, currently-generic-fallback UI text change
 * to Ahmed's unreviewed wording immediately, which is exactly the "enable content" this task was
 * told not to do. Flipping each row's `enabled` to `TRUE` (a single-cell update, no reseed) is the
 * intended follow-up once Ahmed has reviewed the wording — same shape as the dialogue/church/quiz
 * seeds' `enabled: FALSE`.
 */

const LOCALES = [
  { locale: 'en', suffix: 'en', direction: 'ltr' },
  { locale: 'ar-EG', suffix: 'ar', direction: 'rtl' },
  { locale: 'it', suffix: 'it', direction: 'ltr' },
  { locale: 'el', suffix: 'el', direction: 'ltr' },
  { locale: 'fr', suffix: 'fr', direction: 'ltr' },
] as const;

function rowId(textId: string, suffix: string): string {
  return textId.startsWith('ui_') ? `${textId}_${suffix}` : `ui_${textId}_${suffix}`;
}

export interface UiTextLabel {
  textId: string;
  screenId: string;
  componentId: string;
  labels: Readonly<Record<'en' | 'ar-EG' | 'it' | 'el' | 'fr', string>>;
}

/** `beat_id -> title_text_id`, exactly as live in `14_STORY_BEATS` (read 2026-09-22). */
export const BEAT_TITLE_TEXT_IDS: Readonly<Record<string, string>> = {
  beat_01_boot: 'beat_boot_title',
  beat_02_gate: 'beat_gate_title',
  beat_03_var_reveal: 'beat_var_reveal',
  beat_04_gate_open: 'beat_gate_open',
  beat_05_beach: 'beat_beach_intro',
  beat_06_naming: 'beat_naming',
  beat_07_church: 'beat_church_intro',
  beat_08_cafe: 'beat_cafe_intro',
  beat_09_walkman: 'beat_walkman',
  beat_10_arcade: 'beat_arcade_intro',
  beat_11_cottage: 'beat_cottage_intro',
  beat_12_marcelino: 'beat_marcelino',
  beat_13_message: 'beat_ahmed_message',
  beat_14_farm: 'beat_farm_intro',
  beat_15_museum_approach: 'beat_museum_approach',
  beat_16_hall: 'beat_hall_intro',
  beat_17_map_unlock: 'beat_map_unlock',
  beat_18_complete: 'beat_freedom',
};

/** `beat_id -> proposed title text, all 5 locales`, from `resolved_title_proposals.json`. */
const BEAT_TITLE_LABELS: Readonly<Record<string, UiTextLabel['labels']>> = {
  beat_01_boot: {
    en: 'A Quiet Moment',
    'ar-EG': 'لحظة هدوء',
    it: 'Un momento di quiete',
    el: 'Μια ήσυχη στιγμή',
    fr: 'Un instant de calme',
  },
  beat_02_gate: {
    en: 'At the Gate',
    'ar-EG': 'عند البوابة',
    it: 'Al portale',
    el: 'Στην πύλη',
    fr: 'Au portail',
  },
  beat_03_var_reveal: {
    en: 'A Companion',
    'ar-EG': 'رفيق الرحلة',
    it: 'Una compagnia',
    el: 'Μια συντροφιά',
    fr: 'De la compagnie',
  },
  beat_04_gate_open: {
    en: 'The Door Opens',
    'ar-EG': 'الباب اتفتح',
    it: 'La porta si apre',
    el: 'Η πόρτα ανοίγει',
    fr: 'La porte s’ouvre',
  },
  beat_05_beach: {
    en: 'The First Sea Breeze',
    'ar-EG': 'أول نسمة بحر',
    it: 'La prima brezza marina',
    el: 'Η πρώτη θαλασσινή αύρα',
    fr: 'La première brise marine',
  },
  beat_06_naming: {
    en: 'A Name for Your Companion',
    'ar-EG': 'اسم لرفيقك',
    it: 'Un nome per la tua compagnia',
    el: 'Ένα όνομα για τη συντροφιά σου',
    fr: 'Un nom pour ton compagnon',
  },
  beat_07_church: {
    en: 'At the Church Door',
    'ar-EG': 'عند باب الكنيسة',
    it: 'Alla porta della chiesa',
    el: 'Στην πόρτα της εκκλησίας',
    fr: 'À la porte de l’église',
  },
  beat_08_cafe: {
    en: 'A Musical Stop',
    'ar-EG': 'وقفة مزيكا',
    it: 'Una sosta musicale',
    el: 'Μια μουσική στάση',
    fr: 'Une pause musicale',
  },
  beat_09_walkman: {
    en: 'Music to Take Along',
    'ar-EG': 'مزيكا معاكي',
    it: 'Musica da portare con te',
    el: 'Μουσική μαζί σου',
    fr: 'De la musique avec toi',
  },
  beat_10_arcade: {
    en: 'Time to Play',
    'ar-EG': 'وقت اللعب',
    it: 'È ora di giocare',
    el: 'Ώρα για παιχνίδι',
    fr: 'L’heure de jouer',
  },
  beat_11_cottage: {
    en: 'Welcome Home',
    'ar-EG': 'أهلًا في بيتك',
    it: 'Benvenuta a casa',
    el: 'Καλώς ήρθες σπίτι',
    fr: 'Bienvenue chez toi',
  },
  beat_12_marcelino: {
    en: 'A Visit from the Postbird',
    'ar-EG': 'زيارة ساعي البريد',
    it: 'Una visita del postino',
    el: 'Επίσκεψη του ταχυδρόμου',
    fr: 'La visite du facteur',
  },
  beat_13_message: {
    en: 'A Letter for You',
    'ar-EG': 'رسالة ليكي',
    it: 'Una lettera per te',
    el: 'Ένα γράμμα για σένα',
    fr: 'Une lettre pour toi',
  },
  beat_14_farm: {
    en: 'A Seed and a Beginning',
    'ar-EG': 'بذرة وبداية',
    it: 'Un seme e un inizio',
    el: 'Ένας σπόρος κι ένα ξεκίνημα',
    fr: 'Une graine et un début',
  },
  beat_15_museum_approach: {
    en: 'The Road to The Everkeep',
    'ar-EG': 'الطريق إلى The Everkeep',
    it: 'La strada per The Everkeep',
    el: 'Ο δρόμος προς το The Everkeep',
    fr: 'La route vers The Everkeep',
  },
  beat_16_hall: {
    en: 'The Hall of Stories',
    'ar-EG': 'قاعة الحكايات',
    it: 'La sala delle storie',
    el: 'Η αίθουσα των ιστοριών',
    fr: 'Le hall des histoires',
  },
  beat_17_map_unlock: {
    en: 'The Island at Your Fingertips',
    'ar-EG': 'الجزيرة بين إيديكي',
    it: 'L’isola a portata di mano',
    el: 'Το νησί στα χέρια σου',
    fr: 'L’île à portée de main',
  },
  beat_18_complete: {
    en: 'Explore Your Way',
    'ar-EG': 'كمّلي على مزاجك',
    it: 'Esplora a modo tuo',
    el: 'Εξερεύνησε όπως θέλεις',
    fr: 'Explore à ta façon',
  },
};

export function buildBeatTitleRows(): Record<string, string>[] {
  return Object.entries(BEAT_TITLE_TEXT_IDS).flatMap(([beatId, textId]) => {
    const labels = BEAT_TITLE_LABELS[beatId];
    if (!labels) throw new Error(`No proposed title for ${beatId}`);
    return LOCALES.map((l) => ({
      ui_text_row_id: rowId(textId, l.suffix),
      text_id: textId,
      screen_id: 'world',
      component_id: 'beat_title',
      locale: l.locale,
      text: labels[l.locale],
      direction: l.direction,
      aria_label: labels[l.locale],
      enabled: 'FALSE',
      version: '1',
    }));
  });
}

/** The 40 wholly-absent text_ids from `ui_text_5_locales.json` (locations, keys, achievements, icons, games, exhibits). */
export const UI_TEXT_LABELS: readonly UiTextLabel[] = [
  {
    textId: 'location_gate',
    screenId: 'world',
    componentId: 'location_name',
    labels: {
      en: 'The Gate',
      'ar-EG': 'البوابة',
      it: 'Il portale',
      el: 'Η πύλη',
      fr: 'Le portail',
    },
  },
  {
    textId: 'location_beach',
    screenId: 'world',
    componentId: 'location_name',
    labels: {
      en: 'The Beach',
      'ar-EG': 'الشاطئ',
      it: 'La spiaggia',
      el: 'Η παραλία',
      fr: 'La plage',
    },
  },
  {
    textId: 'location_church',
    screenId: 'world',
    componentId: 'location_name',
    labels: {
      en: 'The Church',
      'ar-EG': 'الكنيسة',
      it: 'La chiesa',
      el: 'Η εκκλησία',
      fr: 'L’église',
    },
  },
  {
    textId: 'location_cafe',
    screenId: 'world',
    componentId: 'location_name',
    labels: {
      en: 'Vinyl Café',
      'ar-EG': 'Vinyl Café',
      it: 'Vinyl Café',
      el: 'Vinyl Café',
      fr: 'Vinyl Café',
    },
  },
  {
    textId: 'location_arcade',
    screenId: 'world',
    componentId: 'location_name',
    labels: { en: 'VARcade', 'ar-EG': 'VARcade', it: 'VARcade', el: 'VARcade', fr: 'VARcade' },
  },
  {
    textId: 'location_cottage',
    screenId: 'world',
    componentId: 'location_name',
    labels: {
      en: 'Veoulla’s Cottage',
      'ar-EG': 'بيت فيولا',
      it: 'La casetta di Veoulla',
      el: 'Το σπιτάκι της Veoulla',
      fr: 'La petite maison de Veoulla',
    },
  },
  {
    textId: 'location_farm',
    screenId: 'world',
    componentId: 'location_name',
    labels: {
      en: 'Sunberry Fields',
      'ar-EG': 'Sunberry Fields',
      it: 'Sunberry Fields',
      el: 'Sunberry Fields',
      fr: 'Sunberry Fields',
    },
  },
  {
    textId: 'location_museum',
    screenId: 'world',
    componentId: 'location_name',
    labels: {
      en: 'The Everkeep',
      'ar-EG': 'The Everkeep',
      it: 'The Everkeep',
      el: 'The Everkeep',
      fr: 'The Everkeep',
    },
  },
  {
    textId: 'subtitle_beach',
    screenId: 'world',
    componentId: 'location_subtitle',
    labels: {
      en: 'A quiet breath by the sea',
      'ar-EG': 'نَفَس هادي على البحر',
      it: 'Un respiro tranquillo sul mare',
      el: 'Μια ήρεμη ανάσα πλάι στη θάλασσα',
      fr: 'Une douce pause au bord de la mer',
    },
  },
  {
    textId: 'subtitle_farm',
    screenId: 'world',
    componentId: 'location_subtitle',
    labels: {
      en: 'Something lovely, growing in its own time',
      'ar-EG': 'حاجة حلوة تكبر على مهلك',
      it: 'Qualcosa di bello cresce senza fretta',
      el: 'Κάτι όμορφο μεγαλώνει με τον χρόνο του',
      fr: 'Quelque chose de beau grandit à son rythme',
    },
  },
  {
    textId: 'subtitle_museum',
    screenId: 'world',
    componentId: 'location_subtitle',
    labels: {
      en: 'A home for stories and memories',
      'ar-EG': 'مكان للحكايات والذكريات',
      it: 'Un posto per storie e ricordi',
      el: 'Ένας τόπος για ιστορίες και αναμνήσεις',
      fr: 'Un lieu pour les histoires et les souvenirs',
    },
  },
  {
    textId: 'key_shell_name',
    screenId: 'world',
    componentId: 'key_name',
    labels: {
      en: 'Shell Key',
      'ar-EG': 'مفتاح الصدفة',
      it: 'Chiave della conchiglia',
      el: 'Κλειδί του κοχυλιού',
      fr: 'Clé du coquillage',
    },
  },
  {
    textId: 'key_candle_name',
    screenId: 'world',
    componentId: 'key_name',
    labels: {
      en: 'Church Key',
      'ar-EG': 'مفتاح الكنيسة',
      it: 'Chiave della chiesa',
      el: 'Κλειδί της εκκλησίας',
      fr: 'Clé de l’église',
    },
  },
  {
    textId: 'key_music_name',
    screenId: 'world',
    componentId: 'key_name',
    labels: {
      en: 'Music Key',
      'ar-EG': 'مفتاح المزيكا',
      it: 'Chiave della musica',
      el: 'Κλειδί της μουσικής',
      fr: 'Clé de la musique',
    },
  },
  {
    textId: 'key_token_name',
    screenId: 'world',
    componentId: 'key_name',
    labels: {
      en: 'Arcade Key',
      'ar-EG': 'مفتاح اللعب',
      it: 'Chiave dei giochi',
      el: 'Κλειδί των παιχνιδιών',
      fr: 'Clé des jeux',
    },
  },
  {
    textId: 'key_letter_name',
    screenId: 'world',
    componentId: 'key_name',
    labels: {
      en: 'Letter Key',
      'ar-EG': 'مفتاح الرسالة',
      it: 'Chiave della lettera',
      el: 'Κλειδί του γράμματος',
      fr: 'Clé de la lettre',
    },
  },
  {
    textId: 'key_sunflower_name',
    screenId: 'world',
    componentId: 'key_name',
    labels: {
      en: 'Sunflower Key',
      'ar-EG': 'مفتاح دوّار الشمس',
      it: 'Chiave del girasole',
      el: 'Κλειδί του ηλίανθου',
      fr: 'Clé du tournesol',
    },
  },
  {
    textId: 'key_everkeep_name',
    screenId: 'world',
    componentId: 'key_name',
    labels: {
      en: 'The Everkeep Key',
      'ar-EG': 'مفتاح The Everkeep',
      it: 'Chiave di The Everkeep',
      el: 'Κλειδί του The Everkeep',
      fr: 'Clé de The Everkeep',
    },
  },
  {
    textId: 'ach_first_step_title',
    screenId: 'world',
    componentId: 'achievement_title',
    labels: {
      en: 'First Step',
      'ar-EG': 'أول خطوة',
      it: 'Primo passo',
      el: 'Πρώτο βήμα',
      fr: 'Premier pas',
    },
  },
  {
    textId: 'ach_first_step_desc',
    screenId: 'world',
    componentId: 'achievement_desc',
    labels: {
      en: 'The beginning of your story on the island.',
      'ar-EG': 'بداية حكايتك على الجزيرة.',
      it: 'L’inizio della tua storia sull’isola.',
      el: 'Η αρχή της ιστορίας σου στο νησί.',
      fr: 'Le début de ton histoire sur l’île.',
    },
  },
  {
    textId: 'ach_quiz_perfect_title',
    screenId: 'world',
    componentId: 'achievement_title',
    labels: {
      en: 'A Perfect Round',
      'ar-EG': 'إجابات على قدّ السؤال',
      it: 'Un giro perfetto',
      el: 'Ένας τέλειος γύρος',
      fr: 'Un sans-faute',
    },
  },
  {
    textId: 'ach_quiz_perfect_desc',
    screenId: 'world',
    componentId: 'achievement_desc',
    labels: {
      en: 'Complete all of today’s questions correctly.',
      'ar-EG': 'أكملي أسئلة اليوم كلها بإجابات صحيحة.',
      it: 'Completa tutte le domande di oggi con risposte corrette.',
      el: 'Ολοκλήρωσε σωστά όλες τις σημερινές ερωτήσεις.',
      fr: 'Réponds correctement à toutes les questions du jour.',
    },
  },
  {
    textId: 'ach_first_harvest_title',
    screenId: 'world',
    componentId: 'achievement_title',
    labels: {
      en: 'First Harvest',
      'ar-EG': 'أول حصاد',
      it: 'Primo raccolto',
      el: 'Πρώτη συγκομιδή',
      fr: 'Première récolte',
    },
  },
  {
    textId: 'ach_first_harvest_desc',
    screenId: 'world',
    componentId: 'achievement_desc',
    labels: {
      en: 'The first reward for tending your plants.',
      'ar-EG': 'أول ثمرة من تعب إيديكي.',
      it: 'Il primo frutto delle tue cure.',
      el: 'Ο πρώτος καρπός της φροντίδας σου.',
      fr: 'Le premier fruit de tes soins.',
    },
  },
  {
    textId: 'ach_secret_001_title',
    screenId: 'world',
    componentId: 'achievement_title',
    labels: {
      en: 'A Little Secret',
      'ar-EG': 'سر صغير',
      it: 'Un piccolo segreto',
      el: 'Ένα μικρό μυστικό',
      fr: 'Un petit secret',
    },
  },
  {
    textId: 'ach_secret_001_desc',
    screenId: 'world',
    componentId: 'achievement_desc',
    labels: {
      en: 'You found a little detail waiting for you.',
      'ar-EG': 'اكتشفتي تفصيلة كانت مستنياكي.',
      it: 'Hai scoperto un dettaglio che ti aspettava.',
      el: 'Ανακάλυψες μια μικρή λεπτομέρεια που σε περίμενε.',
      fr: 'Tu as découvert un petit détail qui t’attendait.',
    },
  },
  {
    textId: 'ui_language',
    screenId: 'global',
    componentId: 'language_button',
    labels: {
      en: 'Choose language',
      'ar-EG': 'اختيار اللغة',
      it: 'Scegli la lingua',
      el: 'Επιλογή γλώσσας',
      fr: 'Choisir la langue',
    },
  },
  {
    textId: 'ui_walkman',
    screenId: 'global',
    componentId: 'walkman_button',
    labels: {
      en: 'Open music player',
      'ar-EG': 'افتحي مشغّل المزيكا',
      it: 'Apri il lettore musicale',
      el: 'Άνοιγμα συσκευής μουσικής',
      fr: 'Ouvrir le lecteur de musique',
    },
  },
  {
    textId: 'ui_back',
    screenId: 'global',
    componentId: 'back_button',
    labels: { en: 'Back', 'ar-EG': 'رجوع', it: 'Indietro', el: 'Πίσω', fr: 'Retour' },
  },
  {
    textId: 'crop_sunflower_name',
    screenId: 'world',
    componentId: 'crop_name',
    labels: {
      en: 'Sunflower',
      'ar-EG': 'دوّار الشمس',
      it: 'Girasole',
      el: 'Ηλίανθος',
      fr: 'Tournesol',
    },
  },
  {
    textId: 'crop_mango_name',
    screenId: 'world',
    componentId: 'crop_name',
    labels: { en: 'Mango', 'ar-EG': 'مانجو', it: 'Mango', el: 'Μάνγκο', fr: 'Mangue' },
  },
  {
    textId: 'crop_blueberry_name',
    screenId: 'world',
    componentId: 'crop_name',
    labels: {
      en: 'Blueberry',
      'ar-EG': 'توت أزرق',
      it: 'Mirtillo',
      el: 'Μύρτιλο',
      fr: 'Myrtille',
    },
  },
  {
    textId: 'game_memory_name',
    screenId: 'world',
    componentId: 'game_name',
    labels: {
      en: 'Matching Cards',
      'ar-EG': 'الكروت المتشابهة',
      it: 'Carte gemelle',
      el: 'Ταιριαστές κάρτες',
      fr: 'Les cartes jumelles',
    },
  },
  {
    textId: 'game_catch_name',
    screenId: 'world',
    componentId: 'game_name',
    labels: {
      en: 'Catch the Surprises',
      'ar-EG': 'اللحاق بالمفاجآت',
      it: 'Acchiappa le sorprese',
      el: 'Πιάσε τις εκπλήξεις',
      fr: 'Attrape les surprises',
    },
  },
  {
    textId: 'game_puzzle_name',
    screenId: 'world',
    componentId: 'game_name',
    labels: {
      en: 'Picture Puzzle',
      'ar-EG': 'ركّبي الصورة',
      it: 'Ricomponi l’immagine',
      el: 'Παζλ εικόνας',
      fr: 'Recompose l’image',
    },
  },
  {
    textId: 'game_maze_name',
    screenId: 'world',
    componentId: 'game_name',
    labels: {
      en: 'The Way Out',
      'ar-EG': 'طريق الخروج',
      it: 'La via d’uscita',
      el: 'Η έξοδος',
      fr: 'La sortie',
    },
  },
  {
    textId: 'game_trivia_name',
    screenId: 'world',
    componentId: 'game_name',
    labels: {
      en: 'One More Question',
      'ar-EG': 'سؤال ورا سؤال',
      it: 'Un’altra domanda',
      el: 'Μια ακόμα ερώτηση',
      fr: 'Encore une question',
    },
  },
  {
    textId: 'exhibit_old_site_name',
    screenId: 'world',
    componentId: 'exhibit_name',
    labels: {
      en: 'From the First Chapter',
      'ar-EG': 'من الحكاية الأولى',
      it: 'Dal primo capitolo',
      el: 'Από το πρώτο κεφάλαιο',
      fr: 'Du premier chapitre',
    },
  },
  {
    textId: 'exhibit_comic_name',
    screenId: 'world',
    componentId: 'exhibit_name',
    labels: {
      en: 'A Story in Pictures',
      'ar-EG': 'حكاية بالرسومات',
      it: 'Una storia per immagini',
      el: 'Μια ιστορία με εικόνες',
      fr: 'Une histoire en images',
    },
  },
  {
    textId: 'exhibit_bday_name',
    screenId: 'world',
    componentId: 'exhibit_name',
    labels: {
      en: 'Your Birthday Chapter',
      'ar-EG': 'صفحة عيد ميلادك',
      it: 'Il capitolo del tuo compleanno',
      el: 'Το κεφάλαιο των γενεθλίων σου',
      fr: 'Le chapitre de ton anniversaire',
    },
  },
];

export function buildUiTextLabelRows(
  labels: readonly UiTextLabel[] = UI_TEXT_LABELS,
): Record<string, string>[] {
  return labels.flatMap((label) =>
    LOCALES.map((l) => ({
      ui_text_row_id: rowId(label.textId, l.suffix),
      text_id: label.textId,
      screen_id: label.screenId,
      component_id: label.componentId,
      locale: l.locale,
      text: label.labels[l.locale],
      direction: l.direction,
      aria_label: label.labels[l.locale],
      enabled: 'FALSE',
      version: '1',
    })),
  );
}

/**
 * `ui_map` already has live `en`/`ar-EG` rows (`ui_map_en`, `ui_map_ar`, both `screen_id: global`,
 * `component_id: map_button` — preserved exactly, never touched). Only the 3 missing locales are
 * proposed here, matching that live row's `screen_id`/`component_id`.
 */
export function buildUiMapFillRows(): Record<string, string>[] {
  const labels: UiTextLabel['labels'] = {
    en: 'Map',
    'ar-EG': 'الخريطة',
    it: 'Apri la mappa',
    el: 'Άνοιγμα χάρτη',
    fr: 'Ouvrir la carte',
  };
  return LOCALES.filter((l) => l.locale === 'it' || l.locale === 'el' || l.locale === 'fr').map(
    (l) => ({
      ui_text_row_id: rowId('ui_map', l.suffix),
      text_id: 'ui_map',
      screen_id: 'global',
      component_id: 'map_button',
      locale: l.locale,
      text: labels[l.locale],
      direction: l.direction,
      aria_label: labels[l.locale],
      enabled: 'FALSE',
      version: '1',
    }),
  );
}

/**
 * Idempotent and append-only across all three proposal sets (beat titles, the 40 new labels, and
 * the 3 missing `ui_map` locales) in one batched read + one batched write. An existing row —
 * including every one of the 867 already-live `08_UI_TEXT` rows — is never touched.
 */
export async function seedContentCompletionUiText(
  gateway: SheetGateway,
): Promise<{ created: string[]; existing: string[] }> {
  return gateway.appendRowsIfAbsent('08_UI_TEXT', [
    ...buildBeatTitleRows(),
    ...buildUiTextLabelRows(),
    ...buildUiMapFillRows(),
  ]);
}
