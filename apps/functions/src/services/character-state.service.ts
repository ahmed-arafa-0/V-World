import type { SheetGateway } from '../repositories/sheet-gateway.js';
import { CANONICAL_GENDERS } from '@veoullas-world/contracts';
import { AppError } from '../errors/app-error.js';

export interface CharacterStateSummary {
  userId: string;
  characterId: string;
  personalName: string;
  selectedGender: string;
  relationshipLevel: string;
  currentLocation: string;
  mood: string;
  updatedAt: string;
}

/** `|` matches the real live Sheet's existing convention (e.g. `veoulla|var`) — same as the M04 player-state tabs. */
function characterRowKey(userId: string, characterId: string): string {
  return `${userId}|${characterId}`;
}

function toSummary(raw: Record<string, string>): CharacterStateSummary {
  return {
    userId: raw.user_id ?? '',
    characterId: raw.character_id ?? '',
    // `story_flags_json` is deliberately never exposed here — it can hold
    // narrative bookkeeping (e.g. whether VAR's secret has been revealed)
    // that a general character-state read has no reason to leak to the
    // frontend. Living Bible §18H: "The nature of VAR's central secret is
    // intentionally undefined... the world may plant clues without
    // confirming an answer" — this API must not become that leak.
    personalName: raw.personal_name ?? '',
    selectedGender: raw.selected_gender ?? '',
    relationshipLevel: raw.relationship_level ?? '',
    currentLocation: raw.current_location ?? '',
    mood: raw.mood ?? '',
    updatedAt: raw.updated_at ?? '',
  };
}

/** Reads one user's one character's state (never another user's row). Returns null if the row doesn't exist yet. */
export async function getCharacterState(
  gateway: SheetGateway,
  userId: string,
  characterId: string,
): Promise<CharacterStateSummary | null> {
  const found = await gateway.findByPrimaryKey(
    '37_CHARACTER_STATE',
    characterRowKey(userId, characterId),
  );
  return found ? toSummary(found.row.raw) : null;
}

export interface SetCharacterNameInput {
  userId: string;
  characterId: string;
  personalName: string;
  selectedGender: string;
  now: Date;
}

/**
 * Sets (or later changes) a character's player-chosen name/gender —
 * Living Bible §18H: "the chosen name can be changed later," and renaming
 * is available from multiple UI surfaces at any time, not just once during
 * the first-visit naming beat. This is therefore a plain, always-allowed
 * upsert (no one-time-claim idempotency guard is appropriate here, unlike
 * M04's key/achievement rewards) — every reader of `37_CHARACTER_STATE`
 * (collar, Cottage place, Settings) sees the same row, so "renaming updates
 * everywhere consistently" is satisfied by construction, not by fan-out
 * writes to multiple places.
 *
 * `36_CHARACTERS.system_name` (e.g. `"VAR"`) is never read or returned by
 * this service — the internal identifier must never surface as the
 * player-facing name.
 */
export async function setCharacterNameAndGender(
  gateway: SheetGateway,
  input: SetCharacterNameInput,
): Promise<CharacterStateSummary> {
  const key = characterRowKey(input.userId, input.characterId);
  const existing = await gateway.findByPrimaryKey('37_CHARACTER_STATE', key);

  const patch: Record<string, string> = {
    personal_name: input.personalName,
    selected_gender: input.selectedGender,
    updated_at: input.now.toISOString(),
  };

  if (!existing) {
    await gateway.appendRow('37_CHARACTER_STATE', {
      user_character_key: key,
      user_id: input.userId,
      character_id: input.characterId,
      relationship_level: 'new',
      current_location: '',
      current_activity: '',
      mood: '',
      known_words_count: '0',
      deliveries_count: '0',
      story_flags_json: '{}',
      ...patch,
    });
    return toSummary({ user_id: input.userId, character_id: input.characterId, ...patch });
  }

  await gateway.updateByPrimaryKey('37_CHARACTER_STATE', key, patch);
  return toSummary({ ...existing.row.raw, ...patch });
}

const MAX_NAME_LENGTH = 40;

export function validatePersonalName(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.length > MAX_NAME_LENGTH) return null;
  return trimmed;
}

/**
 * New writes accept only the canonical stored values (`male` / `female`).
 * Older rows may hold free text; those are still READ as-is and are never
 * bulk-rewritten or silently reassigned — the player simply chooses again on
 * the next save.
 */
export function validateSelectedGender(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  return (CANONICAL_GENDERS as readonly string[]).includes(value) ? value : null;
}

export function requireValidCharacterId(value: unknown): string {
  if (typeof value !== 'string' || !/^[a-z_]+$/.test(value)) {
    throw new AppError('invalid_request', 'A valid characterId is required.');
  }
  return value;
}
