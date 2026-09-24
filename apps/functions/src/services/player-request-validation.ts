const MAX_ID_LENGTH = 200;
const ID_PATTERN = /^[A-Za-z0-9_-]+$/;

function isValidId(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= MAX_ID_LENGTH &&
    ID_PATTERN.test(value)
  );
}

function hasOnlyKeys(body: Record<string, unknown>, allowed: string[]): boolean {
  return Object.keys(body).every((key) => allowed.includes(key));
}

function asRecord(body: unknown): Record<string, unknown> | null {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  return body as Record<string, unknown>;
}

export interface ValidCheckpointInput {
  routeId: string;
  beatId: string;
  checkpoint: boolean;
  currentLocation?: string;
}

export function validateCheckpointRequest(body: unknown): ValidCheckpointInput | null {
  const b = asRecord(body);
  if (!b) return null;
  if (!hasOnlyKeys(b, ['routeId', 'beatId', 'checkpoint', 'currentLocation'])) return null;
  if (!isValidId(b.routeId) || !isValidId(b.beatId)) return null;
  if (typeof b.checkpoint !== 'boolean') return null;
  if (b.currentLocation !== undefined && !isValidId(b.currentLocation)) return null;

  return {
    routeId: b.routeId,
    beatId: b.beatId,
    checkpoint: b.checkpoint,
    currentLocation: typeof b.currentLocation === 'string' ? b.currentLocation : undefined,
  };
}

export interface ValidRouteCompleteInput {
  routeId: string;
}

export function validateRouteCompleteRequest(body: unknown): ValidRouteCompleteInput | null {
  const b = asRecord(body);
  if (!b) return null;
  if (!hasOnlyKeys(b, ['routeId'])) return null;
  if (!isValidId(b.routeId)) return null;
  return { routeId: b.routeId };
}
