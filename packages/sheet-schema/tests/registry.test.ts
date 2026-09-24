import { describe, expect, it } from 'vitest';
import {
  EXPECTED_TAB_COUNT,
  TAB_NAMES,
  TAB_REGISTRY,
  TABLE_TAB_NAMES,
  isTableTab,
} from '../src/index.js';

describe('tab registry', () => {
  it('contains exactly 44 unique tab definitions', () => {
    expect(EXPECTED_TAB_COUNT).toBe(44);
    expect(TAB_NAMES.length).toBe(44);
    expect(new Set(TAB_NAMES).size).toBe(44);
    expect(Object.keys(TAB_REGISTRY).length).toBe(44);
  });

  it('has a registry entry for every declared tab name', () => {
    for (const name of TAB_NAMES) {
      expect(TAB_REGISTRY[name]).toBeDefined();
      expect(TAB_REGISTRY[name]!.name).toBe(name);
    }
  });

  it('matches the exact 44 tab names from the accepted workbook (order-independent)', () => {
    const expected = [
      '00_README',
      '01_APP_CONFIG',
      '02_USERS',
      '03_SECRETS_DEV',
      '04_ADMIN_FLAGS',
      '05_ENTRY_LOGS',
      '06_SESSIONS',
      '07_LANGUAGES',
      '08_UI_TEXT',
      '09_ICONS',
      '10_ASSETS',
      '11_LOCATIONS',
      '12_SCENES',
      '13_ROUTES',
      '14_STORY_BEATS',
      '15_DIALOGUE',
      '16_VOICEOVER',
      '17_EVENTS',
      '18_EVENT_PHASES',
      '19_MESSAGES',
      '20_SONGS',
      '21_KEYS',
      '22_KEY_RULES',
      '23_ACHIEVEMENTS',
      '24_PLAYER_PROGRESS',
      '25_PLAYER_KEYS',
      '26_PLAYER_ACHIEV',
      '27_PLAYER_MESSAGES',
      '28_FARM_CROPS',
      '29_PLAYER_FARM',
      '30_CHURCH_CONTENT',
      '31_CHURCH_QUIZ',
      '32_ARCADE_GAMES',
      '33_PLAYER_SCORES',
      '34_MUSEUM_EXHIBITS',
      '35_PLAYER_EXHIBITS',
      '36_CHARACTERS',
      '37_CHARACTER_STATE',
      '38_DATA_DICTIONARY',
      '39_VALIDATION_LISTS',
      '40_VAR_CONVERSATIONS',
      '41_VAR_MEMORIES',
      '42_ARCADE_TRIVIA',
      '43_COMPANION_HINTS',
    ].sort();
    expect([...TAB_NAMES].sort()).toEqual(expected);
  });

  it('gives every table tab a primary key or an explicit derived primary key function', () => {
    for (const name of TABLE_TAB_NAMES) {
      const def = TAB_REGISTRY[name];
      expect(isTableTab(def)).toBe(true);
      if (isTableTab(def)) {
        expect(def.primaryKey !== null || typeof def.derivedPrimaryKey === 'function').toBe(true);
      }
    }
  });

  it('treats 39_VALIDATION_LISTS primary key as derived (list_value_key is not a literal column)', () => {
    const def = TAB_REGISTRY['39_VALIDATION_LISTS'];
    if (isTableTab(def)) {
      expect(def.primaryKey).toBeNull();
      expect(def.derivedPrimaryKey).toBeTypeOf('function');
      expect(def.columns.some((c) => c.name === 'list_value_key')).toBe(false);
    }
  });

  it('wires 05_ENTRY_LOGS.event_type to the entry_event_type controlled list (M02 completion fix)', () => {
    const entryLogs = TAB_REGISTRY['05_ENTRY_LOGS'];
    if (isTableTab(entryLogs)) {
      const eventTypeColumn = entryLogs.columns.find((c) => c.name === 'event_type');
      expect(eventTypeColumn?.controlledList).toBe('entry_event_type');
    }
  });

  it('does not treat locale-repeated content/group IDs as the primary key for multilingual tabs', () => {
    const uiText = TAB_REGISTRY['08_UI_TEXT'];
    const dialogue = TAB_REGISTRY['15_DIALOGUE'];
    const messages = TAB_REGISTRY['19_MESSAGES'];
    if (isTableTab(uiText)) expect(uiText.primaryKey).toBe('ui_text_row_id');
    if (isTableTab(dialogue)) expect(dialogue.primaryKey).toBe('dialogue_row_id');
    if (isTableTab(messages)) expect(messages.primaryKey).toBe('message_row_id');
  });
});
