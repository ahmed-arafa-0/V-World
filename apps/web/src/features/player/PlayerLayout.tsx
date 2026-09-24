import { useLayoutEffect, type ReactNode } from 'react';
import styles from './PlayerLayout.module.css';

/** Only the player owns the viewport; admin and development pages still scroll. */
export function PlayerLayout({ children }: { children: ReactNode }) {
  useLayoutEffect(() => {
    const previous = document.documentElement.style.overflow;
    document.documentElement.style.overflow = 'hidden';
    return () => {
      document.documentElement.style.overflow = previous;
    };
  }, []);
  return (
    <div className={styles.player} data-testid="player-layout">
      {children}
    </div>
  );
}
