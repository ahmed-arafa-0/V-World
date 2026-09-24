import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { TARGET_AT, END_AT, cairoLocal } from './birthday-dates.mjs';

export async function patchBirthdayDates(client, gateway, apply) {
  const tab = '17_EVENTS';
  const original = await client.getValues(tab, 'FORMULA');
  const header = original[0];
  const index = original.findIndex(
    (r, i) => i > 0 && r[header.indexOf('event_id')] === 'birthday_2026',
  );
  assert.ok(index > 0, 'Existing birthday row required');
  const found = await gateway.findByPrimaryKey(tab, 'birthday_2026', {
    bypass: true,
    strict: true,
  });
  const desired = { start_at: TARGET_AT, target_at: TARGET_AT, end_at: END_AT };
  const patch = Object.fromEntries(
    Object.entries(desired).filter(([k, v]) => found.row.values[k] !== v),
  );
  const column = (i) => {
    let s = '';
    for (i++; i; i = Math.floor((i - 1) / 26)) s = String.fromCharCode(65 + ((i - 1) % 26)) + s;
    return s;
  };
  const cells = Object.keys(patch).map((k) => `${tab}!${column(header.indexOf(k))}${index + 1}`);
  console.log(
    JSON.stringify({
      apply,
      cells,
      dates: desired,
      cairoStart: cairoLocal(TARGET_AT),
      cairoEnd: cairoLocal(END_AT),
    }),
  );
  if (!cells.length) {
    console.log('Verified zero-write rerun: 0 cells changed.');
    return;
  }
  if (!apply) return;
  const dir = path.resolve('test-results/birthday-review/date-backups');
  fs.mkdirSync(dir, { recursive: true });
  const backup = path.join(dir, `birthday_2026-${Date.now()}.json`);
  fs.writeFileSync(
    backup,
    JSON.stringify(
      {
        savedAt: new Date().toISOString(),
        tab,
        sheetRow: index + 1,
        header,
        row: original[index],
        patch,
        cells,
      },
      null,
      2,
    ),
  );
  await gateway.updateByPrimaryKey(tab, 'birthday_2026', patch, found);
  const readback = await client.getValues(tab, 'FORMULA');
  const expected = original.map((r) => [...r]);
  for (const [k, v] of Object.entries(patch)) expected[index][header.indexOf(k)] = v;
  assert.deepEqual(
    readback,
    expected,
    'Only the three approved cells may change; formulas must be preserved',
  );
  const fresh = await gateway.findByPrimaryKey(tab, 'birthday_2026', {
    bypass: true,
    strict: true,
  });
  for (const [k, v] of Object.entries(desired)) assert.equal(fresh.row.values[k], v);
  console.log(
    `Fresh normalized readback and entire-tab formula preservation passed. Backup: ${backup}`,
  );
}
