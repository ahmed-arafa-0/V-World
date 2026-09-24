import type { DialogueCue } from './resolveDialogueCue';
import styles from './DialogueText.module.css';

export interface DialogueTextProps {
  cue: DialogueCue;
}

/**
 * Text-only narration/dialogue presentation (Ahmed's 2026-09-17 decision
 * removed voice-over from the entire experience — see CLAUDE.md). VAR's
 * narration renders as cinematic bottom text (Living Bible §8A's original
 * "cinematic bottom captions" framing, now the text itself rather than an
 * audio caption); direct dialogue (`displayMode: 'speech_bubble'`) renders
 * as a bubble. The full line is always shown immediately and in full —
 * nothing here ever times out, truncates, or auto-dismisses before a
 * player-driven Continue action (see `ContinueButton`).
 */
export function DialogueText({ cue }: DialogueTextProps) {
  if (cue.isMissing) return null;
  const isBubble = cue.displayMode === 'speech_bubble';

  return (
    <div
      className={`${styles.text} ${isBubble ? styles.bubble : styles.cinematic}`}
      data-testid="dialogue-text"
      data-display-mode={cue.displayMode}
    >
      <p dir={cue.direction} className={styles.line} data-testid="dialogue-text-line">
        {cue.text}
      </p>
    </div>
  );
}
