import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { GOOD_WORKBOOK } from '@veoullas-world/test-fixtures';
import { createApp } from '../src/app.js';
import { SheetGateway } from '../src/repositories/sheet-gateway.js';
import { FakeGoogleSheetsClient } from './helpers/fake-sheets-client.js';

function appWithFakeGateway() {
  const client = new FakeGoogleSheetsClient(structuredClone(GOOD_WORKBOOK));
  const gateway = new SheetGateway(client, { ttlSeconds: 60 });
  return createApp({ getGateway: () => gateway });
}

function appWithoutGateway() {
  return createApp({ getGateway: () => null });
}

describe('GET /api/health', () => {
  it('returns 200 with the structured health payload when the backend is configured', async () => {
    const response = await request(appWithFakeGateway()).get('/api/health');

    expect(response.status).toBe(200);
    expect(response.body.ok).toBe(true);
    expect(response.body.service).toBe('veoullas-world-functions');
    expect(response.body.milestone).toBe('M01');
    expect(typeof response.body.timestamp).toBe('string');
    expect(response.body.sheets.reachable).toBe(true);
  });

  it('keeps working with a controlled status when the backend is not configured', async () => {
    const response = await request(appWithoutGateway()).get('/api/health');

    expect(response.status).toBe(200);
    expect(response.body.sheets.reachable).toBe(false);
    expect(response.body.schemaHealth.status).toBe('error');
  });
});

describe('GET /api/bootstrap', () => {
  it('returns a sanitized bootstrap payload with the expected exact counts', async () => {
    const response = await request(appWithFakeGateway()).get('/api/bootstrap');

    expect(response.status).toBe(200);
    expect(response.body.languages).toHaveLength(5);
    expect(response.body.locations).toHaveLength(8);
    expect(response.body.storyBeats).toHaveLength(18);
    expect(response.body.currentEvent?.eventId).toBe('birthday_2026');
  });

  it('supports a read-only refresh bypass', async () => {
    const response = await request(appWithFakeGateway()).get('/api/bootstrap?refresh=1');
    expect(response.status).toBe(200);
  });

  it('returns backend_not_configured when the Sheets backend is unavailable', async () => {
    const response = await request(appWithoutGateway()).get('/api/bootstrap');
    expect(response.status).toBe(503);
    expect(response.body).toEqual({
      ok: false,
      code: 'backend_not_configured',
      message: 'Google Sheets backend is not configured.',
    });
  });

  it('never sends a Google credential, Drive file ID, or plaintext secret over the network', async () => {
    const response = await request(appWithFakeGateway()).get('/api/bootstrap');
    const serialized = JSON.stringify(response.body);
    expect(serialized).not.toContain('fake_drive_id');
    expect(serialized).not.toContain('gserviceaccount.com');
    expect(serialized).not.toContain('FAKE_GEMINI_KEY_NOT_REAL');
  });
});

describe('GET /api/admin/schema-health', () => {
  it('returns sanitized structural diagnostics only', async () => {
    const response = await request(appWithFakeGateway()).get('/api/admin/schema-health');

    expect(response.status).toBe(200);
    expect(response.body.summary.expectedTabCount).toBe(42);
    expect(response.body.note).toMatch(/M02/);
    const serialized = JSON.stringify(response.body);
    expect(serialized).not.toContain('fixture-admin-pass');
    expect(serialized).not.toContain('FAKE_GEMINI_KEY_NOT_REAL');
  });
});

describe('unknown route', () => {
  it('returns a structured 404 ApiError rather than a raw framework error', async () => {
    const response = await request(appWithFakeGateway()).get('/api/does-not-exist');

    expect(response.status).toBe(404);
    expect(response.body).toEqual({
      ok: false,
      code: 'not_found',
      message: 'No route for GET /api/does-not-exist',
    });
  });
});
