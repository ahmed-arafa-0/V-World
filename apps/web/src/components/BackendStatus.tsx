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

  const { data } = health;

  return (
    <div className={styles.group}>
      <p className={styles.online} role="status">
        Backend status: {data.ok ? 'online' : 'error'} · milestone {data.milestone} ·{' '}
        {data.environment}
      </p>
      <p className={data.sheets.reachable ? styles.online : styles.offline} role="status">
        Google Sheet connection: {data.sheets.reachable ? 'connected' : 'unreachable'}
      </p>
      <p className={styles[schemaStatusClass(data.schemaHealth.status)]} role="status">
        Schema health: {data.schemaHealth.status} ({data.schemaHealth.errorCount} error
        {data.schemaHealth.errorCount === 1 ? '' : 's'}, {data.schemaHealth.warningCount} warning
        {data.schemaHealth.warningCount === 1 ? '' : 's'})
      </p>
    </div>
  );
}

function schemaStatusClass(
  status: 'healthy' | 'warning' | 'error',
): 'online' | 'warning' | 'offline' {
  if (status === 'healthy') return 'online';
  if (status === 'warning') return 'warning';
  return 'offline';
}
