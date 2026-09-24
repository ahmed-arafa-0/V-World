import { describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { buildM02Workbook } from '@veoullas-world/test-fixtures';
import { createApp } from '../src/app.js';
import { SheetGateway } from '../src/repositories/sheet-gateway.js';
import { FakeGoogleSheetsClient } from './helpers/fake-sheets-client.js';
import { AppError } from '../src/errors/app-error.js';

describe('session storage failures stay inside HTTP handlers', () => {
  for (const kind of ['owner', 'admin']) {
    for (const method of ['get', 'post', 'delete'] as const) {
      it(`${kind} ${method} answers 503 and preserves cookies on a failed lookup`, async () => {
        const gateway = new SheetGateway(new FakeGoogleSheetsClient(buildM02Workbook()));
        const lookup = vi
          .spyOn(gateway, 'findByPrimaryKey')
          .mockRejectedValueOnce(new AppError('SHEET_UNAVAILABLE', 'Storage unavailable'));
        const app = createApp({ getGateway: () => gateway, isProduction: () => false });
        const path = `/api/session/${kind}${method === 'post' ? '/heartbeat' : ''}`;
        const r = await request(app)
          [method](path)
          .set('Cookie', `vw_${kind}_session=sess_${kind === 'owner' ? 'gate' : 'admin'}_fixture`);
        expect(r.status).toBe(503);
        expect(r.body.code).toBe('SHEET_UNAVAILABLE');
        expect(r.headers['set-cookie']).toBeUndefined();
        lookup.mockRestore();
        expect((await request(app).get(`/api/session/${kind}`)).status).toBe(401);
      });
    }
  }
});
