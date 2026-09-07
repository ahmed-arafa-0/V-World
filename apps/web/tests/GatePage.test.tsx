import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { GatePage } from '../src/features/gate/GatePage';
import { installMockFetch, type MockFetchOptions } from './helpers/mockApi';

function gateCallCount(fetchMock: ReturnType<typeof vi.fn>): number {
  return fetchMock.mock.calls.filter((call: unknown[]) => call[0] === '/api/auth/gate').length;
}

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

  it('focuses the Gate automatically once session resolution completes, with no dial clicked or focused', async () => {
    renderGate();

    await screen.findByRole('group', { name: /four-digit gate code/i });
    expect(screen.getByTestId('gate-root')).toHaveFocus();
  });

  it('accepts four digits typed with no click or dial focus, advancing sequentially', async () => {
    renderGate();
    const user = userEvent.setup();
    await screen.findByRole('group', { name: /four-digit gate code/i });

    await user.keyboard('1234');

    const dials = screen.getAllByRole('spinbutton');
    expect(dials.map((d) => d.getAttribute('aria-valuenow'))).toEqual(['1', '2', '3', '4']);
  });

  it('stops accepting digits after the fourth and does not auto-submit', async () => {
    renderGate();
    const user = userEvent.setup();
    const fetchMock = global.fetch as unknown as ReturnType<typeof vi.fn>;
    await screen.findByRole('group', { name: /four-digit gate code/i });

    await user.keyboard('12345');

    const dials = screen.getAllByRole('spinbutton');
    expect(dials.map((d) => d.getAttribute('aria-valuenow'))).toEqual(['1', '2', '3', '4']);
    expect(gateCallCount(fetchMock)).toBe(0);
  });

  it('Backspace moves the active position backward and allows correcting a digit', async () => {
    renderGate();
    const user = userEvent.setup();
    await screen.findByRole('group', { name: /four-digit gate code/i });

    await user.keyboard('12');
    await user.keyboard('{Backspace}');
    await user.keyboard('9');

    const dials = screen.getAllByRole('spinbutton');
    expect(dials.map((d) => d.getAttribute('aria-valuenow'))).toEqual(['1', '9', '0', '0']);
  });

  it('Backspace on an empty entry does nothing unsafe', async () => {
    renderGate();
    const user = userEvent.setup();
    await screen.findByRole('group', { name: /four-digit gate code/i });

    await user.keyboard('{Backspace}{Backspace}');
    await user.keyboard('5');

    const dials = screen.getAllByRole('spinbutton');
    expect(dials.map((d) => d.getAttribute('aria-valuenow'))).toEqual(['5', '0', '0', '0']);
  });

  it('Enter with fewer than four digits entered does not submit', async () => {
    renderGate();
    const user = userEvent.setup();
    const fetchMock = global.fetch as unknown as ReturnType<typeof vi.fn>;
    await screen.findByRole('group', { name: /four-digit gate code/i });

    await user.keyboard('123{Enter}');

    expect(gateCallCount(fetchMock)).toBe(0);
    expect(screen.getByRole('group', { name: /four-digit gate code/i })).toBeInTheDocument();
  });

  it('Enter after exactly four digits submits exactly once', async () => {
    renderGate();
    const user = userEvent.setup();
    const fetchMock = global.fetch as unknown as ReturnType<typeof vi.fn>;
    await screen.findByRole('group', { name: /four-digit gate code/i });

    await user.keyboard('1234{Enter}');

    expect(await screen.findByText(/access granted/i)).toBeInTheDocument();
    expect(gateCallCount(fetchMock)).toBe(1);
  });

  it('restores focus after an error so typing works immediately again', async () => {
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
    await screen.findByRole('group', { name: /four-digit gate code/i });

    await user.keyboard('1234{Enter}');
    await screen.findByText(/incorrect code/i);

    expect(screen.getByTestId('gate-root')).toHaveFocus();
    await user.keyboard('1234');
    const dials = screen.getAllByRole('spinbutton');
    expect(dials.map((d) => d.getAttribute('aria-valuenow'))).toEqual(['1', '2', '3', '4']);
  });

  it('prevents duplicate submission on Enter while a request is pending', async () => {
    installMockFetch();
    let releaseGate: () => void = () => {};
    const gateGate = new Promise<void>((resolve) => {
      releaseGate = resolve;
    });
    const realFetch = global.fetch as typeof fetch;
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url === '/api/auth/gate') {
        await gateGate;
      }
      return realFetch(input, init);
    });
    vi.stubGlobal('fetch', fetchMock);

    render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <GatePage />
      </MemoryRouter>,
    );
    const user = userEvent.setup();
    await screen.findByRole('group', { name: /four-digit gate code/i });

    await user.keyboard('1234{Enter}');
    expect(screen.getByRole('button', { name: /checking/i })).toBeInTheDocument();

    await user.keyboard('{Enter}');
    releaseGate();

    expect(await screen.findByText(/access granted/i)).toBeInTheDocument();
    expect(gateCallCount(fetchMock)).toBe(1);
  });

  it('respects an active cooldown and ignores Enter/digit input until it clears', async () => {
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
    const fetchMock = global.fetch as unknown as ReturnType<typeof vi.fn>;
    await screen.findByRole('group', { name: /four-digit gate code/i });

    await user.keyboard('1234{Enter}');
    await screen.findByText(/too many attempts/i);

    await user.keyboard('1234{Enter}');

    const dials = screen.getAllByRole('spinbutton');
    expect(dials.map((d) => d.getAttribute('aria-valuenow'))).toEqual(['0', '0', '0', '0']);
    expect(gateCallCount(fetchMock)).toBe(1);
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
  it('shows access granted, the M03 Content Runtime Lab, and a logout control — never the old World-loading placeholder', async () => {
    renderGate();
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: /enter/i }));

    expect(await screen.findByText(/access granted/i)).toBeInTheDocument();
    expect(await screen.findByTestId('content-runtime-lab')).toBeInTheDocument();
    expect(screen.queryByText(/world loading/i)).not.toBeInTheDocument();
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
