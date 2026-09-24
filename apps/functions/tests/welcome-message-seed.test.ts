import { describe, expect, it } from 'vitest';
import { buildM02Workbook, headerFor, row } from '@veoullas-world/test-fixtures';
import { SheetGateway } from '../src/repositories/sheet-gateway.js';
import { FakeGoogleSheetsClient } from './helpers/fake-sheets-client.js';
import {
  planWelcomeMessage,
  applyWelcomeMessage,
} from '../src/services/welcome-message-seed.service.js';
const locales = ['en', 'ar-EG', 'it', 'el', 'fr'];
const ids = ['en', 'ar', 'it', 'el', 'fr'];
const input = {
  messageId: 'msg_welcome_ahmed',
  texts: Object.fromEntries(locales.map((l) => [l, `Approved ${l}\n\n— Ahmed`])),
};
function fixture() {
  const wb = buildM02Workbook();
  wb['19_MESSAGES'] = [
    headerFor('19_MESSAGES'),
    ...locales.map((l, i) =>
      row('19_MESSAGES', {
        message_row_id: `msg_welcome_${ids[i]}`,
        message_id: input.messageId,
        locale: l,
        recipient_user_id: 'veoulla',
        delivery_at: '<FIRST_VISIT>',
        enabled: 'TRUE',
        text: '',
        notes: '=1+1',
      }),
    ),
    row('19_MESSAGES', {
      message_row_id: 'unrelated',
      message_id: 'other',
      text: 'Private unrelated letter',
    }),
  ];
  const client = new FakeGoogleSheetsClient(wb),
    gateway = new SheetGateway(client);
  return { client, gateway };
}
describe('narrow welcome content seed', () => {
  it('writes only five text cells, preserves other content/formulas and reruns without writes', async () => {
    const { client, gateway } = fixture();
    const raw = await client.getValues('19_MESSAGES');
    const plan = planWelcomeMessage(await gateway.readTab('19_MESSAGES'), raw, input);
    expect(plan.conflicts).toEqual([]);
    expect(await applyWelcomeMessage(gateway, plan)).toHaveLength(5);
    const after = await client.getValues('19_MESSAGES');
    for (let i = 1; i <= 5; i++) {
      const expected = [...raw[i]!];
      expected[8] = input.texts[locales[i - 1]!]!;
      expect(after[i]).toEqual(expected);
    }
    expect(after[6]).toEqual(raw[6]);
    const calls = client.callCounts.updateValues;
    expect(
      await applyWelcomeMessage(
        gateway,
        planWelcomeMessage(await gateway.readTab('19_MESSAGES'), after, input),
      ),
    ).toEqual([]);
    expect(client.callCounts.updateValues).toBe(calls);
  });
  for (const existing of [
    'Already authored text',
    '=IF(TRUE,"","")',
    '<UNRELATED AUTHORING PROMPT>',
  ])
    it(`preserves conflict: ${existing}`, async () => {
      const { client, gateway } = fixture();
      await gateway.updateByPrimaryKey('19_MESSAGES', 'msg_welcome_en', { text: existing });
      const plan = planWelcomeMessage(
        await gateway.readTab('19_MESSAGES'),
        await client.getValues('19_MESSAGES'),
        input,
      );
      expect(plan.conflicts).toHaveLength(1);
      await expect(applyWelcomeMessage(gateway, plan)).rejects.toThrow('conflicts');
      expect((await gateway.findByPrimaryKey('19_MESSAGES', 'msg_welcome_en'))?.row.raw.text).toBe(
        existing,
      );
    });
  it('replaces the exact existing authoring placeholder and refuses changed recipient/metadata', async () => {
    const { client, gateway } = fixture();
    await gateway.updateByPrimaryKey('19_MESSAGES', 'msg_welcome_en', {
      text: "<WRITE AHMED'S FIRST MESSAGE>",
    });
    const plan = planWelcomeMessage(
      await gateway.readTab('19_MESSAGES'),
      await client.getValues('19_MESSAGES'),
      input,
    );
    expect(plan.conflicts).toEqual([]);
    await gateway.updateByPrimaryKey('19_MESSAGES', 'msg_welcome_fr', { notes: 'Another edit' });
    await expect(applyWelcomeMessage(gateway, plan)).rejects.toThrow('Row changed after preview');
    expect((await gateway.findByPrimaryKey('19_MESSAGES', 'msg_welcome_en'))?.row.raw.text).toBe(
      "<WRITE AHMED'S FIRST MESSAGE>",
    );
  });
});
