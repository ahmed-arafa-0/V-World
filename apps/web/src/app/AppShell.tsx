import type { ReactNode } from 'react';
import { useLocaleStore } from '../i18n/localeStore';
import { playerText } from '../i18n/playerText';
import styles from './AppShell.module.css';

interface AppShellProps {
  children: ReactNode;
}

/** Shared accessible document shell; the player supplies its own fixed viewport. */
export function AppShell({ children }: AppShellProps) {
  const locale = useLocaleStore((s) => s.locale);
  return (
    <div className={styles.shell}>
      <a className={styles.skipLink} href="#main-content">
        {playerText('skip', locale)}
      </a>
      <main id="main-content" className={styles.main}>
        {children}
      </main>
    </div>
  );
}
