import type { SchemaHealthDiagnostic } from '@veoullas-world/contracts';
import styles from './SchemaHealthDiagnostics.module.css';

interface SchemaHealthDiagnosticsProps {
  diagnostics: SchemaHealthDiagnostic[];
}

export function SchemaHealthDiagnostics({ diagnostics }: SchemaHealthDiagnosticsProps) {
  if (diagnostics.length === 0) {
    return <p className={styles.empty}>No diagnostics for the current search/filter.</p>;
  }

  return (
    <ul className={styles.list}>
      {diagnostics.map((d, i) => (
        <li key={`${d.tab}-${d.code}-${i}`} className={severityClass(d.severity, styles)}>
          <span className={styles.badge}>{d.severity}</span>
          <span className={styles.tab}>{d.tab}</span>
          {d.column ? <span className={styles.column}>({d.column})</span> : null}
          <span className={styles.message}>{d.message}</span>
        </li>
      ))}
    </ul>
  );
}

function severityClass(
  severity: SchemaHealthDiagnostic['severity'],
  styles: Record<string, string>,
): string {
  if (severity === 'ERROR') return `${styles.item} ${styles.error}`;
  if (severity === 'WARNING') return `${styles.item} ${styles.warning}`;
  return `${styles.item} ${styles.info}`;
}
