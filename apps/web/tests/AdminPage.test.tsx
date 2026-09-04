import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AdminPage } from '../src/features/admin/AdminPage';

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

describe('AdminPage', () => {
  it('shows the required M00 placeholder content', async () => {
    render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <AdminPage />
      </MemoryRouter>,
    );

    expect(screen.getByRole('heading', { name: 'Admin Foundation' })).toBeInTheDocument();
    expect(screen.getByText('M00')).toBeInTheDocument();
    expect(screen.getByText(/no authentication implemented yet/i)).toBeInTheDocument();
    expect(await screen.findByText(/backend status:/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /back to home/i })).toHaveAttribute('href', '/');
  });
});
