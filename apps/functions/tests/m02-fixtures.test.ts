import { describe, expect, it } from 'vitest';
import {
  GOOD_WORKBOOK,
  M02_ACCEPTED_ACCESS_CONFIG,
  M02_ADMIN_USER_ID,
  M02_APP_CONFIG_ROWS,
  M02_ENTRY_EVENT_TYPES,
  M02_FAKE_ADMIN_PASSWORD,
  M02_FAKE_GATE_CODE,
  M02_OWNER_USER_ID,
  M02_SESSION_ACTIVE_ID,
  M02_SESSION_EXPIRED_ID,
  M02_SESSION_TERMINATED_ID,
  buildM02Workbook,
} from '@veoullas-world/test-fixtures';

describe('M02 fixture isolation', () => {
  it('never reuses a real access value — fixture Gate code and Admin password are obviously fake', () => {
    expect(M02_FAKE_GATE_CODE).toMatch(/^\d{4}$/);
    expect(M02_FAKE_ADMIN_PASSWORD).toContain('fixture');
  });

  it('does not mutate GOOD_WORKBOOK when building a merged M02 workbook', () => {
    const snapshotBefore = structuredClone(GOOD_WORKBOOK);
    buildM02Workbook();
    expect(GOOD_WORKBOOK).toEqual(snapshotBefore);
  });

  it('returns an independently mutable workbook on every call', () => {
    const first = buildM02Workbook();
    const second = buildM02Workbook();

    first['02_USERS']![1]![0] = 'mutated';

    expect(second['02_USERS']![1]![0]).not.toBe('mutated');
  });

  it('covers all three session statuses with distinct session IDs', () => {
    const workbook = buildM02Workbook();
    const header = workbook['06_SESSIONS']![0]!;
    const idIdx = header.indexOf('session_id');
    const statusIdx = header.indexOf('status');
    const rows = workbook['06_SESSIONS']!.slice(1);

    const statuses = rows.map((r) => r[statusIdx]);
    expect(statuses.sort()).toEqual(['active', 'expired', 'terminated']);

    const ids = rows.map((r) => r[idIdx]);
    expect(ids).toEqual([M02_SESSION_ACTIVE_ID, M02_SESSION_EXPIRED_ID, M02_SESSION_TERMINATED_ID]);
  });

  it('models the owner and Admin as two distinct 02_USERS rows, matching the real Sheet shape', () => {
    const workbook = buildM02Workbook();
    const header = workbook['02_USERS']![0]!;
    const idIdx = header.indexOf('user_id');
    const roleIdx = header.indexOf('role');
    const rows = workbook['02_USERS']!.slice(1);

    const owner = rows.find((r) => r[idIdx] === M02_OWNER_USER_ID);
    const admin = rows.find((r) => r[idIdx] === M02_ADMIN_USER_ID);

    expect(owner?.[roleIdx]).toBe('owner');
    expect(admin?.[roleIdx]).toBe('admin');
  });

  it('exposes exactly the seven accepted M02 config rows plus header', () => {
    expect(M02_APP_CONFIG_ROWS).toHaveLength(Object.keys(M02_ACCEPTED_ACCESS_CONFIG).length + 1);
  });

  it('exposes exactly the eleven accepted entry_event_type values', () => {
    expect(M02_ENTRY_EVENT_TYPES).toHaveLength(11);
    expect(new Set(M02_ENTRY_EVENT_TYPES).size).toBe(11);
  });
});
