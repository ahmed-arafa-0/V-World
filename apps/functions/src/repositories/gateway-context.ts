import { createGoogleSheetsClientOrNull } from '../google/client-factory.js';
import { SheetGateway } from './sheet-gateway.js';

const DEFAULT_TTL_SECONDS = 60;

let cachedGateway: SheetGateway | null = null;

/** Production gateway provider: lazily builds one real, credential-backed gateway and reuses it. */
export function getProductionGatewayOrNull(): SheetGateway | null {
  if (cachedGateway) return cachedGateway;
  const client = createGoogleSheetsClientOrNull();
  if (!client) return null;
  cachedGateway = new SheetGateway(client, { ttlSeconds: DEFAULT_TTL_SECONDS });
  return cachedGateway;
}

export function resetProductionGatewayForTests(): void {
  cachedGateway = null;
}
