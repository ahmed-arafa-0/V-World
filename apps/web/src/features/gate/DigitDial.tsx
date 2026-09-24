import type { KeyboardEvent } from 'react';
import { useLocaleStore } from '../../i18n/localeStore';
import { playerText } from '../../i18n/playerText';
import styles from './DigitDial.module.css';

interface DigitDialProps {
  label: string;
  value: number;
  onChange: (value: number) => void;
  disabled?: boolean;
}

function wrap(value: number): number {
  return ((value % 10) + 10) % 10;
}

/**
 * One of the Gate's four independent digit dials (0–9 only). Mouse/touch
 * via the up/down buttons, keyboard via ArrowUp/ArrowDown (wrapping),
 * Home/End (jump to 0/9), or typing a digit directly. Never combines with
 * the other three dials into a single string anywhere in this component —
 * the parent only ever sees one digit's numeric value at a time.
 */
export function DigitDial({ label, value, onChange, disabled = false }: DigitDialProps) {
  const locale = useLocaleStore((s) => s.locale);
  const increase = () => onChange(wrap(value + 1));
  const decrease = () => onChange(wrap(value - 1));

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (disabled) return;
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      increase();
    } else if (event.key === 'ArrowDown') {
      event.preventDefault();
      decrease();
    } else if (event.key === 'Home') {
      event.preventDefault();
      onChange(0);
    } else if (event.key === 'End') {
      event.preventDefault();
      onChange(9);
    } else if (/^[0-9]$/.test(event.key)) {
      event.preventDefault();
      onChange(Number(event.key));
    }
  };

  return (
    <div className={styles.dial}>
      <button
        type="button"
        className={styles.stepButton}
        aria-label={`${playerText('increase', locale)} ${label}`}
        onClick={increase}
        disabled={disabled}
        tabIndex={-1}
      >
        ▲
      </button>
      <div
        className={styles.value}
        role="spinbutton"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={9}
        aria-valuenow={value}
        tabIndex={disabled ? -1 : 0}
        onKeyDown={handleKeyDown}
      >
        {value}
      </div>
      <button
        type="button"
        className={styles.stepButton}
        aria-label={`${playerText('decrease', locale)} ${label}`}
        onClick={decrease}
        disabled={disabled}
        tabIndex={-1}
      >
        ▼
      </button>
    </div>
  );
}
