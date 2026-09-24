import { google, type sheets_v4 } from 'googleapis';
import { AppError } from '../errors/app-error.js';
import { isTransportTimeout, mapGoogleError } from './google-error-mapper.js';
import type { GoogleSheetsClient, SpreadsheetMetadata } from './types.js';

const SCOPES = ['https://www.googleapis.com/auth/spreadsheets'];

/**
 * Every upstream call is bounded: a hung request fails fast (and is retried once by the gateway's
 * short retry) instead of holding the player's request open for a minute.
 */
const REQUEST_OPTIONS = {
  timeout: 12_000,
  // The client library's own silent retry/backoff turned one 429 into a 20–60 s hidden wait. The
  // gateway retries a bounded number of times instead, and reports a failure the player can see.
  retry: false,
  retryConfig: { retry: 0 },
};

export interface GoogleCredential {
  client_email: string;
  private_key: string;
  [key: string]: unknown;
}

export class RealGoogleSheetsClient implements GoogleSheetsClient {
  private readonly sheets: sheets_v4.Sheets;
  private readonly spreadsheetId: string;

  constructor(credential: GoogleCredential, spreadsheetId: string) {
    const auth = new google.auth.GoogleAuth({ credentials: credential, scopes: SCOPES });
    this.sheets = google.sheets({ version: 'v4', auth });
    this.spreadsheetId = spreadsheetId;
  }

  async getMetadata(): Promise<SpreadsheetMetadata> {
    try {
      const resp = await this.sheets.spreadsheets.get(
        { spreadsheetId: this.spreadsheetId },
        REQUEST_OPTIONS,
      );
      return {
        spreadsheetId: resp.data.spreadsheetId ?? this.spreadsheetId,
        title: resp.data.properties?.title ?? '',
        tabTitles: (resp.data.sheets ?? []).map((s) => s.properties?.title ?? ''),
      };
    } catch (err) {
      throw mapGoogleError(err);
    }
  }

  async getValues(range: string, valueRenderOption?: 'FORMULA'): Promise<string[][]> {
    try {
      const resp = await this.sheets.spreadsheets.values.get(
        {
          spreadsheetId: this.spreadsheetId,
          range,
          ...(valueRenderOption ? { valueRenderOption } : {}),
        },
        REQUEST_OPTIONS,
      );
      return (resp.data.values as string[][] | undefined) ?? [];
    } catch (err) {
      throw mapGoogleError(err);
    }
  }

  async batchGetValues(ranges: string[]): Promise<Record<string, string[][]>> {
    try {
      const resp = await this.sheets.spreadsheets.values.batchGet(
        { spreadsheetId: this.spreadsheetId, ranges },
        REQUEST_OPTIONS,
      );
      const out: Record<string, string[][]> = {};
      for (const vr of resp.data.valueRanges ?? []) {
        const tabName = (vr.range ?? '').split('!')[0]!.replace(/^'|'$/g, '');
        out[tabName] = (vr.values as string[][] | undefined) ?? [];
      }
      return out;
    } catch (err) {
      throw mapGoogleError(err);
    }
  }

  async updateValues(range: string, values: string[][]): Promise<void> {
    try {
      await this.sheets.spreadsheets.values.update(
        {
          spreadsheetId: this.spreadsheetId,
          range,
          valueInputOption: 'RAW',
          requestBody: { values },
        },
        REQUEST_OPTIONS,
      );
    } catch (err) {
      throw mapGoogleError(err);
    }
  }

  async batchUpdateValues(updates: { range: string; values: string[][] }[]): Promise<void> {
    try {
      await this.sheets.spreadsheets.values.batchUpdate(
        {
          spreadsheetId: this.spreadsheetId,
          requestBody: { valueInputOption: 'RAW', data: updates },
        },
        REQUEST_OPTIONS,
      );
    } catch (err) {
      throw mapGoogleError(err);
    }
  }

  async appendValues(range: string, values: string[][]): Promise<void> {
    try {
      await this.sheets.spreadsheets.values.append(
        {
          spreadsheetId: this.spreadsheetId,
          range,
          valueInputOption: 'RAW',
          insertDataOption: 'INSERT_ROWS',
          requestBody: { values },
        },
        REQUEST_OPTIONS,
      );
    } catch (err) {
      const mapped = mapGoogleError(err);
      // An append that timed out may already have been written: never blindly re-send it. The
      // caller's idempotent key (append-if-absent) reconciles it on the player's retry.
      if (isTransportTimeout(err)) {
        throw new AppError(mapped.code, mapped.message, { retryable: false });
      }
      throw mapped;
    }
  }
}
