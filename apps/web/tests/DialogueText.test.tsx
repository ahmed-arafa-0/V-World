import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DialogueText } from '../src/features/narrative/DialogueText';
import type { DialogueCue } from '../src/features/narrative/resolveDialogueCue';

function cue(overrides: Partial<DialogueCue> = {}): DialogueCue {
  return {
    text: 'You made it.',
    direction: 'ltr',
    displayMode: 'narration',
    isFallback: false,
    isMissing: false,
    ...overrides,
  };
}

describe('DialogueText', () => {
  it('shows the full text immediately with the correct direction — no timing, no truncation', () => {
    render(<DialogueText cue={cue({ direction: 'rtl', text: 'وصلتي.' })} />);
    const line = screen.getByTestId('dialogue-text-line');
    expect(line).toHaveTextContent('وصلتي.');
    expect(line).toHaveAttribute('dir', 'rtl');
  });

  it('renders cinematic narration and speech-bubble dialogue with distinct presentation modes', () => {
    const { rerender } = render(<DialogueText cue={cue({ displayMode: 'narration' })} />);
    expect(screen.getByTestId('dialogue-text')).toHaveAttribute('data-display-mode', 'narration');

    rerender(<DialogueText cue={cue({ displayMode: 'speech_bubble' })} />);
    expect(screen.getByTestId('dialogue-text')).toHaveAttribute(
      'data-display-mode',
      'speech_bubble',
    );
  });

  it('keeps fallback dialogue without developer metadata', () => {
    render(<DialogueText cue={cue({ isFallback: true })} />);
    expect(screen.queryByTestId('dialogue-text-fallback-note')).not.toBeInTheDocument();
  });

  it('does not expose missing-content metadata to the player', () => {
    render(<DialogueText cue={cue({ isMissing: true })} />);
    expect(screen.queryByTestId('dialogue-text-missing-note')).not.toBeInTheDocument();
  });

  it('never renders an audio element or any voice-over control', () => {
    const { container } = render(<DialogueText cue={cue()} />);
    expect(container.querySelector('audio')).toBeNull();
    expect(screen.queryByTestId('voiceover-audio')).not.toBeInTheDocument();
    expect(screen.queryByTestId('voiceover-enable-audio')).not.toBeInTheDocument();
  });
});
