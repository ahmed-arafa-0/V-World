import { useCallback } from 'react';
import { fetchBootstrap } from '../services/bootstrapClient';
import { useApiResource } from '../services/useApiResource';
import { LoadingState } from './LoadingState';
import styles from './BootstrapSummary.module.css';

export function BootstrapSummary() {
  const fetcher = useCallback(() => fetchBootstrap(), []);
  const { state, refetch } = useApiResource(fetcher);

  if (state.status === 'loading') {
    return <LoadingState label="Loading bootstrap configuration…" />;
  }

  if (state.status === 'offline') {
    return (
      <div className={styles.error} role="alert">
        <p>Could not load bootstrap configuration: {state.message}</p>
        <button type="button" onClick={refetch}>
          Retry
        </button>
      </div>
    );
  }

  const { data } = state;

  return (
    <dl className={styles.grid}>
      <div className={styles.item}>
        <dt>Languages</dt>
        <dd>{data.languages.length}</dd>
      </div>
      <div className={styles.item}>
        <dt>Locations</dt>
        <dd>{data.locations.length}</dd>
      </div>
      <div className={styles.item}>
        <dt>First-journey beats</dt>
        <dd>{data.storyBeats.length}</dd>
      </div>
      <div className={styles.item}>
        <dt>Icons</dt>
        <dd>{data.icons.length}</dd>
      </div>
      <div className={styles.item}>
        <dt>Current event</dt>
        <dd>{data.currentEvent ? data.currentEvent.eventName : 'none configured'}</dd>
      </div>
    </dl>
  );
}
