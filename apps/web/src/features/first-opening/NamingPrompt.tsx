import { useCallback, useState, type FormEvent } from 'react';
import { LoadingState } from '../../components/LoadingState';
import { useLocaleStore } from '../../i18n/localeStore';
import type { LocaleCode } from '../../i18n/locales';
import { postCharacterName } from '../../services/characterClient';
import { fetchContentRuntime } from '../../services/contentRuntimeClient';
import { useApiResource } from '../../services/useApiResource';
import { ContinueButton } from '../narrative/ContinueButton';
import { DialogueText } from '../narrative/DialogueText';
import { resolveDialogueCue } from '../narrative/resolveDialogueCue';
import { SceneStage } from '../scene-engine/SceneStage';
import { BEACH_TO_CHURCH_JOURNEY } from '../scene-engine/sceneDefinitions';
import { playerText } from '../../i18n/playerText';
import { CANONICAL_GENDERS, type CanonicalGender } from '@veoullas-world/contracts';
import { worldText } from '../world/worldText';
import styles from './NamingPrompt.module.css';

const CHARACTER_ID = 'var';
/** The real, live-Sheet dialogue group for this beat — see docs/content/PHASE_1_VOICEOVER_CUES.md §1a (retired; content itself is unaffected). Not invented for this component. */
const NAMING_DIALOGUE_ID = 'dlg_name_01';
/**
 * Real `10_ASSETS` ids for this beat's character art (see
 * docs/assets/PHASE_1_ASSET_HANDOFF.md): seated, before the collar carries
 * a chosen name, and seated, after. Resolved from the same
 * `/api/content/runtime` response this component already fetches — no
 * extra request.
 */
const IDLE_NO_COLLAR_ASSET_ID = 'var_idle_no_collar';
const IDLE_COLLAR_ASSET_ID = 'var_idle_collar';

export interface NamingPromptProps {
  onNamed: (personalName: string) => void;
}

/**
 * Living Bible §18J beat 08: "On the Beach, VAR asks Veoulla to choose a
 * personal name and gender/presentation." The prompt line itself is fetched
 * from the live Sheet (`dlg_name_01`), not hardcoded — its approval status
 * is explicitly unresolved (see the retired voice-over cues doc, content
 * itself unaffected), so this component displays whatever is currently live
 * and falls back to a text-only placeholder note if that row is ever
 * disabled, exactly like the M03 narration/dialogue runtime already
 * guarantees elsewhere. Ahmed's 2026-09-17 decision removed voice-over
 * entirely: the line renders as text (`DialogueText`) and the player
 * advances it themselves via `ContinueButton`, never a fixed audio timer.
 * The exact allowed gender
 * options/localization are explicitly "Open" in the Living Bible §18H — the
 * three offered here are a reasonable, non-exhaustive starting set, not a
 * final content decision; `character-state.service.ts` accepts any
 * non-blank value up to 20 characters, so this list can grow without a
 * backend change. VAR's internal identifier is never shown here.
 */
export function NamingPrompt({ onNamed }: NamingPromptProps) {
  const locale = useLocaleStore((s) => s.locale);
  const [name, setName] = useState('');
  const [gender, setGender] = useState<CanonicalGender | ''>('');
  const [savedName, setSavedName] = useState<string | null>(null);
  const [advancing, setAdvancing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetcher = useCallback(() => fetchContentRuntime(), []);
  const { state } = useApiResource(fetcher);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setError(playerText('requiredName', locale));
      return;
    }
    if (!gender) {
      setError(
        worldText('gender_required', locale, state.status === 'online' ? state.data.uiText : []),
      );
      return;
    }
    setSubmitting(true);
    setError(null);

    const result = await postCharacterName({
      characterId: CHARACTER_ID,
      personalName: trimmed,
      selectedGender: gender,
    });

    setSubmitting(false);
    if (result.status !== 'online') {
      setError(playerText('saveError', locale));
      return;
    }
    setSavedName(result.data.character.personalName);
  }

  if (state.status === 'loading') {
    return (
      <div data-testid="naming-loading">
        <LoadingState label="Loading…" />
      </div>
    );
  }

  const cue =
    state.status === 'online'
      ? resolveDialogueCue(state.data.dialogue, NAMING_DIALOGUE_ID, locale as LocaleCode)
      : null;
  const uiText = state.status === 'online' ? state.data.uiText : [];
  const assets = state.status === 'online' ? state.data.assets : [];
  const idleNoCollar = assets.find((a) => a.assetId === IDLE_NO_COLLAR_ASSET_ID);
  const idleCollar = assets.find((a) => a.assetId === IDLE_COLLAR_ASSET_ID);

  const beach = BEACH_TO_CHURCH_JOURNEY.nodes[0]!;
  const background = assets.find((a) => a.assetId === beach.backgroundAssetId);
  return (
    <section
      className={styles.scene}
      data-testid={savedName ? 'naming-confirmation' : 'naming-prompt'}
    >
      <SceneStage node={beach} pan={0} backgroundAsset={background} />
      {(savedName ? idleCollar : idleNoCollar) && (
        <img
          className={styles.characterArt}
          src={(savedName ? idleCollar : idleNoCollar)!.mediaRef}
          alt=""
          data-testid={savedName ? 'naming-character-collar' : 'naming-character-no-collar'}
        />
      )}
      <form
        className={styles.prompt}
        onSubmit={(event) => {
          if (!savedName) void handleSubmit(event);
          else event.preventDefault();
        }}
      >
        {savedName ? (
          <>
            <strong className={styles.collar} data-testid="collar-name">
              {savedName}
            </strong>
            <ContinueButton
              uiText={uiText}
              locale={locale}
              testId="naming-continue"
              disabled={advancing}
              onClick={() => {
                setAdvancing(true);
                onNamed(savedName);
              }}
            />
          </>
        ) : (
          <>
            {cue && <DialogueText cue={cue} />}
            <label className={styles.field}>
              {playerText('name', locale, uiText)}
              <input
                type="text"
                autoComplete="off"
                data-testid="naming-name-input"
                value={name}
                maxLength={40}
                onChange={(e) => setName(e.target.value)}
                disabled={submitting}
              />
            </label>
            <fieldset
              className={styles.genderGroup}
              data-testid="naming-gender"
              disabled={submitting}
            >
              <legend>{worldText('gender_legend', locale, uiText)}</legend>
              {CANONICAL_GENDERS.map((value) => (
                <label key={value} className={styles.genderOption}>
                  <input
                    type="radio"
                    name="companion-gender"
                    value={value}
                    checked={gender === value}
                    data-testid={`naming-gender-${value}`}
                    onChange={() => setGender(value)}
                  />
                  <span>{worldText(`gender_${value}`, locale, uiText)}</span>
                </label>
              ))}
            </fieldset>
            {error && (
              <p className={styles.error} role="alert">
                {error}
              </p>
            )}
            <button type="submit" data-testid="naming-submit" disabled={submitting}>
              {playerText(submitting ? 'saving' : 'confirm', locale, uiText)}
            </button>
          </>
        )}
      </form>
    </section>
  );
}
