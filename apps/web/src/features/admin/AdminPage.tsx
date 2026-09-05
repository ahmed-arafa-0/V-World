import { LoadingState } from '../../components/LoadingState';
import { useSessionAccess } from '../../hooks/useSessionAccess';
import { AdminLoginForm } from './AdminLoginForm';
import { AdminSchemaHealthView } from './AdminSchemaHealthView';
import styles from './AdminPage.module.css';

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
    return <AdminSchemaHealthView session={session} onLogout={() => void logout()} />;
  }

  return <AdminLoginForm onSuccess={markAuthenticated} />;
}
