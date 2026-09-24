import { useMemo, useState } from 'react';
import type { RuntimeDialogueLine, RuntimeUiTextEntry } from '@veoullas-world/contracts';
import type { LocaleCode } from '../../i18n/locales';
import { ContinueButton } from '../narrative/ContinueButton';
import { DialogueText } from '../narrative/DialogueText';
import { resolveDialogueCue } from '../narrative/resolveDialogueCue';
import styles from './world.module.css';

const SEEN = 'vw_world_seen_beats_v1';

function seenSet(): Set<string> {
  try {
    return new Set(JSON.parse(window.sessionStorage.getItem(SEEN) ?? '[]') as string[]);
  } catch {
    return new Set();
  }
}
function markSeen(key: string): void {
  try {
    const set = seenSet();
    set.add(key);
    window.sessionStorage.setItem(SEEN, JSON.stringify([...set]));
  } catch {
    // Session storage is a nicety; the narration simply may replay in a blocked browser.
  }
}

/** The ordered dialogue ids of one Sheet group (`15_DIALOGUE.group_id`), by sequence. */
export function dialogueIdsFor(dialogue: RuntimeDialogueLine[], groupId: string): string[] {
  const rows = dialogue.filter((d) => d.groupId === groupId);
  const first = new Map<string, number>();
  for (const row of rows) if (!first.has(row.dialogueId)) first.set(row.dialogueId, row.sequence);
  return [...first.entries()].sort((a, b) => a[1] - b[1]).map(([id]) => id);
}

/**
 * Text-only narration for a story beat, straight from the Sheet's dialogue
 * group. Nothing is invented: a group with no rows shows nothing at all. Each
 * line waits for the player's own Continue and is never auto-dismissed.
 */
export function BeatNarration({
  groupId,
  seenKey,
  dialogue,
  locale,
  uiText,
  onDone,
}: {
  groupId: string;
  seenKey: string;
  dialogue: RuntimeDialogueLine[];
  locale: LocaleCode;
  uiText: RuntimeUiTextEntry[];
  onDone?: () => void;
}) {
  const ids = useMemo(() => dialogueIdsFor(dialogue, groupId), [dialogue, groupId]);
  const [index, setIndex] = useState(0);
  const [hidden, setHidden] = useState(() => seenSet().has(seenKey));
  if (hidden || ids.length === 0) return null;
  const cue = resolveDialogueCue(dialogue, ids[index]!, locale);
  return (
    <div className={styles.narration} data-testid="beat-narration" data-group={groupId}>
      <DialogueText cue={cue} />
      <ContinueButton
        uiText={uiText}
        locale={locale}
        className={styles.actionButton}
        testId="narration-continue"
        onClick={() => {
          if (index + 1 < ids.length) return setIndex(index + 1);
          markSeen(seenKey);
          setHidden(true);
          onDone?.();
        }}
      />
    </div>
  );
}
