import { useEffect, useState } from 'react';
import type {
  RuntimeAssetStatus,
  RuntimeDialogueLine,
  RuntimeUiTextEntry,
} from '@veoullas-world/contracts';
import { fetchContentRuntime } from '../../services/contentRuntimeClient';
import { mobileMediaRef } from '../../services/mediaVariant';
import { NarratedContinue } from '../narrative/NarratedContinue';
import { JumpingGateCat } from './GateCat';
import { useLocaleStore } from '../../i18n/localeStore';
import styles from './DoorsOpeningTransition.module.css';

export interface DoorsOpeningTransitionProps {
  onContinue: () => void;
}

/**
 * Real `10_ASSETS` ids this beat can resolve, once registered — see
 * docs/assets/PHASE_1_ASSET_HANDOFF.md. `gate_ajar_static_bg` is
 * deliberately a distinct id from the handoff doc's `gate_opening_sequence`
 * row: Ahmed's supplied art is an explicit static fallback still, not a
 * door animation or separated door layers (see assets/phase1/README.md),
 * so it's registered and named for exactly that, honestly.
 */
const BACKGROUND_ASSET_ID = 'gate_ajar_static_bg';
const CHARACTER_ASSET_ID = 'var_jump_no_collar';

/**
 * Living Bible §18J beat 06: "the two Gate doors open slowly while a
 * widening slit of light reveals the island and the music rises... VAR
 * jumps through first; Veoulla follows." Resolves the two real assets above
 * against the owner-session `/api/content/runtime` (this beat only ever
 * renders post-Gate-success, so no pre-Gate contract widening is needed —
 * see the handoff doc's open-decisions note on `gate_closed_bg`). Until
 * both are registered/enabled, this renders exactly the same structural
 * placeholder it always has — no final Gate door art, music, or
 * choreography exists yet.
 */
export function DoorsOpeningTransition({ onContinue }: DoorsOpeningTransitionProps) {
  const locale = useLocaleStore((s) => s.locale);
  const [uiText, setUiText] = useState<RuntimeUiTextEntry[]>([]);
  const [pending, setPending] = useState(false);
  const [assets, setAssets] = useState<RuntimeAssetStatus[]>([]);
  const [dialogue, setDialogue] = useState<RuntimeDialogueLine[]>([]);

  useEffect(() => {
    let cancelled = false;
    fetchContentRuntime().then((result) => {
      if (!cancelled && result.status === 'online') {
        setAssets(result.data.assets);
        setUiText(result.data.uiText);
        setDialogue(result.data.dialogue);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const background = assets.find((a) => a.assetId === BACKGROUND_ASSET_ID);
  const character = assets.find((a) => a.assetId === CHARACTER_ASSET_ID);
  const mobileBackground = background ? mobileMediaRef(background) : null;

  return (
    <div
      className={styles.transition}
      data-testid="doors-opening-transition"
      data-placeholder={background ? 'false' : 'true'}
    >
      {background ? (
        <picture>
          {mobileBackground && <source media="(max-aspect-ratio: 1/1)" srcSet={mobileBackground} />}
          <img
            className={styles.doorsPhoto}
            src={background.mediaRef}
            alt=""
            data-testid="doors-opening-photo"
          />
        </picture>
      ) : (
        <>
          <div className={styles.doorLeft} />
          <div className={styles.doorRight} />
        </>
      )}

      {character && <JumpingGateCat src={character.mediaRef} />}

      <NarratedContinue
        beatId="beat_04_gate_open"
        dialogue={dialogue}
        uiText={uiText}
        locale={locale}
        testId="doors-opening-continue"
        disabled={pending}
        onContinue={() => {
          setPending(true);
          onContinue();
        }}
      />
    </div>
  );
}
