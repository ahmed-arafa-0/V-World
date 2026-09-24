import { readAppConfig, type WorldCtx } from './common.js';

export type WeatherStatus = 'raining' | 'dry' | 'unavailable';

/** Injectable so tests never touch the network. */
export interface WeatherProvider {
  /** Start-of-hour instants (UTC) with measurable rain over the last few days, oldest first. */
  rainHours(latitude: number, longitude: number): Promise<Date[]>;
}

const CACHE_MS = 10 * 60 * 1000;
const TIMEOUT_MS = 4000;
const cache = new Map<string, { at: number; hours: Date[] }>();

/** Open-Meteo hourly precipitation (no API key). Any failure throws so callers can fall back. */
export const openMeteoProvider: WeatherProvider = {
  async rainHours(latitude, longitude) {
    const key = `${latitude.toFixed(2)},${longitude.toFixed(2)}`;
    const hit = cache.get(key);
    if (hit && Date.now() - hit.at < CACHE_MS) return hit.hours;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const url =
        `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}` +
        '&hourly=precipitation&past_days=3&forecast_days=1&timezone=UTC';
      const response = await fetch(url, { signal: controller.signal });
      if (!response.ok) throw new Error(`weather ${response.status}`);
      const body = (await response.json()) as {
        hourly?: { time?: string[]; precipitation?: (number | null)[] };
      };
      const times = body.hourly?.time ?? [];
      const rain = body.hourly?.precipitation ?? [];
      const hours = times
        .map((t, i) => ((rain[i] ?? 0) > 0 ? new Date(`${t}:00Z`) : null))
        .filter((d): d is Date => d !== null && !Number.isNaN(d.getTime()));
      cache.set(key, { at: Date.now(), hours });
      return hours;
    } finally {
      clearTimeout(timer);
    }
  },
};

export interface WeatherReading {
  status: WeatherStatus;
  /** Rain hours no later than `now`, oldest first (empty when unavailable). */
  rainHours: Date[];
}

/**
 * Real-world rain at the Sheet-configured location (`weather_latitude` /
 * `weather_longitude` in `01_APP_CONFIG`, gated by `real_weather_enabled`).
 * Missing config, a disabled flag, or any provider failure yields
 * `unavailable` — the world simply carries on without rain and the player can
 * still water by hand.
 */
export async function readWeather(ctx: WorldCtx): Promise<WeatherReading> {
  const unavailable: WeatherReading = { status: 'unavailable', rainHours: [] };
  try {
    const config = await readAppConfig(ctx.gateway);
    if ((config.get('real_weather_enabled') ?? 'FALSE').toUpperCase() !== 'TRUE')
      return unavailable;
    if (!config.has('weather_latitude') || !config.has('weather_longitude')) return unavailable;
    const latitude = Number(config.get('weather_latitude'));
    const longitude = Number(config.get('weather_longitude'));
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || !ctx.weather) {
      return unavailable;
    }
    const hours = (await ctx.weather.rainHours(latitude, longitude))
      .filter((h) => h.getTime() <= ctx.now.getTime())
      .sort((a, b) => a.getTime() - b.getTime());
    const last = hours[hours.length - 1];
    // "Raining" while the latest rain hour is the current or previous hour.
    const raining = last !== undefined && ctx.now.getTime() - last.getTime() < 2 * 3_600_000;
    return { status: raining ? 'raining' : 'dry', rainHours: hours };
  } catch {
    return unavailable;
  }
}
