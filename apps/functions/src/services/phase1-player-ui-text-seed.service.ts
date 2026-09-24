import type { SheetGateway } from '../repositories/sheet-gateway.js';

/**
 * The `player_*` UI-text groups the scene/settings controls resolve
 * Sheet-first (`playerText()` looks up `player_<key>`). The values are the
 * exact five-language labels already shipped as the frontend's offline
 * fallback, so registering them changes no wording. One row per locale, using
 * the existing 08_UI_TEXT conventions (`ui_<id>_<en|ar|it|el|fr>` row ids,
 * per-locale `direction`, `aria_label` = the same label).
 */
export interface PlayerUiTextGroup {
  textId: string;
  componentId: string;
  /** en, ar-EG, it, el, fr — same order as 07_LANGUAGES. */
  labels: readonly [string, string, string, string, string];
}

const LOCALES = [
  { locale: 'en', suffix: 'en', direction: 'ltr' },
  { locale: 'ar-EG', suffix: 'ar', direction: 'rtl' },
  { locale: 'it', suffix: 'it', direction: 'ltr' },
  { locale: 'el', suffix: 'el', direction: 'ltr' },
  { locale: 'fr', suffix: 'fr', direction: 'ltr' },
] as const;

export const PLAYER_UI_TEXT_GROUPS: readonly PlayerUiTextGroup[] = [
  {
    textId: 'player_forward',
    componentId: 'forward',
    labels: ['Walk forward', 'اتقدمي', 'Avanza', 'Προχώρα', 'Avancer'],
  },
  {
    textId: 'player_back',
    componentId: 'back',
    labels: ['Walk back', 'ارجعي', 'Torna indietro', 'Πίσω', 'Reculer'],
  },
  {
    textId: 'player_lookLeft',
    componentId: 'look_left',
    labels: ['Look left', 'بصي شمال', 'Guarda a sinistra', 'Κοίτα αριστερά', 'Regarder à gauche'],
  },
  {
    textId: 'player_lookRight',
    componentId: 'look_right',
    labels: ['Look right', 'بصي يمين', 'Guarda a destra', 'Κοίτα δεξιά', 'Regarder à droite'],
  },
  {
    textId: 'player_interact',
    componentId: 'interact',
    labels: ['Interact', 'تفاعلي', 'Interagisci', 'Αλληλεπίδραση', 'Interagir'],
  },
  {
    textId: 'player_settings',
    componentId: 'settings',
    labels: ['Settings', 'الإعدادات', 'Impostazioni', 'Ρυθμίσεις', 'Réglages'],
  },
  {
    textId: 'player_language',
    componentId: 'language',
    labels: ['Language', 'اللغة', 'Lingua', 'Γλώσσα', 'Langue'],
  },
  {
    textId: 'player_logout',
    componentId: 'logout',
    labels: ['Log out', 'تسجيل الخروج', 'Esci', 'Αποσύνδεση', 'Se déconnecter'],
  },
  {
    textId: 'player_skip',
    componentId: 'skip',
    labels: [
      'Skip to content',
      'روحي للمحتوى',
      'Vai al contenuto',
      'Μετάβαση στο περιεχόμενο',
      'Aller au contenu',
    ],
  },
  {
    textId: 'player_increase',
    componentId: 'increase',
    labels: ['Increase', 'زودي', 'Aumenta', 'Αύξηση', 'Augmenter'],
  },
  {
    textId: 'player_decrease',
    componentId: 'decrease',
    labels: ['Decrease', 'قللي', 'Diminuisci', 'Μείωση', 'Diminuer'],
  },
  {
    textId: 'player_shell',
    componentId: 'shell',
    labels: [
      'A shell on the sand',
      'صدفة على الرمل',
      'Una conchiglia sulla sabbia',
      'Ένα κοχύλι στην άμμο',
      'Un coquillage sur le sable',
    ],
  },
  {
    textId: 'player_path_to_steps',
    componentId: 'path_to_steps',
    labels: [
      'Path to the three steps',
      'الطريق للتلات درجات',
      'Verso i tre gradini',
      'Προς τα τρία σκαλιά',
      'Vers les trois marches',
    ],
  },
  {
    textId: 'player_church_door_hint',
    componentId: 'church_door_hint',
    labels: [
      'The Church door ahead',
      'باب الكنيسة قدامك',
      'La porta della chiesa',
      'Η πόρτα της εκκλησίας',
      'La porte de l’église',
    ],
  },
  {
    textId: 'player_church_door',
    componentId: 'church_door',
    labels: [
      'Church entrance',
      'مدخل الكنيسة',
      'Ingresso della chiesa',
      'Είσοδος εκκλησίας',
      'Entrée de l’église',
    ],
  },
];

export interface PlayerUiTextSeedOutcome {
  created: string[];
  existing: string[];
}

export function buildPlayerUiTextRows(
  groups: readonly PlayerUiTextGroup[] = PLAYER_UI_TEXT_GROUPS,
): Record<string, string>[] {
  return groups.flatMap((group) =>
    LOCALES.map((l, i) => ({
      ui_text_row_id: `${group.textId}_${l.suffix}`,
      text_id: group.textId,
      screen_id: 'player',
      component_id: group.componentId,
      locale: l.locale,
      text: group.labels[i]!,
      direction: l.direction,
      aria_label: group.labels[i]!,
      enabled: 'TRUE',
      version: '1',
    })),
  );
}

/**
 * Idempotent and append-only: a row whose `ui_text_row_id` already exists is
 * never touched (so hand-edited translations and formulas survive); only the
 * absent rows are appended, in one batch write.
 */
export async function seedPlayerUiText(
  gateway: SheetGateway,
  groups: readonly PlayerUiTextGroup[] = PLAYER_UI_TEXT_GROUPS,
): Promise<PlayerUiTextSeedOutcome> {
  return gateway.appendRowsIfAbsent('08_UI_TEXT', buildPlayerUiTextRows(groups));
}
