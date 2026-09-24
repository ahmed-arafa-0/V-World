import { useEffect, useState } from 'react';
import type { PlayerAchievementView } from '@veoullas-world/contracts';
import { fetchPlayerAchievements } from '../../services/playerClient';
import { useWorld } from './WorldContext';
import { ActionButton, Panel, TextBlock } from './ui';
import styles from './world.module.css';

type LoadState = 'loading' | 'online' | 'offline';

function AchievementCard({ achievement }: { achievement: PlayerAchievementView }) {
  const env = useWorld();
  const hidden = achievement.secret && achievement.status === 'locked';
  const title = hidden
    ? env.t('achievement_secret')
    : achievement.title || env.t('content_pending');
  return (
    <li
      className={styles.card}
      data-testid={`achievement-${achievement.achievementId}`}
      data-status={achievement.status}
    >
      <div className={styles.row}>
        {achievement.iconRef ? (
          <img
            src={achievement.iconRef}
            alt=""
            width={40}
            height={40}
            style={{ borderRadius: 8 }}
          />
        ) : (
          <span aria-hidden="true" style={{ fontSize: 28 }}>
            {achievement.status === 'unlocked' ? '🏆' : '🔒'}
          </span>
        )}
        <div>
          <p className={styles.cardTitle}>{title}</p>
          {achievement.status === 'locked' ? (
            <p className={styles.muted}>{env.t('achievement_locked')}</p>
          ) : (
            <>
              {!hidden && achievement.description && (
                <p className={styles.muted}>{achievement.description}</p>
              )}
              {achievement.unlockedAt && (
                <p className={styles.muted}>
                  {env.t('achievement_unlocked_on')} ·{' '}
                  {new Date(achievement.unlockedAt).toLocaleDateString(env.locale)}
                </p>
              )}
            </>
          )}
        </div>
      </div>
    </li>
  );
}

/** Opened from the HUD; fetched on demand (not part of the world bootstrap payload). */
export function AchievementsPanel({ onClose }: { onClose: () => void }) {
  const env = useWorld();
  const [state, setState] = useState<LoadState>('loading');
  const [achievements, setAchievements] = useState<PlayerAchievementView[]>([]);
  const [message, setMessage] = useState('');

  const [retryToken, setRetryToken] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setState('loading');
    fetchPlayerAchievements(env.locale)
      .then((result) => {
        if (cancelled) return;
        if (result.status === 'online') {
          setAchievements(result.data.achievements);
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
  }, [env.locale, retryToken]);

  return (
    <Panel title={env.t('achievements_title')} onClose={onClose} testId="achievements-panel">
      {state === 'loading' && (
        <TextBlock text={env.t('still_loading')} testId="achievements-loading" />
      )}
      {state === 'offline' && (
        <div data-testid="achievements-error">
          <TextBlock text={message || env.t('try_again')} />
          <ActionButton testId="achievements-retry" onClick={() => setRetryToken((n) => n + 1)}>
            {env.t('try_again')}
          </ActionButton>
        </div>
      )}
      {state === 'online' && achievements.length === 0 && (
        <TextBlock text={env.t('achievements_empty')} testId="achievements-empty" />
      )}
      {state === 'online' && achievements.length > 0 && (
        <ul className={styles.list} data-testid="achievements-list">
          {achievements.map((a) => (
            <AchievementCard key={a.achievementId} achievement={a} />
          ))}
        </ul>
      )}
    </Panel>
  );
}
