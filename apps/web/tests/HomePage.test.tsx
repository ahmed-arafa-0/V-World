import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { HomePage } from '../src/features/home/HomePage';

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

describe('HomePage', () => {
  it('shows the required M00 placeholder content', async () => {
    render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <HomePage />
      </MemoryRouter>,
    );

    expect(screen.getByRole('heading', { name: "Veoulla's World" })).toBeInTheDocument();
    expect(screen.getByText('Foundation Build')).toBeInTheDocument();
    expect(screen.getByText('M00')).toBeInTheDocument();
    expect(screen.getByText(/frontend status: online/i)).toBeInTheDocument();
    expect(await screen.findByText(/backend status:/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /admin placeholder/i })).toHaveAttribute(
      'href',
      '/admin',
    );
  });
});
