import { useCallback, useMemo, useState } from 'react';
import type { SafeSessionSummary } from '@veoullas-world/contracts';
import { LoadingState } from '../../components/LoadingState';
import { fetchSchemaHealth } from '../../services/schemaHealthClient';
import { useApiResource } from '../../services/useApiResource';
import { SchemaHealthDiagnostics } from './SchemaHealthDiagnostics';
import { SchemaHealthTable } from './SchemaHealthTable';
import styles from './AdminPage.module.css';

type StatusFilter = 'all' | 'healthy' | 'warning' | 'error';

interface AdminSchemaHealthViewProps {
  session: SafeSessionSummary;
  onLogout: () => void;
  /** True when rendered inside the tabbed Admin shell, which already shows its own heading/signed-in line. */
  embedded?: boolean;
}

export function AdminSchemaHealthView({ session, onLogout, embedded }: AdminSchemaHealthViewProps) {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [isRefreshing, setIsRefreshing] = useState(false);

  const fetcher = useCallback(() => fetchSchemaHealth(), []);
  const { state, refetch } = useApiResource(fetcher);

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    try {
      await fetchSchemaHealth({ refresh: true });
    } finally {
      setIsRefreshing(false);
      refetch();
    }
  }, [refetch]);

  const filteredTabs = useMemo(() => {
    if (state.status !== 'online') return [];
    const term = search.trim().toLowerCase();
    return state.data.tabs.filter((tab) => {
      const matchesSearch = term === '' || tab.tab.toLowerCase().includes(term);
      const matchesStatus = statusFilter === 'all' || tab.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [state, search, statusFilter]);

  const filteredDiagnostics = useMemo(() => {
    if (state.status !== 'online') return [];
    const term = search.trim().toLowerCase();
    return state.data.diagnostics.filter((d) => {
      if (term !== '' && !d.tab.toLowerCase().includes(term)) return false;
      if (statusFilter === 'all') return true;
      if (statusFilter === 'error') return d.severity === 'ERROR';
      if (statusFilter === 'warning') return d.severity === 'WARNING';
      return false; // 'healthy' filter shows the healthy tab list with no diagnostics below it
    });
  }, [state, search, statusFilter]);

  return (
    <div className={embedded ? undefined : styles.page}>
      {!embedded && (
        <>
          <h1>Admin Schema Health</h1>
          <p className={styles.notice} role="status">
            Signed in as {session.userId}.{' '}
            <button type="button" className={styles.logoutLink} onClick={onLogout}>
              Log out
            </button>
          </p>
        </>
      )}

      {state.status === 'loading' && <LoadingState label="Loading schema health…" />}

      {state.status === 'offline' && (
        <div className={styles.error} role="alert">
          <p>Could not load schema health: {state.message}</p>
          <button type="button" onClick={refetch}>
            Retry
          </button>
        </div>
      )}

      {state.status === 'online' && (
        <>
          <dl className={styles.summary}>
            <div className={styles.summaryItem}>
              <dt>Expected tabs</dt>
              <dd>{state.data.summary.expectedTabCount}</dd>
            </div>
            <div className={styles.summaryItem}>
              <dt>Found tabs</dt>
              <dd>{state.data.summary.foundTabCount}</dd>
            </div>
            <div className={styles.summaryItem}>
              <dt>Healthy tabs</dt>
              <dd>{state.data.summary.healthyTabCount}</dd>
            </div>
            <div className={styles.summaryItem}>
              <dt>Errors</dt>
              <dd>{state.data.summary.errorCount}</dd>
            </div>
            <div className={styles.summaryItem}>
              <dt>Warnings</dt>
              <dd>{state.data.summary.warningCount}</dd>
            </div>
            <div className={styles.summaryItem}>
              <dt>Last checked</dt>
              <dd>{new Date(state.data.summary.checkedAt).toLocaleString()}</dd>
            </div>
          </dl>

          <div className={styles.controls}>
            <label className={styles.field}>
              <span>Search tabs</span>
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="e.g. LOCATIONS"
              />
            </label>
            <label className={styles.field}>
              <span>Status</span>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
              >
                <option value="all">All</option>
                <option value="healthy">Healthy</option>
                <option value="warning">Warning</option>
                <option value="error">Error</option>
              </select>
            </label>
            <button type="button" onClick={handleRefresh} disabled={isRefreshing}>
              {isRefreshing ? 'Refreshing…' : 'Bypass cache and refresh'}
            </button>
          </div>

          <SchemaHealthTable tabs={filteredTabs} />

          <h2 className={styles.subheading}>Diagnostics</h2>
          <SchemaHealthDiagnostics diagnostics={filteredDiagnostics} />
        </>
      )}
    </div>
  );
}
