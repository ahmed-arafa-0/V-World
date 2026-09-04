import type { RelationshipDefinition } from './types.js';

/**
 * A representative (not exhaustive) set of cross-tab references used for
 * schema-health "broken reference" diagnostics.
 */
export const RELATIONSHIPS: RelationshipDefinition[] = [
  {
    fromTab: '11_LOCATIONS',
    fromColumn: 'entry_scene_id',
    toTab: '12_SCENES',
    toColumn: 'scene_id',
  },
  {
    fromTab: '11_LOCATIONS',
    fromColumn: 'key_type_id',
    toTab: '21_KEYS',
    toColumn: 'key_type_id',
    allowBlank: true,
  },
  // Note: 12_SCENES.location_id and 14_STORY_BEATS.location_id are deliberately
  // NOT checked against 11_LOCATIONS here. Both legitimately use "map" (the
  // island overview) as a location_id — e.g. scene_map and the final
  // beat_18_complete — which is a valid value in the "location" controlled
  // list (see 39_VALIDATION_LISTS) but is not a physical row in 11_LOCATIONS.
  // The controlledList: 'location' check on those columns already validates
  // them correctly; a stricter FK-to-11_LOCATIONS check would incorrectly
  // flag "map" as a broken reference.
  { fromTab: '13_ROUTES', fromColumn: 'start_scene_id', toTab: '12_SCENES', toColumn: 'scene_id' },
  { fromTab: '13_ROUTES', fromColumn: 'end_scene_id', toTab: '12_SCENES', toColumn: 'scene_id' },
  { fromTab: '14_STORY_BEATS', fromColumn: 'route_id', toTab: '13_ROUTES', toColumn: 'route_id' },
  { fromTab: '14_STORY_BEATS', fromColumn: 'scene_id', toTab: '12_SCENES', toColumn: 'scene_id' },
  {
    fromTab: '14_STORY_BEATS',
    fromColumn: 'next_beat_id',
    toTab: '14_STORY_BEATS',
    toColumn: 'beat_id',
    allowBlank: true,
  },
  {
    fromTab: '15_DIALOGUE',
    fromColumn: 'next_dialogue_id',
    toTab: '15_DIALOGUE',
    toColumn: 'dialogue_id',
    allowBlank: true,
  },
  {
    fromTab: '19_MESSAGES',
    fromColumn: 'recipient_user_id',
    toTab: '02_USERS',
    toColumn: 'user_id',
    allowBlank: true,
  },
  {
    fromTab: '20_SONGS',
    fromColumn: 'location_id',
    toTab: '11_LOCATIONS',
    toColumn: 'location_id',
  },
  {
    fromTab: '21_KEYS',
    fromColumn: 'location_id',
    toTab: '11_LOCATIONS',
    toColumn: 'location_id',
    allowBlank: true,
  },
  { fromTab: '22_KEY_RULES', fromColumn: 'key_type_id', toTab: '21_KEYS', toColumn: 'key_type_id' },
  {
    fromTab: '23_ACHIEVEMENTS',
    fromColumn: 'reward_key_type_id',
    toTab: '21_KEYS',
    toColumn: 'key_type_id',
    allowBlank: true,
  },
  {
    fromTab: '17_EVENTS',
    fromColumn: 'story_route_id',
    toTab: '13_ROUTES',
    toColumn: 'route_id',
    allowBlank: true,
  },
  { fromTab: '18_EVENT_PHASES', fromColumn: 'event_id', toTab: '17_EVENTS', toColumn: 'event_id' },
  {
    fromTab: '24_PLAYER_PROGRESS',
    fromColumn: 'story_route_id',
    toTab: '13_ROUTES',
    toColumn: 'route_id',
  },
  {
    fromTab: '24_PLAYER_PROGRESS',
    fromColumn: 'current_beat_id',
    toTab: '14_STORY_BEATS',
    toColumn: 'beat_id',
    allowBlank: true,
  },
  {
    fromTab: '25_PLAYER_KEYS',
    fromColumn: 'key_type_id',
    toTab: '21_KEYS',
    toColumn: 'key_type_id',
  },
  {
    fromTab: '26_PLAYER_ACHIEV',
    fromColumn: 'achievement_id',
    toTab: '23_ACHIEVEMENTS',
    toColumn: 'achievement_id',
  },
  { fromTab: '29_PLAYER_FARM', fromColumn: 'crop_id', toTab: '28_FARM_CROPS', toColumn: 'crop_id' },
  {
    fromTab: '31_CHURCH_QUIZ',
    fromColumn: 'achievement_id',
    toTab: '23_ACHIEVEMENTS',
    toColumn: 'achievement_id',
    allowBlank: true,
  },
  {
    fromTab: '31_CHURCH_QUIZ',
    fromColumn: 'key_reward_type_id',
    toTab: '21_KEYS',
    toColumn: 'key_type_id',
    allowBlank: true,
  },
  {
    fromTab: '32_ARCADE_GAMES',
    fromColumn: 'key_cost_type_id',
    toTab: '21_KEYS',
    toColumn: 'key_type_id',
    allowBlank: true,
  },
  {
    fromTab: '33_PLAYER_SCORES',
    fromColumn: 'game_id',
    toTab: '32_ARCADE_GAMES',
    toColumn: 'game_id',
  },
  {
    fromTab: '35_PLAYER_EXHIBITS',
    fromColumn: 'exhibit_id',
    toTab: '34_MUSEUM_EXHIBITS',
    toColumn: 'exhibit_id',
  },
  {
    fromTab: '36_CHARACTERS',
    fromColumn: 'home_location_id',
    toTab: '11_LOCATIONS',
    toColumn: 'location_id',
    allowBlank: true,
  },
  {
    fromTab: '37_CHARACTER_STATE',
    fromColumn: 'character_id',
    toTab: '36_CHARACTERS',
    toColumn: 'character_id',
  },
];
