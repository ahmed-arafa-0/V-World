import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AppRoutes } from '../src/app/AppRoutes';
import { installMockFetch } from './helpers/mockApi';

function renderAt(path: string) {
  installMockFetch();
  // This suite tests routing, not the one-time pre-Gate opening sequence
  // (covered by PreGateSequence.test.tsx) — skip straight to the dial form.
  window.sessionStorage.setItem('vw_gate_opening_seen', 'true');
  return render(
    <MemoryRouter
      initialEntries={[path]}
      future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
    >
      <AppRoutes />
    </MemoryRouter>,
  );
}

describe('AppRoutes', () => {
  it('renders the Gate at /', async () => {
    renderAt('/');
    expect(await screen.findByTestId('gate-root')).toBeInTheDocument();
    expect(await screen.findByRole('group', { name: /four-digit gate code/i })).toBeInTheDocument();
  });

  it('renders the Admin login form at /admin', async () => {
    renderAt('/admin');
    expect(await screen.findByRole('heading', { name: 'Admin' })).toBeInTheDocument();
    expect(screen.getByLabelText(/username/i)).toBeInTheDocument();
  });

  it('renders the not-found placeholder for an unknown route', () => {
    renderAt('/does-not-exist');
    expect(screen.getByRole('heading', { name: /page not found/i })).toBeInTheDocument();
  });
});
