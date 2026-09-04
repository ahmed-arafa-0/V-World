import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AppRoutes } from '../src/app/AppRoutes';
import { installMockFetch } from './helpers/mockApi';

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
  installMockFetch();
});

describe('AppRoutes', () => {
  it('renders the Home placeholder at /', async () => {
    renderAt('/');
    expect(await screen.findByRole('heading', { name: "Veoulla's World" })).toBeInTheDocument();
    expect(screen.getByText('M01 — Google Sheets Gateway')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /admin schema health/i })).toBeInTheDocument();
  });

  it('renders the Admin Schema Health page at /admin', async () => {
    renderAt('/admin');
    expect(await screen.findByRole('heading', { name: 'Admin Schema Health' })).toBeInTheDocument();
    expect(screen.getByText(/no authentication implemented yet/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /home/i })).toBeInTheDocument();
  });

  it('renders the not-found placeholder for an unknown route', () => {
    renderAt('/does-not-exist');
    expect(screen.getByRole('heading', { name: /page not found/i })).toBeInTheDocument();
  });
});
