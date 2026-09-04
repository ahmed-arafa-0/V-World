import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { AdminPage } from '../src/features/admin/AdminPage';
import { installMockFetch } from './helpers/mockApi';

beforeEach(() => {
  installMockFetch();
});

function renderAdmin() {
  return render(
    <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <AdminPage />
    </MemoryRouter>,
  );
}

describe('AdminPage', () => {
  it('shows the M02 authentication notice and the schema health summary', async () => {
    renderAdmin();

    expect(screen.getByRole('heading', { name: 'Admin Schema Health' })).toBeInTheDocument();
    expect(screen.getByText(/no authentication implemented yet/i)).toBeInTheDocument();
    expect(screen.getByText(/M02/)).toBeInTheDocument();

    expect(await screen.findByText('Expected tabs')).toBeInTheDocument();
    expect(screen.getAllByText('42').length).toBeGreaterThanOrEqual(2); // expected tabs and found tabs
    expect(screen.getByRole('link', { name: /back to home/i })).toHaveAttribute('href', '/');
  });

  it('renders the tab table and diagnostics list, and never shows raw sensitive values', async () => {
    renderAdmin();

    expect(await screen.findByRole('columnheader', { name: 'Tab' })).toBeInTheDocument();
    expect(screen.getByRole('rowheader', { name: '01_APP_CONFIG' })).toBeInTheDocument();
    expect(screen.getByText(/placeholder value/i)).toBeInTheDocument();

    const bodyText = document.body.textContent ?? '';
    expect(bodyText).not.toContain('plaintext_value');
    expect(bodyText).not.toContain('gate_code_plaintext');
    expect(bodyText).not.toContain('private_key');
  });

  it('filters the tab table by search text', async () => {
    renderAdmin();
    await screen.findByRole('rowheader', { name: '01_APP_CONFIG' });

    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/search tabs/i), '10_ASSETS');

    expect(screen.queryByRole('rowheader', { name: '01_APP_CONFIG' })).not.toBeInTheDocument();
    expect(screen.getByRole('rowheader', { name: '10_ASSETS' })).toBeInTheDocument();
  });

  it('has a bypass-cache refresh control', async () => {
    renderAdmin();
    expect(
      await screen.findByRole('button', { name: /bypass cache and refresh/i }),
    ).toBeInTheDocument();
  });
});
