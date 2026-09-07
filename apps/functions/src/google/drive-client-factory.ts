import { loadGoogleServiceAccount } from '../config/google-credential-loader.js';
import { AppError } from '../errors/app-error.js';
import { RealGoogleDriveClient, type GoogleCredential } from './real-drive-client.js';
import type { GoogleDriveClient } from './drive-types.js';

/** Reuses the same backend-only service account credential as the Sheets client, with Drive read scope. */
export function createGoogleDriveClientOrNull(): GoogleDriveClient | null {
  const { credential, status } = loadGoogleServiceAccount();
  if (!status.googleServiceAccount.present || !credential) return null;
  return new RealGoogleDriveClient(credential as unknown as GoogleCredential);
}

export function requireGoogleDriveClient(): GoogleDriveClient {
  const client = createGoogleDriveClientOrNull();
  if (!client) {
    throw new AppError(
      'GOOGLE_CONFIG_NOT_FOUND',
      'Google credentials are not configured on the backend.',
    );
  }
  return client;
}
