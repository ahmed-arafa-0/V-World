import { Link } from 'react-router-dom';
import { BackendStatus } from '../../components/BackendStatus';
import { BootstrapSummary } from '../../components/BootstrapSummary';
import styles from './HomePage.module.css';

export function HomePage() {
  return (
    <div className={styles.page}>
      <h1>Veoulla&apos;s World</h1>
      <p className={styles.subtitle}>M01 — Google Sheets Gateway</p>
      <BackendStatus />
      <BootstrapSummary />
      <nav className={styles.nav} aria-label="Primary">
        <Link to="/admin">Go to Admin Schema Health</Link>
      </nav>
    </div>
  );
}
