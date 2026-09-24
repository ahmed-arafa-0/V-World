import { useEffect } from 'react';
import { useWorld } from '../WorldContext';
import { CaptionedHotspot, Companion, PlaceTitle, Stage } from '../ui';

export interface JunctionProps {
  /** Physical navigation only — none of these handlers acknowledges a story beat or grants anything. */
  onChurch: () => void;
  onCafe: () => void;
  onAhead: () => void;
  onBack: () => void;
}

/**
 * The Church / Vinyl Café junction: Church on the LEFT, Café on the RIGHT, the
 * road continuing AHEAD. The geography is physical (never mirrored for RTL).
 * Choosing a destination is just walking: story progress and rewards remain
 * server-side interactions inside each place, which explain themselves when
 * they are not open yet. Nothing here is gated on the story.
 */
export function Junction({ onChurch, onCafe, onAhead, onBack }: JunctionProps) {
  const env = useWorld();

  // Keyboard: arrows are physical directions (Left = Church, Right = Café, Up = ahead, Down = back).
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'ArrowLeft') onChurch();
      else if (event.key === 'ArrowRight') onCafe();
      else if (event.key === 'ArrowUp') onAhead();
      else if (event.key === 'ArrowDown') onBack();
      else return;
      event.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onChurch, onCafe, onAhead, onBack]);

  return (
    <Stage theme="road" assetId="junction_scene" testId="junction">
      <PlaceTitle text={env.t('place_junction')} />
      <Companion />
      <CaptionedHotspot
        testId="junction-church"
        x={18}
        y={58}
        slot="look_left"
        label={env.t('junction_left_church')}
        onClick={onChurch}
      />
      <CaptionedHotspot
        testId="junction-cafe"
        x={82}
        y={58}
        slot="look_right"
        label={env.t('junction_right_cafe')}
        onClick={onCafe}
      />
      <CaptionedHotspot
        testId="junction-ahead"
        x={50}
        y={40}
        slot="walk_forward"
        label={env.t('junction_ahead')}
        onClick={onAhead}
      />
      <CaptionedHotspot
        testId="junction-back"
        x={50}
        y={90}
        slot="walk_back"
        label={env.t('back')}
        onClick={onBack}
      />
    </Stage>
  );
}
