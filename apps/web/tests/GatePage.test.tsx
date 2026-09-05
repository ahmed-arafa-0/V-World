import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { GatePage } from '../src/features/gate/GatePage';
import { installMockFetch, type MockFetchOptions } from './helpers/mockApi';

function renderGate(options: MockFetchOptions = {}) {
  installMockFetch(options);
  return render(
    <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <GatePage />
    </MemoryRouter>,
  );
}

describe('GatePage — unauthenticated', () => {
  it('renders four independent digit dials, each starting at 0', async () => {
    renderGate();

    expect(await screen.findByRole('group', { name: /four-digit gate code/i })).toBeInTheDocument();
    const dials = screen.getAllByRole('spinbutton');
    expect(dials).toHaveLength(4);
    for (const dial of dials) {
      expect(dial).toHaveAttribute('aria-valuenow', '0');
    }
  });

  it('supports keyboard interaction on a dial (ArrowUp increments, wraps at 9->0)', async () => {
    renderGate();
    const user = userEvent.setup();
    const firstDial = (await screen.findAllByRole('spinbutton'))[0]!;

    firstDial.focus();
    await user.keyboard('{ArrowUp}');
    expect(firstDial).toHaveAttribute('aria-valuenow', '1');

    for (let i = 0; i < 9; i++) {
      await user.keyboard('{ArrowUp}');
    }
    expect(firstDial).toHaveAttribute('aria-valuenow', '0');
  });

  it('supports typing a digit directly on a focused dial', async () => {
    renderGate();
    const user = userEvent.setup();
    const firstDial = (await screen.findAllByRole('spinbutton'))[0]!;

    firstDial.focus();
    await user.keyboard('7');
    expect(firstDial).toHaveAttribute('aria-valuenow', '7');
  });

  it('supports mouse/touch interaction via the increase/decrease buttons', async () => {
    renderGate();
    const user = userEvent.setup();

    const increaseButtons = await screen.findAllByRole('button', { name: /increase/i });
    await user.click(increaseButtons[0]!);
    const dials = screen.getAllByRole('spinbutton');
    expect(dials[0]).toHaveAttribute('aria-valuenow', '1');
  });

  it('shows generic invalid feedback on a wrong code without leaking the correct one', async () => {
    installMockFetch({
      gateLoginResult: {
        ok: false,
        code: 'INVALID_GATE_CODE',
        message: 'nope',
        rateLimit: {
          maxAttempts: 5,
          remainingAttempts: 4,
          cooldownSeconds: 10,
          cooldownEndsAt: null,
          retryAfterSeconds: null,
        },
      },
    });
    render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <GatePage />
      </MemoryRouter>,
    );

    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: /enter/i }));

    expect(await screen.findByText(/incorrect code/i)).toBeInTheDocument();
    expect(screen.getByText(/4 attempt\(s\) remaining/i)).toBeInTheDocument();
    // The feedback must never reveal what the actual Gate code is — no 4-digit run anywhere in the page.
    const bodyText = document.body.textContent ?? '';
    expect(bodyText).not.toMatch(/\d{4}/);
  });

  it('shows a live cooldown countdown on a 429/RATE_LIMITED response', async () => {
    installMockFetch({
      gateLoginResult: {
        ok: false,
        code: 'RATE_LIMITED',
        message: 'nope',
        rateLimit: {
          maxAttempts: 5,
          remainingAttempts: 0,
          cooldownSeconds: 10,
          cooldownEndsAt: '2026-01-01T00:00:10.000Z',
          retryAfterSeconds: 10,
        },
      },
    });
    render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <GatePage />
      </MemoryRouter>,
    );

    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: /enter/i }));

    expect(await screen.findByText(/too many attempts/i)).toBeInTheDocument();
    expect(screen.getByText(/try again in 10 seconds/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /enter/i })).toBeDisabled();
  });
});

describe('GatePage — successful login', () => {
  it('shows the access-granted placeholder and a logout control, never the world/M03', async () => {
    renderGate();
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: /enter/i }));

    expect(await screen.findByText(/access granted/i)).toBeInTheDocument();
    expect(screen.getByText(/world loading/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /log out/i })).toBeInTheDocument();
  });

  it('resumes an existing valid owner session on load without requiring re-entry', async () => {
    renderGate({ ownerSession: 'authenticated' });

    expect(await screen.findByText(/access granted/i)).toBeInTheDocument();
    expect(screen.queryByRole('group', { name: /four-digit gate code/i })).not.toBeInTheDocument();
  });

  it('logging out returns to the Gate dial entry screen', async () => {
    renderGate({ ownerSession: 'authenticated' });
    await screen.findByText(/access granted/i);

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /log out/i }));

    expect(await screen.findByRole('group', { name: /four-digit gate code/i })).toBeInTheDocument();
  });
});
