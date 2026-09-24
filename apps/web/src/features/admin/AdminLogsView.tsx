import { useEffect, useState } from 'react';
import type { AdminLogsResponse } from '@veoullas-world/contracts';
import { LoadingState } from '../../components/LoadingState';
import { fetchAdminLogs } from '../../services/adminPanelClient';
import styles from './AdminPage.module.css';
import tableStyles from './AdminTable.module.css';

const PAGE_SIZE = 50;

type LoadState = 'loading' | 'online' | 'offline';

/** M17: "View/search entry logs including IP... filtering by date/result/IP/session works." */
export function AdminLogsView() {
  const [eventType, setEventType] = useState('');
  const [accessResult, setAccessResult] = useState('');
  const [ip, setIp] = useState('');
  const [userId, setUserId] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [offset, setOffset] = useState(0);
  const [applied, setApplied] = useState({
    eventType: '',
    accessResult: '',
    ip: '',
    userId: '',
    from: '',
    to: '',
  });

  const [state, setState] = useState<LoadState>('loading');
  const [data, setData] = useState<AdminLogsResponse | null>(null);
  const [message, setMessage] = useState('');

  useEffect(() => {
    let cancelled = false;
    setState('loading');
    fetchAdminLogs({ ...applied, limit: PAGE_SIZE, offset })
      .then((result) => {
        if (cancelled) return;
        if (result.status === 'online') {
          setData(result.data);
          setState('online');
        } else if (result.status === 'offline') {
          setMessage(result.message);
          setState('offline');
        }
      })
      .catch(() => {
        if (!cancelled) setState('offline');
      });
    return () => {
      cancelled = true;
    };
  }, [applied, offset]);

  const applyFilters = () => {
    setOffset(0);
    setApplied({ eventType, accessResult, ip, userId, from, to });
  };

  return (
    <>
      <div className={styles.controls}>
        <label className={styles.field}>
          <span>Event type</span>
          <input value={eventType} onChange={(e) => setEventType(e.target.value)} />
        </label>
        <label className={styles.field}>
          <span>Result</span>
          <input value={accessResult} onChange={(e) => setAccessResult(e.target.value)} />
        </label>
        <label className={styles.field}>
          <span>IP</span>
          <input value={ip} onChange={(e) => setIp(e.target.value)} />
        </label>
        <label className={styles.field}>
          <span>User id</span>
          <input value={userId} onChange={(e) => setUserId(e.target.value)} />
        </label>
        <label className={styles.field}>
          <span>From</span>
          <input type="datetime-local" value={from} onChange={(e) => setFrom(e.target.value)} />
        </label>
        <label className={styles.field}>
          <span>To</span>
          <input type="datetime-local" value={to} onChange={(e) => setTo(e.target.value)} />
        </label>
        <button type="button" onClick={applyFilters}>
          Apply filters
        </button>
      </div>

      {state === 'loading' && <LoadingState label="Loading logs…" />}

      {state === 'offline' && (
        <div className={styles.error} role="alert">
          <p>Could not load logs: {message}</p>
          <button type="button" onClick={() => setApplied({ ...applied })}>
            Retry
          </button>
        </div>
      )}

      {state === 'online' && data && (
        <>
          <div className={tableStyles.tableWrap}>
            <table className={tableStyles.table}>
              <caption className={tableStyles.caption}>
                {data.total} matching event{data.total === 1 ? '' : 's'}
              </caption>
              <thead>
                <tr>
                  <th scope="col">Time</th>
                  <th scope="col">Event</th>
                  <th scope="col">Result</th>
                  <th scope="col">User</th>
                  <th scope="col">Session</th>
                  <th scope="col">IP</th>
                  <th scope="col">Route</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map((log) => (
                  <tr key={log.logId}>
                    <td>{new Date(log.timestamp).toLocaleString()}</td>
                    <td>{log.eventType}</td>
                    <td>{log.accessResult}</td>
                    <td>{log.userId || '—'}</td>
                    <td>{log.sessionId || '—'}</td>
                    <td>{log.ip || '—'}</td>
                    <td>{log.route || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {data.rows.length === 0 && <p className={tableStyles.empty}>No matching events.</p>}
          </div>
          <div className={styles.controls}>
            <button
              type="button"
              disabled={offset === 0}
              onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
            >
              Previous
            </button>
            <button
              type="button"
              disabled={offset + PAGE_SIZE >= data.total}
              onClick={() => setOffset(offset + PAGE_SIZE)}
            >
              Next
            </button>
          </div>
        </>
      )}
    </>
  );
}
