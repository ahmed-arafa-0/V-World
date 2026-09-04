import { Link } from 'react-router-dom';
import { BackendStatus } from '../../components/BackendStatus';
import styles from './AdminPage.module.css';

export function AdminPage() {
  return (
    <div className={styles.page}>
      <h1>Admin Foundation</h1>
      <p className={styles.milestone}>M00</p>
      <p className={styles.notice} role="note">
        No authentication implemented yet.
      </p>
      <BackendStatus />
      <nav className={styles.nav} aria-label="Primary">
        <Link to="/">Back to Home</Link>
      </nav>
    </div>
  );
}
