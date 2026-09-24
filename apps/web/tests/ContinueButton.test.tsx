import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { RuntimeUiTextEntry } from '@veoullas-world/contracts';
import { ContinueButton } from '../src/features/narrative/ContinueButton';

function uiTextEntry(overrides: Partial<RuntimeUiTextEntry> = {}): RuntimeUiTextEntry {
  return {
    uiTextRowId: 'row_1',
    textId: 'action_continue',
    screenId: 'global',
    componentId: 'continue_button',
    locale: 'en',
    text: 'Continue',
    direction: 'ltr',
    ariaLabel: 'Continue',
    ...overrides,
  };
}

describe('ContinueButton', () => {
  it('resolves the label from 08_UI_TEXT for the current locale when present', () => {
    render(
      <ContinueButton
        uiText={[uiTextEntry({ locale: 'fr', text: 'Continuer' })]}
        locale="fr"
        onClick={() => {}}
      />,
    );
    expect(screen.getByTestId('continue-button')).toHaveTextContent('Continuer');
  });

  it('falls back to the static five-locale dictionary when the Sheet row is missing', () => {
    render(<ContinueButton uiText={[]} locale="el" onClick={() => {}} />);
    expect(screen.getByTestId('continue-button')).toHaveTextContent('Συνέχεια');
  });

  it('never shows the generic "translation not available" placeholder for this control', () => {
    render(<ContinueButton uiText={[]} locale="ar-EG" onClick={() => {}} />);
    expect(screen.getByTestId('continue-button')).not.toHaveTextContent(
      'Translation not yet available',
    );
  });

  it('calls onClick when clicked', async () => {
    const onClick = vi.fn();
    render(<ContinueButton uiText={[uiTextEntry()]} locale="en" onClick={onClick} />);
    await userEvent.setup().click(screen.getByTestId('continue-button'));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('supports a custom testId', () => {
    render(
      <ContinueButton
        uiText={[uiTextEntry()]}
        locale="en"
        onClick={() => {}}
        testId="naming-continue"
      />,
    );
    expect(screen.getByTestId('naming-continue')).toBeInTheDocument();
  });
});
