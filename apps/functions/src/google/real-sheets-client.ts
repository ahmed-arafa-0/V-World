import { google, type sheets_v4 } from 'googleapis';
import { mapGoogleError } from './google-error-mapper.js';
import type { GoogleSheetsClient, SpreadsheetMetadata } from './types.js';

const SCOPES = ['https://www.googleapis.com/auth/spreadsheets'];

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
      const resp = await this.sheets.spreadsheets.get({ spreadsheetId: this.spreadsheetId });
      return {
        spreadsheetId: resp.data.spreadsheetId ?? this.spreadsheetId,
        title: resp.data.properties?.title ?? '',
        tabTitles: (resp.data.sheets ?? []).map((s) => s.properties?.title ?? ''),
      };
    } catch (err) {
      throw mapGoogleError(err);
    }
  }

  async getValues(range: string): Promise<string[][]> {
    try {
      const resp = await this.sheets.spreadsheets.values.get({
        spreadsheetId: this.spreadsheetId,
        range,
      });
      return (resp.data.values as string[][] | undefined) ?? [];
    } catch (err) {
      throw mapGoogleError(err);
    }
  }

  async batchGetValues(ranges: string[]): Promise<Record<string, string[][]>> {
    try {
      const resp = await this.sheets.spreadsheets.values.batchGet({
        spreadsheetId: this.spreadsheetId,
        ranges,
      });
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
      await this.sheets.spreadsheets.values.update({
        spreadsheetId: this.spreadsheetId,
        range,
        valueInputOption: 'RAW',
        requestBody: { values },
      });
    } catch (err) {
      throw mapGoogleError(err);
    }
  }

  async appendValues(range: string, values: string[][]): Promise<void> {
    try {
      await this.sheets.spreadsheets.values.append({
        spreadsheetId: this.spreadsheetId,
        range,
        valueInputOption: 'RAW',
        insertDataOption: 'INSERT_ROWS',
        requestBody: { values },
      });
    } catch (err) {
      throw mapGoogleError(err);
    }
  }
}
