import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';

describe('GET /api/health', () => {
  it('returns 200 with the structured health payload', async () => {
    const response = await request(createApp()).get('/api/health');

    expect(response.status).toBe(200);
    expect(response.body.ok).toBe(true);
    expect(response.body.service).toBe('veoullas-world-functions');
    expect(response.body.milestone).toBe('M00');
    expect(typeof response.body.timestamp).toBe('string');
    expect(response.body.config.googleServiceAccount.present).toBe(false);
  });
});

describe('unknown route', () => {
  it('returns a structured 404 ApiError rather than a raw framework error', async () => {
    const response = await request(createApp()).get('/api/does-not-exist');

    expect(response.status).toBe(404);
    expect(response.body).toEqual({
      ok: false,
      code: 'not_found',
      message: 'No route for GET /api/does-not-exist',
    });
  });
});
