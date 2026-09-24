import { useState } from 'react';
import type { AdminPlayerInspectResponse } from '@veoullas-world/contracts';
import { LoadingState } from '../../components/LoadingState';
import { fetchAdminPlayer } from '../../services/adminPanelClient';
import styles from './AdminPage.module.css';
import tableStyles from './AdminTable.module.css';

type LoadState = 'idle' | 'loading' | 'online' | 'offline';

/** M17: "Inspect player story, keys, achievements, messages, Farm, characters, scores, and exhibits." Read-only. */
export function AdminPlayerInspectorView() {
  const [input, setInput] = useState('');
  const [state, setState] = useState<LoadState>('idle');
  const [data, setData] = useState<AdminPlayerInspectResponse | null>(null);
  const [message, setMessage] = useState('');

  const lookUp = (userId: string) => {
    const trimmed = userId.trim();
    if (!trimmed) return;
    setState('loading');
    fetchAdminPlayer(trimmed)
      .then((result) => {
        if (result.status === 'online') {
          setData(result.data);
          setState('online');
        } else if (result.status === 'offline') {
          setMessage(result.message);
          setState('offline');
        }
      })
      .catch(() => setState('offline'));
  };

  return (
    <>
      <form
        className={styles.controls}
        onSubmit={(e) => {
          e.preventDefault();
          lookUp(input);
        }}
      >
        <label className={styles.field}>
          <span>Player user id</span>
          <input value={input} onChange={(e) => setInput(e.target.value)} />
        </label>
        <button type="submit">Look up</button>
      </form>

      {state === 'loading' && <LoadingState label="Loading player…" />}

      {state === 'offline' && (
        <div className={styles.error} role="alert">
          <p>Could not load that player: {message}</p>
          <button type="button" onClick={() => lookUp(input)}>
            Retry
          </button>
        </div>
      )}

      {state === 'online' && data && (
        <>
          <dl className={styles.summary}>
            <div className={styles.summaryItem}>
              <dt>Name</dt>
              <dd>{data.character?.personalName || '—'}</dd>
            </div>
            <div className={styles.summaryItem}>
              <dt>Gender</dt>
              <dd>{data.character?.selectedGender || '—'}</dd>
            </div>
            <div className={styles.summaryItem}>
              <dt>Current location</dt>
              <dd>{data.character?.currentLocation || '—'}</dd>
            </div>
          </dl>

          <h2 className={styles.subheading}>Story progress</h2>
          <div className={tableStyles.tableWrap}>
            <table className={tableStyles.table}>
              <thead>
                <tr>
                  <th scope="col">Route</th>
                  <th scope="col">Status</th>
                  <th scope="col">Current beat</th>
                  <th scope="col">Location</th>
                </tr>
              </thead>
              <tbody>
                {data.progress.map((p) => (
                  <tr key={p.routeId}>
                    <td>{p.routeId}</td>
                    <td>{p.status}</td>
                    <td>{p.currentBeatId || '—'}</td>
                    <td>{p.currentLocation || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {data.progress.length === 0 && (
              <p className={tableStyles.empty}>No story progress rows yet.</p>
            )}
          </div>

          <h2 className={styles.subheading}>Keys</h2>
          <div className={tableStyles.tableWrap}>
            <table className={tableStyles.table}>
              <thead>
                <tr>
                  <th scope="col">Key</th>
                  <th scope="col">Found</th>
                  <th scope="col">Spent</th>
                  <th scope="col">Available</th>
                </tr>
              </thead>
              <tbody>
                {data.keys.map((k) => (
                  <tr key={k.keyTypeId}>
                    <td>{k.keyTypeId}</td>
                    <td>{k.quantityFound}</td>
                    <td>{k.quantitySpent}</td>
                    <td>{k.quantityAvailable}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {data.keys.length === 0 && <p className={tableStyles.empty}>No keys yet.</p>}
          </div>

          <h2 className={styles.subheading}>Achievements</h2>
          <div className={tableStyles.tableWrap}>
            <table className={tableStyles.table}>
              <thead>
                <tr>
                  <th scope="col">Achievement</th>
                  <th scope="col">Status</th>
                  <th scope="col">Claimed</th>
                  <th scope="col">Unlocked at</th>
                </tr>
              </thead>
              <tbody>
                {data.achievements.map((a) => (
                  <tr key={a.achievementId}>
                    <td>{a.achievementId}</td>
                    <td>{a.status}</td>
                    <td>{a.claimed ? 'yes' : 'no'}</td>
                    <td>{a.unlockedAt ? new Date(a.unlockedAt).toLocaleString() : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {data.achievements.length === 0 && (
              <p className={tableStyles.empty}>No achievement rows yet.</p>
            )}
          </div>

          <h2 className={styles.subheading}>Arcade scores</h2>
          <div className={tableStyles.tableWrap}>
            <table className={tableStyles.table}>
              <thead>
                <tr>
                  <th scope="col">Game</th>
                  <th scope="col">Played at</th>
                  <th scope="col">Score</th>
                  <th scope="col">Result</th>
                  <th scope="col">Personal best</th>
                </tr>
              </thead>
              <tbody>
                {data.scores.map((s, i) => (
                  <tr key={`${s.gameId}_${i}`}>
                    <td>{s.gameId}</td>
                    <td>{s.playedAt ? new Date(s.playedAt).toLocaleString() : '—'}</td>
                    <td>{s.score}</td>
                    <td>{s.result}</td>
                    <td>{s.personalBest ? 'yes' : 'no'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {data.scores.length === 0 && <p className={tableStyles.empty}>No scores yet.</p>}
          </div>

          <h2 className={styles.subheading}>Messages</h2>
          <div className={tableStyles.tableWrap}>
            <table className={tableStyles.table}>
              <thead>
                <tr>
                  <th scope="col">Message</th>
                  <th scope="col">Delivery</th>
                  <th scope="col">Read</th>
                  <th scope="col">Delivered at</th>
                </tr>
              </thead>
              <tbody>
                {data.messages.map((m) => (
                  <tr key={m.messageId}>
                    <td>{m.messageId}</td>
                    <td>{m.deliveryStatus}</td>
                    <td>{m.readStatus}</td>
                    <td>{m.deliveredAt ? new Date(m.deliveredAt).toLocaleString() : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {data.messages.length === 0 && <p className={tableStyles.empty}>No messages yet.</p>}
          </div>

          <h2 className={styles.subheading}>Location state (raw, diagnostic)</h2>
          <pre className={styles.notice} style={{ textAlign: 'start', overflowX: 'auto' }}>
            {JSON.stringify(data.worldDocs, null, 2)}
          </pre>
        </>
      )}
    </>
  );
}
