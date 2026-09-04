import { Link } from 'react-router-dom';
import { BackendStatus } from '../../components/BackendStatus';
import styles from './HomePage.module.css';

export function HomePage() {
  return (
    <div className={styles.page}>
      <h1>Veoulla&apos;s World</h1>
      <p className={styles.subtitle}>Foundation Build</p>
      <p className={styles.milestone}>M00</p>
      <p className={styles.status} role="status">
        Frontend status: online
      </p>
      <BackendStatus />
      <nav className={styles.nav} aria-label="Primary">
        <Link to="/admin">Go to Admin placeholder</Link>
      </nav>
    </div>
  );
}
