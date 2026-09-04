import { useBackendHealth } from '../services/useBackendHealth';
import { LoadingState } from './LoadingState';
import styles from './BackendStatus.module.css';

export function BackendStatus() {
  const health = useBackendHealth();

  if (health.status === 'loading') {
    return <LoadingState label="Checking backend health…" />;
  }

  if (health.status === 'offline') {
    return (
      <p className={styles.offline} role="status">
        Backend status: offline ({health.message})
      </p>
    );
  }

  return (
    <p className={styles.online} role="status">
      Backend status: {health.data.ok ? 'online' : 'error'} · milestone {health.data.milestone} ·{' '}
      {health.data.environment}
    </p>
  );
}
