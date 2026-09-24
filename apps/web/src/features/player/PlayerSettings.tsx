import type { RuntimeIconEntry, RuntimeUiTextEntry } from '@veoullas-world/contracts';
import { SceneIcon } from '../../components/SceneIcon';
import { FlagIcon } from '../../components/FlagIcon';
import { useEffect } from 'react';
import { useLocaleStore } from '../../i18n/localeStore';
import { SUPPORTED_LOCALES, staticDirectionFor } from '../../i18n/locales';
import { playerText, playerLanguageNames } from '../../i18n/playerText';
import styles from './PlayerSettings.module.css';

/**
 * Language flags (native-language name as accessible name and tooltip, selected state kept) and, when signed in,
 * a Log out button of its own. Fixed to the physical top-right: the world's controls are never mirrored for RTL.
 */
export function PlayerSettings({
  onLogout,
  uiText = [],
  icons = [],
}: {
  onLogout?: () => void;
  uiText?: RuntimeUiTextEntry[];
  icons?: RuntimeIconEntry[];
}) {
  const locale = useLocaleStore((s) => s.locale);
  const setLocale = useLocaleStore((s) => s.setLocale);
  useEffect(() => {
    document.documentElement.dir = staticDirectionFor(locale);
    document.documentElement.lang = locale;
  }, [locale]);
  return (
    <div className={styles.cluster} data-testid="player-settings">
      <div
        className={styles.flags}
        role="group"
        aria-label={playerText('language', locale, uiText)}
      >
        {SUPPORTED_LOCALES.map((code, index) => (
          <button
            key={code}
            type="button"
            className={styles.flag}
            lang={code}
            aria-label={playerLanguageNames[index]}
            title={playerLanguageNames[index]}
            aria-pressed={locale === code}
            data-testid={`language-${code}`}
            onClick={() => setLocale(code)}
          >
            <FlagIcon locale={code} icons={icons} className={styles.flagImg} />
          </button>
        ))}
      </div>
      {onLogout && (
        <button
          type="button"
          className={styles.logout}
          aria-label={playerText('logout', locale, uiText)}
          title={playerText('logout', locale, uiText)}
          data-testid="logout-button"
          onClick={onLogout}
        >
          <SceneIcon slot="logout" icons={icons} className={styles.icon} fixedDirection />
        </button>
      )}
    </div>
  );
}
