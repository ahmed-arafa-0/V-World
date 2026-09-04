import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AppRoutes } from '../src/app/AppRoutes';

function renderAt(path: string) {
  return render(
    <MemoryRouter
      initialEntries={[path]}
      future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
    >
      <AppRoutes />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        ok: true,
        service: 'veoullas-world-functions',
        environment: 'local',
        timestamp: new Date().toISOString(),
        milestone: 'M00',
        config: { googleServiceAccount: { present: false, reason: 'not_configured' } },
      }),
    }),
  );
});

describe('AppRoutes', () => {
  it('renders the Home placeholder at /', async () => {
    renderAt('/');
    expect(await screen.findByRole('heading', { name: "Veoulla's World" })).toBeInTheDocument();
    expect(screen.getByText('Foundation Build')).toBeInTheDocument();
    expect(screen.getByText('M00')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /admin/i })).toBeInTheDocument();
  });

  it('renders the Admin placeholder at /admin', async () => {
    renderAt('/admin');
    expect(await screen.findByRole('heading', { name: 'Admin Foundation' })).toBeInTheDocument();
    expect(screen.getByText(/no authentication implemented yet/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /home/i })).toBeInTheDocument();
  });

  it('renders the not-found placeholder for an unknown route', () => {
    renderAt('/does-not-exist');
    expect(screen.getByRole('heading', { name: /page not found/i })).toBeInTheDocument();
  });
});
