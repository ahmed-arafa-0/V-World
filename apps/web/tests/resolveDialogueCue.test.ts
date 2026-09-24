import { describe, expect, it } from 'vitest';
import type { RuntimeDialogueLine } from '@veoullas-world/contracts';
import { resolveDialogueCue } from '../src/features/narrative/resolveDialogueCue';

function dialogueLine(overrides: Partial<RuntimeDialogueLine>): RuntimeDialogueLine {
  return {
    dialogueRowId: 'row_1',
    dialogueId: 'dlg_test',
    groupId: 'grp_test',
    sequence: 1,
    speakerId: 'char_var',
    locale: 'en',
    text: 'Hello',
    direction: 'ltr',
    emotion: 'neutral',
    displayMode: 'speech_bubble',
    requiresResponse: false,
    ...overrides,
  };
}

describe('resolveDialogueCue', () => {
  const dialogue = [
    dialogueLine({ locale: 'en', text: 'You made it.', displayMode: 'narration' }),
    dialogueLine({ locale: 'ar-EG', text: 'وصلتي.', direction: 'rtl', displayMode: 'narration' }),
  ];

  it('returns the exact-locale line when present', () => {
    const cue = resolveDialogueCue(dialogue, 'dlg_test', 'en');
    expect(cue).toEqual({
      text: 'You made it.',
      direction: 'ltr',
      displayMode: 'narration',
      isFallback: false,
      isMissing: false,
    });
  });

  it('carries the exact-locale line unchanged with no audio fields present', () => {
    const cue = resolveDialogueCue(dialogue, 'dlg_test', 'ar-EG');
    expect(cue.text).toBe('وصلتي.');
    expect(cue.direction).toBe('rtl');
    expect(cue.isFallback).toBe(false);
    expect(cue).not.toHaveProperty('mediaRef');
    expect(cue).not.toHaveProperty('durationMs');
  });

  it('falls back to English when the requested locale has no row', () => {
    const cue = resolveDialogueCue(dialogue, 'dlg_test', 'it');
    expect(cue.text).toBe('You made it.');
    expect(cue.isFallback).toBe(true);
    expect(cue.isMissing).toBe(false);
  });

  it('returns a safe missing placeholder — never the raw dialogue_id — when no row exists in any locale', () => {
    const cue = resolveDialogueCue(dialogue, 'dlg_does_not_exist', 'fr');
    expect(cue.text).not.toContain('dlg_does_not_exist');
    expect(cue.isMissing).toBe(true);
  });

  it('resolves a static direction for the missing case based on the requested locale', () => {
    const cue = resolveDialogueCue(dialogue, 'dlg_missing', 'ar-EG');
    expect(cue.direction).toBe('rtl');
  });

  it('preserves displayMode from the resolved row so bubble vs. cinematic presentation is data-driven', () => {
    const bubbleDialogue = [dialogueLine({ locale: 'en', displayMode: 'speech_bubble' })];
    const cue = resolveDialogueCue(bubbleDialogue, 'dlg_test', 'en');
    expect(cue.displayMode).toBe('speech_bubble');
  });
});
