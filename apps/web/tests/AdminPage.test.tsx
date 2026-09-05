import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { AdminPage } from '../src/features/admin/AdminPage';
import { installMockFetch, type MockFetchOptions } from './helpers/mockApi';

function renderAdmin(options: MockFetchOptions = {}) {
  installMockFetch(options);
  return render(
    <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <AdminPage />
    </MemoryRouter>,
  );
}

describe('AdminPage — unauthenticated', () => {
  beforeEach(() => {
    installMockFetch();
  });

  it('shows the Admin login form when no Admin session exists', async () => {
    renderAdmin();

    expect(await screen.findByRole('heading', { name: 'Admin' })).toBeInTheDocument();
    expect(screen.getByLabelText(/username/i)).toBeInTheDocument();
    const passwordInput = screen.getByLabelText(/password/i);
    expect(passwordInput).toHaveAttribute('type', 'password');
  });

  it('shows a generic invalid-credentials message on failure and never repopulates the password', async () => {
    installMockFetch({
      adminLoginResult: { ok: false, code: 'INVALID_ADMIN_CREDENTIALS', message: 'nope' },
    });
    render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <AdminPage />
      </MemoryRouter>,
    );

    const user = userEvent.setup();
    await user.type(await screen.findByLabelText(/username/i), 'admin_ahmed');
    const passwordInput = screen.getByLabelText(/password/i) as HTMLInputElement;
    await user.type(passwordInput, 'wrong-password');
    await user.click(screen.getByRole('button', { name: /sign in/i }));

    expect(await screen.findByText(/incorrect username or password/i)).toBeInTheDocument();
    expect(passwordInput.value).toBe('');
  });

  it('logs in successfully and shows the Schema Health view', async () => {
    renderAdmin();

    const user = userEvent.setup();
    await user.type(await screen.findByLabelText(/username/i), 'admin_ahmed');
    await user.type(screen.getByLabelText(/password/i), 'correct-password');
    await user.click(screen.getByRole('button', { name: /sign in/i }));

    expect(await screen.findByRole('heading', { name: 'Admin Schema Health' })).toBeInTheDocument();
    expect(screen.getByText(/signed in as admin_ahmed/i)).toBeInTheDocument();
  });
});

describe('AdminPage — already authenticated', () => {
  it('shows the schema health summary directly (session resumed from cookie)', async () => {
    renderAdmin({ adminSession: 'authenticated' });

    expect(await screen.findByRole('heading', { name: 'Admin Schema Health' })).toBeInTheDocument();
    expect(screen.getByText(/signed in as admin_ahmed/i)).toBeInTheDocument();
    expect(await screen.findByText('Expected tabs')).toBeInTheDocument();
    expect(screen.getAllByText('42').length).toBeGreaterThanOrEqual(2);
  });

  it('renders the tab table and diagnostics list, and never shows raw sensitive values', async () => {
    renderAdmin({ adminSession: 'authenticated' });

    expect(await screen.findByRole('columnheader', { name: 'Tab' })).toBeInTheDocument();
    expect(screen.getByRole('rowheader', { name: '01_APP_CONFIG' })).toBeInTheDocument();
    expect(screen.getByText(/placeholder value/i)).toBeInTheDocument();

    const bodyText = document.body.textContent ?? '';
    expect(bodyText).not.toContain('plaintext_value');
    expect(bodyText).not.toContain('gate_code_plaintext');
    expect(bodyText).not.toContain('private_key');
  });

  it('filters the tab table by search text', async () => {
    renderAdmin({ adminSession: 'authenticated' });
    await screen.findByRole('rowheader', { name: '01_APP_CONFIG' });

    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/search tabs/i), '10_ASSETS');

    expect(screen.queryByRole('rowheader', { name: '01_APP_CONFIG' })).not.toBeInTheDocument();
    expect(screen.getByRole('rowheader', { name: '10_ASSETS' })).toBeInTheDocument();
  });

  it('has a bypass-cache refresh control', async () => {
    renderAdmin({ adminSession: 'authenticated' });
    expect(
      await screen.findByRole('button', { name: /bypass cache and refresh/i }),
    ).toBeInTheDocument();
  });

  it('logging out returns to the Admin login form', async () => {
    renderAdmin({ adminSession: 'authenticated' });
    await screen.findByRole('heading', { name: 'Admin Schema Health' });

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /log out/i }));

    expect(await screen.findByRole('heading', { name: 'Admin' })).toBeInTheDocument();
    expect(screen.getByLabelText(/username/i)).toBeInTheDocument();
  });
});
