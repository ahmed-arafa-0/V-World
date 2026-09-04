import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { HomePage } from '../src/features/home/HomePage';
import { installMockFetch } from './helpers/mockApi';

beforeEach(() => {
  installMockFetch();
});

describe('HomePage', () => {
  it('shows the M01 title, backend/Sheet/schema status, and bootstrap counts', async () => {
    render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <HomePage />
      </MemoryRouter>,
    );

    expect(screen.getByRole('heading', { name: "Veoulla's World" })).toBeInTheDocument();
    expect(screen.getByText('M01 — Google Sheets Gateway')).toBeInTheDocument();

    expect(await screen.findByText(/backend status: online/i)).toBeInTheDocument();
    expect(screen.getByText(/google sheet connection: connected/i)).toBeInTheDocument();
    expect(screen.getByText(/schema health: healthy/i)).toBeInTheDocument();

    expect(await screen.findByText('Languages')).toBeInTheDocument();
    expect(screen.getByText('5')).toBeInTheDocument();
    expect(screen.getByText('Locations')).toBeInTheDocument();
    expect(screen.getByText('8')).toBeInTheDocument();
    expect(screen.getByText('First-journey beats')).toBeInTheDocument();
    expect(screen.getByText('18')).toBeInTheDocument();

    expect(screen.getByRole('link', { name: /admin schema health/i })).toHaveAttribute(
      'href',
      '/admin',
    );
  });
});
