import type { SchemaHealthTabSummary } from '@veoullas-world/contracts';
import styles from './SchemaHealthTable.module.css';

interface SchemaHealthTableProps {
  tabs: SchemaHealthTabSummary[];
}

export function SchemaHealthTable({ tabs }: SchemaHealthTableProps) {
  if (tabs.length === 0) {
    return <p className={styles.empty}>No tabs match the current search/filter.</p>;
  }

  return (
    <div className={styles.tableWrap}>
      <table className={styles.table}>
        <caption className={styles.caption}>Schema health per Sheet tab</caption>
        <thead>
          <tr>
            <th scope="col">Tab</th>
            <th scope="col">Status</th>
            <th scope="col">Found</th>
            <th scope="col">Required columns</th>
            <th scope="col">Actual columns</th>
            <th scope="col">Errors</th>
            <th scope="col">Warnings</th>
            <th scope="col">Info</th>
          </tr>
        </thead>
        <tbody>
          {tabs.map((tab) => (
            <tr key={tab.tab}>
              <th scope="row">{tab.tab}</th>
              <td>
                <span className={statusClass(tab.status, styles)}>{tab.status}</span>
              </td>
              <td>{tab.found ? 'yes' : 'no'}</td>
              <td>{tab.requiredColumnCount}</td>
              <td>{tab.actualColumnCount}</td>
              <td>{tab.errorCount}</td>
              <td>{tab.warningCount}</td>
              <td>{tab.infoCount}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function statusClass(
  status: SchemaHealthTabSummary['status'],
  styles: Record<string, string>,
): string {
  if (status === 'healthy') return styles.healthy!;
  if (status === 'warning') return styles.warning!;
  return styles.error!;
}
