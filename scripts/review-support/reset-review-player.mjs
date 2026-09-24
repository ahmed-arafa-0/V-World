import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { REVIEW_STATE_TABS } from '../review-isolation.mjs';

/** Explicit synthetic identity only. Clear its cells in place; keep all other rows and audit logs. */
export async function resetReviewPlayer(client, userId) {
  assert.match(userId, /^manual_review_(?:\d+|bday_[a-z0-9_]+)$/);
  const snapshots = {};
  for (const tab of REVIEW_STATE_TABS) {
    const values = await client.getValues(tab, 'FORMULA');
    const header = values[0];
    const userColumn = header.indexOf('user_id');
    assert.ok(userColumn >= 0);
    snapshots[tab] = {
      header,
      rows: values.flatMap((row, i) =>
        i > 0 && row[userColumn] === userId ? [{ sheetRow: i + 1, row }] : [],
      ),
    };
  }
  const dir = path.resolve('test-results/review-backups');
  fs.mkdirSync(dir, { recursive: true });
  const backup = path.join(dir, `${userId}-${Date.now()}.json`);
  fs.writeFileSync(
    backup,
    JSON.stringify({ userId, savedAt: new Date().toISOString(), tables: snapshots }, null, 2),
  );
  let count = 0;
  for (const [tab, snapshot] of Object.entries(snapshots)) {
    if (!snapshot.rows.length) continue;
    const fresh = await client.getValues(tab, 'FORMULA');
    for (const { sheetRow, row } of snapshot.rows)
      assert.ok(
        JSON.stringify(fresh[sheetRow - 1]) === JSON.stringify(row),
        'Review state changed during reset; stop',
      );
    const updates = snapshot.rows.map(({ sheetRow }) => ({
      range: `${tab}!A${sheetRow}`,
      values: [snapshot.header.map(() => '')],
    }));
    await client.batchUpdateValues(updates);
    const after = await client.getValues(tab, 'FORMULA');
    for (let i = 1; i < fresh.length; i++) {
      if (snapshot.rows.some((r) => r.sheetRow === i + 1))
        assert.ok(!(after[i] ?? []).some(Boolean));
      else
        assert.ok(
          JSON.stringify(after[i] ?? []) === JSON.stringify(fresh[i]),
          'Unrelated player row changed',
        );
    }
    count += updates.length;
  }
  console.log(
    `Backed up and reset ${count} gameplay/reward rows for ${userId}. Audit logs preserved. Backup: ${backup}`,
  );
  return { backup, count };
}
