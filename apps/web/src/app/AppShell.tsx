import type { ReactNode } from 'react';
import styles from './AppShell.module.css';

interface AppShellProps {
  children: ReactNode;
}

/**
 * Minimal application chrome for M00. The persistent Back/Map/Language/Walkman
 * controls described in the Living Bible belong to later milestones and are
 * intentionally not implemented here.
 */
export function AppShell({ children }: AppShellProps) {
  return (
    <div className={styles.shell}>
      <a className={styles.skipLink} href="#main-content">
        Skip to content
      </a>
      <main id="main-content" className={styles.main}>
        {children}
      </main>
    </div>
  );
}
