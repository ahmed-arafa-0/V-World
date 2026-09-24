import { calendarDateKey } from '../services/authoritative-time.service.js';

/** Minutes since local midnight in `timeZone`. */
export function localMinutes(now: Date, timeZone: string): number {
  try {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone,
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(now);
    const hour = Number(parts.find((p) => p.type === 'hour')?.value ?? '0');
    const minute = Number(parts.find((p) => p.type === 'minute')?.value ?? '0');
    return hour * 60 + minute;
  } catch {
    return now.getUTCHours() * 60 + now.getUTCMinutes();
  }
}

/** Parses `"09:00-11:00,17:00-19:00"` into minute ranges; malformed entries are ignored. */
export function parseWindows(raw: string | undefined): [number, number][] {
  if (!raw) return [];
  return raw
    .split(',')
    .map((part) => /^(\d{1,2}):(\d{2})-(\d{1,2}):(\d{2})$/.exec(part.trim()))
    .filter((m): m is RegExpExecArray => m !== null)
    .map((m) => [Number(m[1]) * 60 + Number(m[2]), Number(m[3]) * 60 + Number(m[4])]);
}

export interface MarcelinoPresence {
  visible: boolean;
  at: 'cottage' | 'farm' | 'away';
}

/**
 * Marcelino's scheduled appearances, from Sheet config: `marcelino_windows`
 * (Cottage/garden) and `marcelino_farm_windows` (Farm), as `HH:MM-HH:MM`
 * lists in the authoritative timezone. Living Bible §18I: he is NOT permanently
 * present — normal visibility is about once or twice a day from Sheet schedules
 * and story events. With no schedule configured he is therefore away, and
 * appears only when a delivery or story event brings him (see the Cottage service).
 */
export function marcelinoPresence(
  config: Map<string, string>,
  now: Date,
  timeZone: string,
): MarcelinoPresence {
  const cottage = parseWindows(config.get('marcelino_windows'));
  const farm = parseWindows(config.get('marcelino_farm_windows'));
  if (cottage.length === 0 && farm.length === 0) return { visible: false, at: 'away' };
  const minutes = localMinutes(now, timeZone);
  const within = (ranges: [number, number][]) =>
    ranges.some(([a, b]) => minutes >= a && minutes < b);
  if (within(farm)) return { visible: true, at: 'farm' };
  if (cottage.length === 0 || within(cottage)) return { visible: true, at: 'cottage' };
  return { visible: false, at: 'away' };
}

export function timeOfDay(now: Date, timeZone: string): 'dawn' | 'day' | 'dusk' | 'night' {
  const hour = Math.floor(localMinutes(now, timeZone) / 60);
  if (hour >= 5 && hour < 8) return 'dawn';
  if (hour >= 8 && hour < 17) return 'day';
  if (hour >= 17 && hour < 20) return 'dusk';
  return 'night';
}

export { calendarDateKey };
