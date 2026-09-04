import { loadGoogleServiceAccount } from '../config/google-credential-loader.js';
import { getSheetResourceConfig } from '../config/resource-config.js';
import { AppError } from '../errors/app-error.js';
import { RealGoogleSheetsClient, type GoogleCredential } from './real-sheets-client.js';
import type { GoogleSheetsClient } from './types.js';

export function createGoogleSheetsClientOrNull(): GoogleSheetsClient | null {
  const { credential, status } = loadGoogleServiceAccount();
  if (!status.googleServiceAccount.present || !credential) return null;
  const { spreadsheetId } = getSheetResourceConfig();
  return new RealGoogleSheetsClient(credential as unknown as GoogleCredential, spreadsheetId);
}

export function requireGoogleSheetsClient(): GoogleSheetsClient {
  const client = createGoogleSheetsClientOrNull();
  if (!client) {
    throw new AppError(
      'GOOGLE_CONFIG_NOT_FOUND',
      'Google credentials are not configured on the backend.',
    );
  }
  return client;
}
