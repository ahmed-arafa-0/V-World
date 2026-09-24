import { useCallback } from 'react';
import { LoadingState } from '../../components/LoadingState';
import { staticDirectionFor, type LocaleCode } from '../../i18n/locales';
import { useLocaleStore } from '../../i18n/localeStore';
import { fetchContentRuntime } from '../../services/contentRuntimeClient';
import { useApiResource } from '../../services/useApiResource';
import { DialogueText } from '../narrative/DialogueText';
import { resolveDialogueCue } from '../narrative/resolveDialogueCue';
import styles from './NarrativeRuntimeLab.module.css';

/**
 * M03 narration/dialogue runtime acceptance screen (Master Build Plan M03:
 * "One test screen switches through all five languages"; requirement 7 of
 * Ahmed's 2026-09-17 voice-over-removal decision: "Verify text-only
 * progression... all five locales, RTL/LTR"). Renders one `DialogueText`
 * per distinct `dialogue_id` group currently present in
 * `/api/content/runtime` — real, whatever is live in the Sheet, never
 * hardcoded fixture text — so this works against any current or future
 * content without a code change. Replaces the retired
 * `VoiceoverRuntimeLab`/`VoiceoverPlayer` (see CLAUDE.md and
 * `docs/content/PHASE_1_VOICEOVER_CUES.md`, now retired).
 */
export function NarrativeRuntimeLab() {
  const locale = useLocaleStore((s) => s.locale);
  const setLocale = useLocaleStore((s) => s.setLocale);

  const fetcher = useCallback(() => fetchContentRuntime(), []);
  const { state, refetch } = useApiResource(fetcher);

  const languages = state.status === 'online' ? state.data.languages : [];
  const currentLanguage = languages.find((l) => l.localeId === locale);
  const direction = currentLanguage?.direction ?? staticDirectionFor(locale);

  if (state.status === 'loading') {
    return (
      <div className={styles.lab}>
        <LoadingState label="Loading narration/dialogue runtime…" />
      </div>
    );
  }

  if (state.status === 'offline') {
    return (
      <div className={styles.lab} role="alert">
        <p>Could not load narration/dialogue runtime: {state.message}</p>
        <button type="button" onClick={refetch}>
          Retry
        </button>
      </div>
    );
  }

  const { dialogue } = state.data;
  const dialogueIds = [...new Set(dialogue.map((d) => d.dialogueId))].filter(Boolean).sort();

  return (
    <div className={styles.lab} data-testid="narrative-runtime-lab" dir={direction}>
      <h2>Narration/Dialogue Runtime Lab</h2>
      <p className={styles.note}>
        Text-only — no voice-over anywhere in this experience (Ahmed&apos;s 2026-09-17 decision).
      </p>

      <section aria-label="Language switcher" className={styles.section}>
        <div
          className={styles.switcher}
          data-testid="narrative-locale-switcher"
          role="group"
          aria-label="Language"
        >
          {languages.map((lang) => (
            <button
              key={lang.localeId}
              type="button"
              data-testid={`narrative-locale-button-${lang.localeId}`}
              className={styles.localeButton}
              aria-pressed={lang.localeId === locale}
              onClick={() => setLocale(lang.localeId as LocaleCode)}
            >
              {lang.nativeName}
            </button>
          ))}
        </div>
      </section>

      {dialogueIds.length === 0 && (
        <p data-testid="narrative-no-dialogue" className={styles.note}>
          No dialogue is currently enabled in 15_DIALOGUE.
        </p>
      )}

      {dialogueIds.map((dialogueId) => {
        const cue = resolveDialogueCue(dialogue, dialogueId, locale as LocaleCode);
        return (
          <section
            key={dialogueId}
            aria-label={`Cue ${dialogueId}`}
            className={styles.section}
            data-testid={`narrative-demo-${dialogueId}`}
          >
            <h3 className={styles.sectionTitle}>{dialogueId}</h3>
            <DialogueText cue={cue} />
            {/* Developer diagnostic only; the player-facing DialogueText never shows it. */}
            {cue.isFallback && (
              <p data-testid="dialogue-text-fallback-note" className={styles.note}>
                No {locale} row for this cue; showing the English fallback.
              </p>
            )}
          </section>
        );
      })}
    </div>
  );
}
