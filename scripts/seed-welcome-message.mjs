#!/usr/bin/env node
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { createGoogleSheetsClientOrNull } from '../apps/functions/lib/google/client-factory.js';
import { SheetGateway } from '../apps/functions/lib/repositories/sheet-gateway.js';
import {
  planWelcomeMessage,
  applyWelcomeMessage,
} from '../apps/functions/lib/services/welcome-message-seed.service.js';
const out = 'test-results/welcome-message';
fs.mkdirSync(out, { recursive: true });
const input = JSON.parse(
  fs.readFileSync('scripts/content/welcome-message-2026-09-22.json', 'utf8'),
);
const client = createGoogleSheetsClientOrNull();
if (!client) throw Error('Backend credential unavailable.');
const gateway = new SheetGateway(client, { ttlSeconds: 60 });
const formulas = await client.getValues('19_MESSAGES', 'FORMULA');
const table = await gateway.readTab('19_MESSAGES', { bypass: true, strict: true });
const plan = planWelcomeMessage(table, formulas, input);
if (process.argv.includes('--preview')) {
  fs.writeFileSync(`${out}/content-preview.json`, JSON.stringify(plan, null, 2));
  fs.writeFileSync(`${out}/message-formulas-before.json`, JSON.stringify(formulas, null, 2));
  console.log(JSON.stringify(plan, null, 2));
} else if (process.argv.includes('--apply')) {
  const preview = JSON.parse(fs.readFileSync(`${out}/content-preview.json`, 'utf8'));
  assert.equal(preview.conflicts.length, 0);
  assert.equal(plan.conflicts.length, 0, JSON.stringify(plan.conflicts));
  for (const row of plan.rows) {
    const approved = preview.rows.find((p) => p.id === row.id);
    assert.deepEqual(
      row.after,
      approved?.after,
      'Content or metadata differs from the local preview.',
    );
    assert.ok(
      JSON.stringify(row.before) === JSON.stringify(approved.before) ||
        JSON.stringify(row.before) === JSON.stringify(approved.after),
      'Existing row changed after preview.',
    );
  }
  const changed = await applyWelcomeMessage(gateway, plan);
  const after = await client.getValues('19_MESSAGES', 'FORMULA');
  const header = after[0],
    key = header.indexOf('message_row_id'),
    text = header.indexOf('text');
  const expected = structuredClone(formulas);
  for (const row of expected.slice(1)) {
    const update = plan.rows.find((p) => p.id === row[key]);
    if (update) row[text] = update.after.text;
  }
  assert.deepEqual(after, expected, 'Only the five previewed text cells may change.');
  const result = {
    at: new Date().toISOString(),
    changed,
    unchanged: plan.rows.filter((r) => r.action === 'unchanged').map((r) => r.id),
    formulaAndUnrelatedFieldsPreserved: true,
  };
  fs.writeFileSync(
    `${out}/${changed.length ? 'applied' : 'rerun'}.json`,
    JSON.stringify(result, null, 2),
  );
  fs.writeFileSync(`${out}/message-formulas-after.json`, JSON.stringify(after, null, 2));
  console.log(JSON.stringify(result, null, 2));
} else throw Error('Use --preview, then --apply.');
