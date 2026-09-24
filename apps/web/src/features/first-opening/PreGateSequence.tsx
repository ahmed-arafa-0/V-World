import { useCallback, useState } from 'react';
import { LoadingState } from '../../components/LoadingState';
import { useLocaleStore } from '../../i18n/localeStore';
import type { LocaleCode } from '../../i18n/locales';
import { fetchPreGateContent } from '../../services/preGateContentClient';
import { useApiResource } from '../../services/useApiResource';
import { ContinueButton } from '../narrative/ContinueButton';
import { DialogueText } from '../narrative/DialogueText';
import { resolveDialogueCue } from '../narrative/resolveDialogueCue';
import { mobileMediaRef } from '../../services/mediaVariant';
import { playerText } from '../../i18n/playerText';
import { SeatedGateCat } from './GateCat';
import styles from './PreGateSequence.module.css';

/** The real, live-Sheet dialogue group used for the Gate opening beat — see docs/content/PHASE_1_VOICEOVER_CUES.md §1a (retired; content itself is unaffected). Not invented for this component. */
const GATE_DIALOGUE_ID = 'dlg_gate_01';
/**
 * Real `10_ASSETS` id for VAR's before-naming, seated pose — public,
 * pre-authentication, served through the narrow `/api/public-media/:assetId`
 * allowlist per Ahmed's 2026-09-18 explicit authorization (see
 * docs/assets/PHASE_1_ASSET_HANDOFF.md §6). Comes from the same
 * `fetchPreGateContent()` response this component already fetches.
 */
const VAR_REVEAL_ASSET_ID = 'var_idle_no_collar';

export type PreGatePhase = 'opening' | 'title' | 'unseen' | 'reveal';

export interface PreGateSequenceProps {
  onComplete: () => void;
}

/**
 * Living Bible §18J beats 03–04: a speech/caption appears before VAR is
 * shown at all ("unseen"), then VAR visually steps into view ("reveal").
 * The app starts in English by default (Living Bible §18J: "The application
 * begins in English without a separate pre-world language-selection
 * screen") — `useLocaleStore`'s own default already satisfies this; this
 * component does not add a language switcher.
 *
 * Uses whatever the live Sheet's `dlg_gate_01` dialogue group actually
 * contains — never invented text. Ahmed's 2026-09-17 decision removed
 * voice-over entirely: the line is shown as text only (`DialogueText`) and
 * progression is player-paced via `ContinueButton`, never a fixed audio
 * duration. No second, fabricated line is shown for the "reveal" beat —
 * only VAR's placeholder visual is added; see the Phase 1 checkpoint's
 * known limitations for why.
 */
export function PreGateSequence({ onComplete }: PreGateSequenceProps) {
  const locale = useLocaleStore((s) => s.locale);
  const [phase, setPhase] = useState<PreGatePhase>('opening');

  const fetcher = useCallback(() => fetchPreGateContent(), []);
  const { state, refetch } = useApiResource(fetcher);

  if (state.status === 'loading') {
    return (
      <div className={styles.sequence} data-testid="pre-gate-loading">
        <LoadingState label={playerText('loading', locale)} />
      </div>
    );
  }

  if (state.status === 'offline') {
    return (
      <div className={styles.sequence} role="alert">
        <p>{playerText('offline', locale)}</p>
        <button type="button" onClick={refetch}>
          {playerText('retry', locale)}
        </button>
      </div>
    );
  }

  const cue = resolveDialogueCue(state.data.dialogue, GATE_DIALOGUE_ID, locale as LocaleCode);
  const background = state.data.assets.find((a) => a.assetId === 'gate_closed_bg');
  const companion = state.data.assets.find((a) => a.assetId === VAR_REVEAL_ASSET_ID);

  const hasText = (phase === 'unseen' || phase === 'reveal') && !cue.isMissing;

  return (
    <div className={styles.sequence} data-testid="pre-gate-sequence" data-phase={phase}>
      {(phase === 'unseen' || phase === 'reveal') && background && (
        <picture>
          {mobileMediaRef(background) && (
            <source media="(max-aspect-ratio: 1/1)" srcSet={mobileMediaRef(background)!} />
          )}
          <img className={styles.background} src={background.mediaRef} alt="" />
        </picture>
      )}
      {phase === 'opening' && (
        <div className={styles.opening} data-testid="pre-gate-black-opening"></div>
      )}

      {phase === 'title' && (
        <h1 className={styles.title} data-testid="pre-gate-title">
          {state.data.appName}
        </h1>
      )}

      {phase === 'reveal' && (
        <div className={styles.varReveal} data-testid="var-reveal-placeholder">
          {companion ? <SeatedGateCat src={companion.mediaRef} /> : null}
        </div>
      )}

      {/* The panel only exists while there is text to hold; a missing line leaves a bare Continue, never an empty box. */}
      <div className={hasText ? styles.dialogue : styles.bareContinue}>
        {hasText && <DialogueText cue={cue} />}

        <ContinueButton
          uiText={state.data.uiText}
          locale={locale as LocaleCode}
          className={styles.continueButton}
          testId="pre-gate-continue"
          onClick={() => {
            if (phase === 'opening') {
              setPhase('title');
            } else if (phase === 'title') {
              setPhase('unseen');
            } else if (phase === 'unseen') {
              setPhase('reveal');
            } else {
              onComplete();
            }
          }}
        />
      </div>
    </div>
  );
}
