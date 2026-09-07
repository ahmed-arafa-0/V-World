import { useCallback, useEffect } from 'react';
import { LoadingState } from '../../components/LoadingState';
import { staticDirectionFor, type LocaleCode } from '../../i18n/locales';
import { useLocaleStore } from '../../i18n/localeStore';
import { resolveUiText } from '../../i18n/resolveText';
import { fetchContentRuntime } from '../../services/contentRuntimeClient';
import { useApiResource } from '../../services/useApiResource';
import styles from './ContentRuntimeLab.module.css';

const SAMPLE_TEXT_IDS = ['content_lab_title', 'content_lab_incomplete'];

/**
 * M03-A technical validation screen: the first real localization/direction/
 * icon/asset/voice-over runtime, replacing the M02 "Access granted / World
 * loading" placeholder. Every piece of localized or Sheet-driven content
 * here comes from `/api/content/runtime` — only structural chrome (section
 * headings, button labels) is hardcoded, matching the existing Admin
 * Schema Health screen's precedent. Not a world scene.
 */
export function ContentRuntimeLab() {
  const locale = useLocaleStore((s) => s.locale);
  const setLocale = useLocaleStore((s) => s.setLocale);

  const fetcher = useCallback(() => fetchContentRuntime(), []);
  const { state, refetch } = useApiResource(fetcher);

  const languages = state.status === 'online' ? state.data.languages : [];
  const currentLanguage = languages.find((l) => l.localeId === locale);
  const direction = currentLanguage?.direction ?? staticDirectionFor(locale);

  // Authoritative direction, applied every time it changes (locale switch or
  // initial load) — never a blind full-layout reversal, only this attribute.
  useEffect(() => {
    document.documentElement.dir = direction;
  }, [direction]);

  if (state.status === 'loading') {
    return (
      <div className={styles.lab}>
        <LoadingState label="Loading content runtime…" />
      </div>
    );
  }

  if (state.status === 'offline') {
    return (
      <div className={styles.lab} role="alert">
        <p>Could not load content runtime: {state.message}</p>
        <button type="button" onClick={refetch}>
          Retry
        </button>
      </div>
    );
  }

  const { uiText, dialogue, icons, assets, voiceover, diagnostics } = state.data;
  const dialogueLine =
    dialogue.find((d) => d.locale === locale) ?? dialogue.find((d) => d.locale === 'en');

  return (
    <div className={styles.lab} data-testid="content-runtime-lab">
      <h2>Content Runtime Lab</h2>

      <section aria-label="Language switcher" className={styles.section}>
        <h3 className={styles.sectionTitle}>Languages</h3>
        <div
          className={styles.switcher}
          data-testid="locale-switcher"
          role="group"
          aria-label="Language"
        >
          {languages.map((lang) => (
            <button
              key={lang.localeId}
              type="button"
              data-testid={`locale-button-${lang.localeId}`}
              className={styles.localeButton}
              aria-pressed={lang.localeId === locale}
              onClick={() => setLocale(lang.localeId as LocaleCode)}
            >
              {lang.nativeName}
            </button>
          ))}
        </div>
        <p data-testid="current-locale-direction" className={styles.statusLine}>
          Locale: <strong>{locale}</strong> · Direction: <strong>{direction}</strong>
        </p>
      </section>

      <section aria-label="UI text samples" className={styles.section}>
        <h3 className={styles.sectionTitle}>Sheet-driven UI text</h3>
        <ul className={styles.textList} data-testid="ui-text-samples">
          {SAMPLE_TEXT_IDS.map((textId) => {
            const resolved = resolveUiText(uiText, textId, locale as LocaleCode);
            return (
              <li key={textId} dir={resolved.direction} data-testid={`ui-text-${textId}`}>
                <span>{resolved.text}</span>
                {resolved.isFallback && (
                  <em className={styles.fallbackNote}>
                    {' '}
                    (shown in English — translation not available)
                  </em>
                )}
                {resolved.isMissing && (
                  <em className={styles.fallbackNote}> (no content configured)</em>
                )}
              </li>
            );
          })}
        </ul>
      </section>

      <section aria-label="Dialogue example" className={styles.section}>
        <h3 className={styles.sectionTitle}>Dialogue / caption example</h3>
        {dialogueLine ? (
          <p dir={dialogueLine.direction} data-testid="dialogue-example" className={styles.caption}>
            {dialogueLine.text}
          </p>
        ) : (
          <p data-testid="dialogue-example-missing" className={styles.fallbackNote}>
            No dialogue configured for this locale or English.
          </p>
        )}
      </section>

      <section aria-label="Icon mirroring" className={styles.section}>
        <h3 className={styles.sectionTitle}>Icon samples (conditional RTL mirroring)</h3>
        <ul className={styles.iconList} data-testid="icon-samples">
          {icons.map((icon) => {
            const mirrored = direction === 'rtl' && icon.rtlMirror;
            return (
              <li
                key={icon.iconId}
                data-testid={`icon-sample-${icon.iconId}`}
                data-mirrored={mirrored}
              >
                <span
                  className={styles.iconSwatch}
                  style={{ transform: mirrored ? 'scaleX(-1)' : 'none' }}
                  aria-hidden="true"
                >
                  ➜
                </span>
                <span>
                  {icon.displayName} (rtl_mirror: {String(icon.rtlMirror)}, mirrored now:{' '}
                  {String(mirrored)})
                </span>
              </li>
            );
          })}
        </ul>
      </section>

      <section aria-label="Asset and voice-over status" className={styles.section}>
        <h3 className={styles.sectionTitle}>Asset &amp; voice-over metadata (status only)</h3>
        <ul className={styles.statusList} data-testid="asset-status-list">
          {assets.map((asset) => (
            <li key={asset.assetId}>
              {asset.assetId} — v{asset.version}, preload {asset.preloadPriority}
              {asset.hasMobileVariant ? ', has mobile variant' : ''}
              {asset.hasPosterVariant ? ', has poster variant' : ''}
            </li>
          ))}
        </ul>
        <ul className={styles.statusList} data-testid="voiceover-status-list">
          {voiceover.map((vo) => (
            <li key={vo.voiceoverId}>
              {vo.voiceoverId} — {vo.locale}, {vo.durationMs}ms
              {vo.captionText ? ', caption available' : ', no caption'}
            </li>
          ))}
        </ul>
      </section>

      <section aria-label="Content diagnostics" className={styles.section}>
        <h3 className={styles.sectionTitle}>Diagnostics</h3>
        <p className={styles.statusLine}>
          Disabled and incomplete rows are never sent by the backend — this list only reports
          structural issues among enabled content.
        </p>
        <ul className={styles.statusList} data-testid="content-diagnostics">
          {diagnostics.length === 0 && <li>No diagnostics.</li>}
          {diagnostics.map((d, i) => (
            <li key={i}>
              {d.code} — {d.tab} ({d.subjectId})
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
