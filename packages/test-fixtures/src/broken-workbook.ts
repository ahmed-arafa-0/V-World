import { GOOD_WORKBOOK, type RawWorkbook } from './good-workbook.js';

/**
 * A deliberately damaged variant of GOOD_WORKBOOK used only to prove the
 * schema-health service actually detects each class of problem. Every
 * mutation below maps to one specific diagnostic the M01 spec requires.
 */
function buildBrokenWorkbook(): Record<string, string[][]> {
  const workbook: Record<string, string[][]> = structuredClone(GOOD_WORKBOOK) as unknown as Record<
    string,
    string[][]
  >;

  // 1. Missing tab entirely.
  delete workbook['18_EVENT_PHASES'];

  // 2. Duplicate primary key in 21_KEYS (two rows sharing key_type_id "key_shell").
  const keysHeader = workbook['21_KEYS']![0]!;
  const keyTypeIdx = keysHeader.indexOf('key_type_id');
  const shellRow = workbook['21_KEYS']!.find((r) => r[keyTypeIdx] === 'key_shell')!;
  workbook['21_KEYS'] = [...workbook['21_KEYS']!, [...shellRow]];

  // 3. Blank primary key in 11_LOCATIONS (blanks the "church" row's location_id).
  const locationsHeader = workbook['11_LOCATIONS']![0]!;
  const locationIdIdx = locationsHeader.indexOf('location_id');
  const churchRowIdx = workbook['11_LOCATIONS']!.findIndex((r) => r[locationIdIdx] === 'church');
  workbook['11_LOCATIONS']![churchRowIdx]![locationIdIdx] = '';

  // 4. Invalid boolean in 07_LANGUAGES ("enabled" set to an unrecognized value).
  const languagesHeader = workbook['07_LANGUAGES']![0]!;
  const enabledIdx = languagesHeader.indexOf('enabled');
  workbook['07_LANGUAGES']![1]![enabledIdx] = 'maybe';

  // 5. Invalid controlled-list value in 07_LANGUAGES ("direction" set to a value not in the list).
  const directionIdx = languagesHeader.indexOf('direction');
  workbook['07_LANGUAGES']![2]![directionIdx] = 'sideways';

  // 6. Broken relationship: a key rule references a key type that does not exist.
  // (key_type_id has no controlled-list check, so this exercises the
  // relationship checker in isolation rather than double-tripping a
  // controlled-value diagnostic too.)
  const keyRulesHeader = workbook['22_KEY_RULES']![0]!;
  const keyRuleKeyTypeIdx = keyRulesHeader.indexOf('key_type_id');
  workbook['22_KEY_RULES']![1]![keyRuleKeyTypeIdx] = 'key_does_not_exist';

  // 7. Invalid integer: a story beat's sequence is not a number.
  const beatsHeader = workbook['14_STORY_BEATS']![0]!;
  const sequenceIdx = beatsHeader.indexOf('sequence');
  workbook['14_STORY_BEATS']![2]![sequenceIdx] = 'not-a-number';

  return workbook;
}

export const BROKEN_WORKBOOK: Partial<RawWorkbook> & Record<string, string[][]> =
  buildBrokenWorkbook();
