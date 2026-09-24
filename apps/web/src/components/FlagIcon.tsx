import { useId, useState } from 'react';
import type { RuntimeIconEntry } from '@veoullas-world/contracts';
import type { LocaleCode } from '../i18n/locales';

/** Country flag for each locale: en → UK, ar-EG → Egypt, it → Italy, el → Greece, fr → France. */
export const LOCALE_FLAG: Record<LocaleCode, string> = {
  en: 'gb',
  'ar-EG': 'eg',
  it: 'it',
  el: 'gr',
  fr: 'fr',
};

function Flag({ country }: { country: string }) {
  switch (country) {
    case 'eg':
      return (
        <>
          <rect width="30" height="10" fill="#ce1126" />
          <rect y="10" width="30" height="10" fill="#fff" />
          <rect y="20" width="30" height="10" fill="#111" />
          <circle cx="15" cy="15" r="3.2" fill="#c09300" />
        </>
      );
    case 'it':
      return (
        <>
          <rect width="10" height="30" fill="#009246" />
          <rect x="10" width="10" height="30" fill="#fff" />
          <rect x="20" width="10" height="30" fill="#ce2b37" />
        </>
      );
    case 'fr':
      return (
        <>
          <rect width="10" height="30" fill="#0055a4" />
          <rect x="10" width="10" height="30" fill="#fff" />
          <rect x="20" width="10" height="30" fill="#ef4135" />
        </>
      );
    case 'gr':
      return (
        <>
          <rect width="30" height="30" fill="#0d5eaf" />
          {[3.33, 10, 16.67, 23.33].map((y) => (
            <rect key={y} y={y} width="30" height="3.33" fill="#fff" />
          ))}
          <rect width="16.67" height="16.67" fill="#0d5eaf" />
          <rect x="6.67" width="3.33" height="16.67" fill="#fff" />
          <rect y="6.67" width="16.67" height="3.33" fill="#fff" />
        </>
      );
    default:
      // United Kingdom
      return (
        <>
          <rect width="30" height="30" fill="#012169" />
          <path d="M0 0 30 30M30 0 0 30" stroke="#fff" strokeWidth="6" />
          <path d="M0 0 30 30M30 0 0 30" stroke="#c8102e" strokeWidth="2" />
          <path d="M15 0v30M0 15h30" stroke="#fff" strokeWidth="10" />
          <path d="M15 0v30M0 15h30" stroke="#c8102e" strokeWidth="6" />
        </>
      );
  }
}

/** Round flag. An authored `icon_flag_<locale>` row in 09_ICONS wins; otherwise the inline flag is drawn. */
export function FlagIcon({
  locale,
  icons = [],
  className,
}: {
  locale: LocaleCode;
  icons?: RuntimeIconEntry[];
  className?: string;
}) {
  const clip = useId();
  const authored = icons.find((i) => i.iconId === `icon_flag_${locale}` && i.mediaRef);
  const [failed, setFailed] = useState(false);
  if (authored?.mediaRef && !failed) {
    return (
      <img
        className={className}
        src={authored.mediaRef}
        alt=""
        aria-hidden="true"
        data-testid={`flag-${locale}`}
        data-icon-source="sheet"
        onError={() => setFailed(true)}
      />
    );
  }
  return (
    <svg
      className={className}
      viewBox="0 0 30 30"
      aria-hidden="true"
      focusable="false"
      data-testid={`flag-${locale}`}
      data-icon-source="fallback"
    >
      <clipPath id={clip}>
        <circle cx="15" cy="15" r="15" />
      </clipPath>
      <g clipPath={`url(#${clip})`}>
        <Flag country={LOCALE_FLAG[locale]} />
      </g>
    </svg>
  );
}
