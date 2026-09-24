import { useState } from 'react';
import { LoadingState } from '../../components/LoadingState';
import { useSessionAccess } from '../../hooks/useSessionAccess';
import { AdminLoginForm } from './AdminLoginForm';
import { AdminSchemaHealthView } from './AdminSchemaHealthView';
import { AdminDashboardView } from './AdminDashboardView';
import { AdminLogsView } from './AdminLogsView';
import { AdminPlayerInspectorView } from './AdminPlayerInspectorView';
import styles from './AdminPage.module.css';

type AdminTab = 'dashboard' | 'schema' | 'logs' | 'players';

const TABS: { id: AdminTab; label: string }[] = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'schema', label: 'Schema Health' },
  { id: 'logs', label: 'Entry Logs' },
  { id: 'players', label: 'Players' },
];

function AdminAuthenticated({
  session,
  onLogout,
}: {
  session: import('@veoullas-world/contracts').SafeSessionSummary;
  onLogout: () => void;
}) {
  const [tab, setTab] = useState<AdminTab>('dashboard');

  return (
    <div className={styles.page}>
      <h1>Admin</h1>
      <p className={styles.notice} role="status">
        Signed in as {session.userId}.{' '}
        <button type="button" className={styles.logoutLink} onClick={onLogout}>
          Log out
        </button>
      </p>

      <nav className={styles.tabs} aria-label="Admin sections">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            className={styles.tabButton}
            aria-current={tab === t.id ? 'page' : undefined}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </nav>

      {tab === 'dashboard' && <AdminDashboardView />}
      {tab === 'schema' && <AdminSchemaHealthView session={session} onLogout={onLogout} embedded />}
      {tab === 'logs' && <AdminLogsView />}
      {tab === 'players' && <AdminPlayerInspectorView />}
    </div>
  );
}

export function AdminPage() {
  const { status, session, markAuthenticated, logout } = useSessionAccess('admin');

  if (status === 'resolving') {
    return (
      <div className={styles.page}>
        <LoadingState label="Checking Admin session…" />
      </div>
    );
  }

  if (status === 'offline') {
    return (
      <div className={styles.page}>
        <h1>Admin</h1>
        <p role="alert">Could not reach the backend. Please check your connection and reload.</p>
      </div>
    );
  }

  if (status === 'authenticated' && session) {
    return <AdminAuthenticated session={session} onLogout={() => void logout()} />;
  }

  return <AdminLoginForm onSuccess={markAuthenticated} />;
}
