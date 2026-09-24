import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { RuntimeDialogueLine } from '@veoullas-world/contracts';
import { JumpingGateCat, JUMP_MAX_MS } from '../src/features/first-opening/GateCat';
import { NarratedContinue } from '../src/features/narrative/NarratedContinue';
import { SceneStage } from '../src/features/scene-engine/SceneStage';
import { BEACH_TO_CHURCH_JOURNEY } from '../src/features/scene-engine/sceneDefinitions';

const line = (dialogueId: string, groupId: string, text: string): RuntimeDialogueLine => ({
  dialogueRowId: `${dialogueId}_en`,
  dialogueId,
  groupId,
  sequence: 1,
  speakerId: 'var',
  emotion: '',
  requiresResponse: false,
  locale: 'en',
  text,
  direction: 'ltr',
  displayMode: 'narration',
});

function mockJourney(dialogueGroupId: string | null) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({
      ok: true,
      json: async () => ({
        ok: true,
        beats: dialogueGroupId
          ? [{ beatId: 'beat_04_gate_open', dialogueGroupId }]
          : [{ beatId: 'beat_04_gate_open', dialogueGroupId: '' }],
      }),
    })),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('NarratedContinue', () => {
  const base = { beatId: 'beat_04_gate_open', uiText: [], locale: 'en' as const, testId: 'go' };

  it('shows a bare Continue, no empty panel, when the Sheet has no line for the beat', async () => {
    mockJourney('dlg_beat_04_gate_open');
    const onContinue = vi.fn();
    render(<NarratedContinue {...base} dialogue={[]} onContinue={onContinue} />);
    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalled());
    expect(screen.queryByTestId('dialogue-text')).toBeNull();
    fireEvent.click(screen.getByTestId('go'));
    expect(onContinue).toHaveBeenCalledTimes(1);
  });

  it('shows the Sheet line and waits for the player before continuing', async () => {
    mockJourney('dlg_beat_04_gate_open');
    const onContinue = vi.fn();
    render(
      <NarratedContinue
        {...base}
        dialogue={[line('n1', 'dlg_beat_04_gate_open', 'SAMPLE narration')]}
        onContinue={onContinue}
      />,
    );
    expect(await screen.findByText('SAMPLE narration')).toBeInTheDocument();
    expect(onContinue).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId('go'));
    expect(onContinue).toHaveBeenCalledTimes(1);
  });
});

describe('VAR leap through the doors', () => {
  beforeEach(() => vi.useFakeTimers());

  it('is bounded: it is removed when the animation ends', () => {
    render(<JumpingGateCat src="/jump.png" />);
    const cat = screen.getByTestId('doors-opening-character');
    fireEvent.animationEnd(cat);
    expect(screen.queryByTestId('doors-opening-character')).toBeNull();
  });

  it('is removed by a hard timeout even if no animation event ever fires', () => {
    render(<JumpingGateCat src="/jump.png" />);
    expect(screen.getByTestId('doors-opening-character')).toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(JUMP_MAX_MS + 10);
    });
    expect(screen.queryByTestId('doors-opening-character')).toBeNull();
  });
});

describe('Church approach road control', () => {
  it('offers a captioned Church entrance and a captioned road onward, both activatable', () => {
    const church = BEACH_TO_CHURCH_JOURNEY.nodes.find((n) => n.id === 'church_focus')!;
    const onMarker = vi.fn();
    render(<SceneStage node={church} pan={0} onMarkerActivate={onMarker} />);
    expect(screen.getByTestId('marker-caption-church_door')).toBeVisible();
    expect(screen.getByTestId('marker-caption-road_onward')).toBeVisible();
    // The road control is anchored to the screen, outside the (cropped) painted plane.
    expect(screen.getByTestId('scene-image-plane')).not.toContainElement(
      screen.getByTestId('marker-road_onward'),
    );
    fireEvent.click(screen.getByTestId('marker-road_onward'));
    expect(onMarker).toHaveBeenCalledWith('road_onward');
  });
});
