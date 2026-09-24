import { useCallback } from 'react';
import { LoadingState } from '../../components/LoadingState';
import { fetchAdminDashboard } from '../../services/adminPanelClient';
import { useApiResource } from '../../services/useApiResource';
import styles from './AdminPage.module.css';
import tableStyles from './AdminTable.module.css';

/** M17 dashboard: authoritative time, Sheet health, active sessions, recent logs, cache freshness. */
export function AdminDashboardView() {
  const fetcher = useCallback(() => fetchAdminDashboard(), []);
  const { state, refetch } = useApiResource(fetcher);

  if (state.status === 'loading') return <LoadingState label="Loading dashboard…" />;

  if (state.status === 'offline') {
    return (
      <div className={styles.error} role="alert">
        <p>Could not load the dashboard: {state.message}</p>
        <button type="button" onClick={refetch}>
          Retry
        </button>
      </div>
    );
  }

  const { data } = state;

  return (
    <>
      <dl className={styles.summary}>
        <div className={styles.summaryItem}>
          <dt>Server time</dt>
          <dd>{new Date(data.serverTime).toLocaleString()}</dd>
        </div>
        <div className={styles.summaryItem}>
          <dt>Authoritative time zone</dt>
          <dd>{data.timeZone}</dd>
        </div>
        <div className={styles.summaryItem}>
          <dt>Sheet health</dt>
          <dd>{data.schemaHealth.status}</dd>
        </div>
        <div className={styles.summaryItem}>
          <dt>Active sessions</dt>
          <dd>{data.activeSessionCount}</dd>
        </div>
        <div className={styles.summaryItem}>
          <dt>Sheet errors</dt>
          <dd>{data.schemaHealth.errorCount}</dd>
        </div>
        <div className={styles.summaryItem}>
          <dt>Sheet warnings</dt>
          <dd>{data.schemaHealth.warningCount}</dd>
        </div>
      </dl>

      <h2 className={styles.subheading}>Pending sync (cached tab age)</h2>
      <p className={styles.notice}>
        How long ago this server instance last actually fetched each hot tab from Google — the
        closest honest reading of &ldquo;pending sync&rdquo; for a Sheet-backed store where every
        write already confirms before it returns. A tab this instance has never read shows as never
        fetched.
      </p>
      <div className={tableStyles.tableWrap}>
        <table className={tableStyles.table}>
          <caption className={tableStyles.caption}>Cached tab freshness</caption>
          <thead>
            <tr>
              <th scope="col">Tab</th>
              <th scope="col">Last fetched</th>
            </tr>
          </thead>
          <tbody>
            {Object.entries(data.cacheAgeMs).map(([tab, ageMs]) => (
              <tr key={tab}>
                <td>{tab}</td>
                <td>{Math.round(ageMs / 1000)}s ago</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2 className={styles.subheading}>Recent entry log</h2>
      <div className={tableStyles.tableWrap}>
        <table className={tableStyles.table}>
          <caption className={tableStyles.caption}>Last {data.lastLogs.length} events</caption>
          <thead>
            <tr>
              <th scope="col">Time</th>
              <th scope="col">Event</th>
              <th scope="col">Result</th>
              <th scope="col">User</th>
              <th scope="col">IP</th>
            </tr>
          </thead>
          <tbody>
            {data.lastLogs.map((log) => (
              <tr key={log.logId}>
                <td>{new Date(log.timestamp).toLocaleString()}</td>
                <td>{log.eventType}</td>
                <td>{log.accessResult}</td>
                <td>{log.userId || '—'}</td>
                <td>{log.ip || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {data.lastLogs.length === 0 && <p className={tableStyles.empty}>No log entries yet.</p>}
      </div>

      <button type="button" onClick={refetch}>
        Refresh
      </button>
    </>
  );
}
