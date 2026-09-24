import { createGoogleSheetsClientOrNull } from '../google/client-factory.js';
import { SheetGateway } from './sheet-gateway.js';

const DEFAULT_TTL_SECONDS = 90;
/** Google meters reads and writes separately (about 60 each per minute per user); stay under each and let bursts queue briefly instead of failing. */
const MAX_UPSTREAM_REQUESTS_PER_MINUTE = 52;

let cachedGateway: SheetGateway | null = null;

/** Production gateway provider: lazily builds one real, credential-backed gateway and reuses it. */
export function getProductionGatewayOrNull(): SheetGateway | null {
  if (cachedGateway) return cachedGateway;
  const client = createGoogleSheetsClientOrNull();
  if (!client) return null;
  cachedGateway = new SheetGateway(client, {
    ttlSeconds: DEFAULT_TTL_SECONDS,
    maxRequestsPerMinute: MAX_UPSTREAM_REQUESTS_PER_MINUTE,
  });
  return cachedGateway;
}

export function resetProductionGatewayForTests(): void {
  cachedGateway = null;
}
