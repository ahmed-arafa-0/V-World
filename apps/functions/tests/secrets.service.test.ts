import { describe, expect, it } from 'vitest';
import { GOOD_WORKBOOK } from '@veoullas-world/test-fixtures';
import { getSecret } from '../src/services/secrets.service.js';
import { SheetGateway } from '../src/repositories/sheet-gateway.js';
import { FakeGoogleSheetsClient } from './helpers/fake-sheets-client.js';

function makeGateway(): SheetGateway {
  return new SheetGateway(new FakeGoogleSheetsClient(structuredClone(GOOD_WORKBOOK)), {
    ttlSeconds: 60,
  });
}

describe('getSecret', () => {
  it('returns the fake fixture value for an enabled secret', async () => {
    const result = await getSecret(makeGateway(), 'secret_gemini_fixture');
    expect(result).toEqual({ status: 'enabled', value: 'FAKE_GEMINI_KEY_NOT_REAL' });
  });

  it('returns a disabled status without the value for a disabled secret', async () => {
    const result = await getSecret(makeGateway(), 'secret_weather_fixture');
    expect(result).toEqual({ status: 'disabled' });
  });

  it('returns not_found for an unknown secret ID', async () => {
    const result = await getSecret(makeGateway(), 'secret_does_not_exist');
    expect(result).toEqual({ status: 'not_found' });
  });
});
