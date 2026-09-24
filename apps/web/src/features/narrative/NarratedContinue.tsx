import { useEffect, useMemo, useState } from 'react';
import type {
  JourneyStateResponse,
  RuntimeDialogueLine,
  RuntimeUiTextEntry,
} from '@veoullas-world/contracts';
import type { LocaleCode } from '../../i18n/locales';
import { worldApi } from '../world/worldClient';
import { dialogueIdsFor } from '../world/Narration';
import { ContinueButton } from './ContinueButton';
import { DialogueText } from './DialogueText';
import { resolveDialogueCue } from './resolveDialogueCue';
import styles from './NarratedContinue.module.css';

export interface NarratedContinueProps {
  /** The Sheet's own story beat this screen belongs to (`14_STORY_BEATS.beat_id`). */
  beatId: string;
  dialogue: RuntimeDialogueLine[];
  uiText: RuntimeUiTextEntry[];
  locale: LocaleCode;
  onContinue: () => void;
  disabled?: boolean;
  testId: string;
}

/**
 * The Continue action of a first-opening screen, plus whatever the Sheet
 * actually holds for that screen's story beat. The beat's `dialogue_group_id`
 * is looked up from the journey state; each line waits for the player's own
 * Continue. If the Sheet has no row for the beat, only a bare Continue is
 * shown — no empty panel, no invented text, and no skipped progression.
 */
export function NarratedContinue({
  beatId,
  dialogue,
  uiText,
  locale,
  onContinue,
  disabled,
  testId,
}: NarratedContinueProps) {
  const [groupId, setGroupId] = useState<string | null>(null);
  const [index, setIndex] = useState(0);

  useEffect(() => {
    let cancelled = false;
    void worldApi.get<JourneyStateResponse>('/journey').then((result) => {
      if (cancelled || result.status !== 'online') return;
      setGroupId(result.data.beats.find((b) => b.beatId === beatId)?.dialogueGroupId ?? null);
    });
    return () => {
      cancelled = true;
    };
  }, [beatId]);

  const ids = useMemo(
    () => (groupId ? dialogueIdsFor(dialogue, groupId) : []),
    [dialogue, groupId],
  );
  const cue = ids.length > 0 ? resolveDialogueCue(dialogue, ids[index] ?? ids[0]!, locale) : null;
  const hasText = !!cue && !cue.isMissing;

  return (
    <div className={hasText ? styles.panel : styles.bare} data-testid="narrated-continue">
      {hasText && <DialogueText cue={cue} />}
      <ContinueButton
        uiText={uiText}
        locale={locale}
        className={styles.button}
        testId={testId}
        disabled={disabled}
        onClick={() => {
          if (index + 1 < ids.length) return setIndex(index + 1);
          onContinue();
        }}
      />
    </div>
  );
}
