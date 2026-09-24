import { fetchJson, type ApiFetchResult } from './apiClient';

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

export interface CharacterStateResponse {
  ok: true;
  character: CharacterStateSummary | null;
}

export function fetchCharacterState(
  characterId: string,
): Promise<ApiFetchResult<CharacterStateResponse>> {
  return fetchJson<CharacterStateResponse>(
    `/api/character/state?characterId=${encodeURIComponent(characterId)}`,
  );
}

export interface SetCharacterNameRequest {
  characterId: string;
  personalName: string;
  selectedGender: string;
}

export interface SetCharacterNameResponse {
  ok: true;
  character: CharacterStateSummary;
}

export async function postCharacterName(
  body: SetCharacterNameRequest,
): Promise<ApiFetchResult<SetCharacterNameResponse>> {
  try {
    const response = await fetch('/api/character/name', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      let message = `Backend responded with status ${response.status}`;
      try {
        const parsed: unknown = await response.json();
        if (
          parsed &&
          typeof parsed === 'object' &&
          'message' in parsed &&
          typeof parsed.message === 'string'
        ) {
          message = parsed.message;
        }
      } catch {
        // Response wasn't JSON; keep the generic status message.
      }
      return { status: 'offline', message };
    }
    const data = (await response.json()) as SetCharacterNameResponse;
    return { status: 'online', data };
  } catch {
    return { status: 'offline', message: 'Backend is unreachable' };
  }
}
