import { createGoogleDriveClientOrNull } from '../google/drive-client-factory.js';
import type { GoogleDriveClient } from '../google/drive-types.js';

let cachedClient: GoogleDriveClient | null = null;

/** Production Drive client provider: lazily builds one real, credential-backed client and reuses it. */
export function getProductionDriveClientOrNull(): GoogleDriveClient | null {
  if (cachedClient) return cachedClient;
  const client = createGoogleDriveClientOrNull();
  if (!client) return null;
  cachedClient = client;
  return cachedClient;
}

export function resetProductionDriveClientForTests(): void {
  cachedClient = null;
}
