import type { ChurchStateResponse } from '@veoullas-world/contracts';

export interface CandleOperation {
  path:
    '/church/candle' | '/church/candle/extinguish' | '/church/candle/add' | '/church/candle/remove';
  body: { candleId?: string; clientRequestId?: string };
}
const storageKey = (userId: string) => `vw_pending_candle_v1:${userId}`;
export function rememberCandleOperation(userId: string, operation: CandleOperation | null): void {
  try {
    if (operation) localStorage.setItem(storageKey(userId), JSON.stringify(operation));
    else localStorage.removeItem(storageKey(userId));
  } catch {
    /* In-memory recovery still works when storage is unavailable. */
  }
}
export function readCandleOperation(userId: string): CandleOperation | null {
  try {
    const value = JSON.parse(
      localStorage.getItem(storageKey(userId)) ?? 'null',
    ) as CandleOperation | null;
    if (
      !value ||
      ![
        '/church/candle',
        '/church/candle/extinguish',
        '/church/candle/add',
        '/church/candle/remove',
      ].includes(value.path)
    )
      return null;
    const id = value.path.endsWith('/add') ? value.body?.clientRequestId : value.body?.candleId;
    return typeof id === 'string' && /^[A-Za-z0-9_.:-]{1,80}$/.test(id) ? value : null;
  } catch {
    return null;
  }
}
export function candleEffectSaved(operation: CandleOperation, state: ChurchStateResponse): boolean {
  const id = operation.body.candleId ?? '';
  switch (operation.path) {
    case '/church/candle':
      return state.candles.lit.includes(id);
    case '/church/candle/extinguish':
      return !state.candles.lit.includes(id) || state.candles.preserved.includes(id);
    case '/church/candle/remove':
      return !state.candles.slots.includes(id);
    case '/church/candle/add':
      return Boolean(state.candles.addRequests?.[operation.body.clientRequestId ?? '']);
  }
}
