import { describe, expect, it } from 'vitest';
import { GOOD_WORKBOOK } from '@veoullas-world/test-fixtures';
import {
  getCharacterState,
  setCharacterNameAndGender,
  validatePersonalName,
  validateSelectedGender,
} from '../src/services/character-state.service.js';
import { SheetGateway } from '../src/repositories/sheet-gateway.js';
import { FakeGoogleSheetsClient } from './helpers/fake-sheets-client.js';

function gatewayFor(workbook: Record<string, string[][]>): SheetGateway {
  return new SheetGateway(new FakeGoogleSheetsClient(structuredClone(workbook)), {
    ttlSeconds: 60,
  });
}

const NOW = new Date('2026-09-16T10:00:00.000Z');

describe('getCharacterState', () => {
  it('returns null when no row exists yet', async () => {
    const gateway = gatewayFor(GOOD_WORKBOOK);
    const state = await getCharacterState(gateway, 'test_user_1', 'var');
    expect(state).toBeNull();
  });

  it("never returns another user's row", async () => {
    const gateway = gatewayFor(GOOD_WORKBOOK);
    await setCharacterNameAndGender(gateway, {
      userId: 'test_user_2',
      characterId: 'var',
      personalName: 'Luna',
      selectedGender: 'female',
      now: NOW,
    });

    const otherUser = await getCharacterState(gateway, 'someone_else', 'var');
    expect(otherUser).toBeNull();
  });
});

describe('setCharacterNameAndGender', () => {
  it('creates a new character-state row on first naming', async () => {
    const gateway = gatewayFor(GOOD_WORKBOOK);
    const result = await setCharacterNameAndGender(gateway, {
      userId: 'test_user_3',
      characterId: 'var',
      personalName: 'Luna',
      selectedGender: 'female',
      now: NOW,
    });

    expect(result.personalName).toBe('Luna');
    expect(result.selectedGender).toBe('female');
  });

  it('survives a refresh: getCharacterState reads back exactly what was set', async () => {
    const gateway = gatewayFor(GOOD_WORKBOOK);
    await setCharacterNameAndGender(gateway, {
      userId: 'test_user_4',
      characterId: 'var',
      personalName: 'Sunny',
      selectedGender: 'female',
      now: NOW,
    });

    const state = await getCharacterState(gateway, 'test_user_4', 'var');
    expect(state!.personalName).toBe('Sunny');
    expect(state!.selectedGender).toBe('female');
  });

  it('allows renaming later — updates are always permitted, not one-time', async () => {
    const gateway = gatewayFor(GOOD_WORKBOOK);
    await setCharacterNameAndGender(gateway, {
      userId: 'test_user_5',
      characterId: 'var',
      personalName: 'Luna',
      selectedGender: 'female',
      now: NOW,
    });
    const renamed = await setCharacterNameAndGender(gateway, {
      userId: 'test_user_5',
      characterId: 'var',
      personalName: 'Star',
      selectedGender: 'female',
      now: new Date(NOW.getTime() + 1000),
    });

    expect(renamed.personalName).toBe('Star');

    const raw = await gateway.getRawTab('37_CHARACTER_STATE', { bypass: true });
    const header = raw[0]!;
    const keyIdx = header.indexOf('user_character_key');
    const matches = raw.slice(1).filter((r) => r[keyIdx] === 'test_user_5|var');
    expect(matches).toHaveLength(1); // never duplicated
  });

  it('never exposes 36_CHARACTERS.system_name ("VAR") as the personal name', async () => {
    const gateway = gatewayFor(GOOD_WORKBOOK);
    const result = await setCharacterNameAndGender(gateway, {
      userId: 'test_user_6',
      characterId: 'var',
      personalName: 'Whiskers',
      selectedGender: 'female',
      now: NOW,
    });
    expect(result.personalName).not.toBe('VAR');
    expect(JSON.stringify(result)).not.toContain('"VAR"');
  });

  it('never mutates a pre-existing fixture row for a different user (isolation)', async () => {
    // GOOD_WORKBOOK's own fixture row uses character_id "char_var" (a
    // fixture-authoring detail distinct from the live Sheet's "var") —
    // isolation only needs any pre-existing row, whatever its id.
    const gateway = gatewayFor(GOOD_WORKBOOK);
    const before = await gateway.findByPrimaryKey('37_CHARACTER_STATE', 'veoulla|char_var', {
      bypass: true,
    });

    await setCharacterNameAndGender(gateway, {
      userId: 'test_user_7',
      characterId: 'var',
      personalName: 'Comet',
      selectedGender: 'male',
      now: NOW,
    });

    const after = await gateway.findByPrimaryKey('37_CHARACTER_STATE', 'veoulla|char_var', {
      bypass: true,
    });
    expect(after!.row.raw).toEqual(before!.row.raw);
  });
});

describe('validatePersonalName', () => {
  it('trims whitespace and accepts a normal name', () => {
    expect(validatePersonalName('  Luna  ')).toBe('Luna');
  });
  it('rejects blank/whitespace-only input', () => {
    expect(validatePersonalName('   ')).toBeNull();
    expect(validatePersonalName('')).toBeNull();
  });
  it('rejects a non-string', () => {
    expect(validatePersonalName(42)).toBeNull();
  });
  it('rejects a name longer than 40 characters', () => {
    expect(validatePersonalName('a'.repeat(41))).toBeNull();
    expect(validatePersonalName('a'.repeat(40))).toBe('a'.repeat(40));
  });
});

describe('validateSelectedGender', () => {
  it('accepts only the canonical stored values', () => {
    expect(validateSelectedGender('female')).toBe('female');
    expect(validateSelectedGender('male')).toBe('male');
    for (const bad of ['nonbinary', 'Female', ' male', 'MALE', 'x', '']) {
      expect(validateSelectedGender(bad)).toBeNull();
    }
  });
  it('rejects blank input', () => {
    expect(validateSelectedGender('')).toBeNull();
  });
  it('rejects an overly long value', () => {
    expect(validateSelectedGender('a'.repeat(21))).toBeNull();
  });
});
