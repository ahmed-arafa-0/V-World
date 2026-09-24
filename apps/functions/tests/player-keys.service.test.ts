import { describe, expect, it } from 'vitest';
import { GOOD_WORKBOOK } from '@veoullas-world/test-fixtures';
import { awardKey, getPlayerKeys, spendKey } from '../src/services/player-keys.service.js';
import { KeyMutex } from '../src/repositories/key-mutex.js';
import { SheetGateway } from '../src/repositories/sheet-gateway.js';
import { FakeGoogleSheetsClient } from './helpers/fake-sheets-client.js';

function gatewayFor(workbook: Record<string, string[][]>): SheetGateway {
  return new SheetGateway(new FakeGoogleSheetsClient(structuredClone(workbook)), {
    ttlSeconds: 60,
  });
}

const DAY_ONE = new Date('2026-09-16T10:00:00.000Z');
// +25h always lands on a different authoritative calendar day than DAY_ONE,
// in any timezone (a day is at most 25 hours with DST, so this is robust
// without needing to hardcode Africa/Cairo's exact DST rules).
const DAY_TWO = new Date(DAY_ONE.getTime() + 25 * 60 * 60 * 1000);

describe('awardKey', () => {
  it('creates a new key row on first award', async () => {
    const gateway = gatewayFor(GOOD_WORKBOOK);
    const mutex = new KeyMutex();
    const result = await awardKey(gateway, mutex, {
      userId: 'test_user_1',
      keyTypeId: 'key_test',
      quantity: 1,
      transactionId: 'txn_1',
      now: DAY_ONE,
    });

    expect(result.applied).toBe(true);
    expect(result.reason).toBe('created');
    expect(result.key.quantityFound).toBe(1);
    expect(result.key.quantityAvailable).toBe(1);
  });

  it('rejects a non-positive or non-integer quantity', async () => {
    const gateway = gatewayFor(GOOD_WORKBOOK);
    const mutex = new KeyMutex();
    await expect(
      awardKey(gateway, mutex, {
        userId: 'test_user_2',
        keyTypeId: 'key_test',
        quantity: 0,
        transactionId: 'txn_2',
        now: DAY_ONE,
      }),
    ).rejects.toThrow();
    await expect(
      awardKey(gateway, mutex, {
        userId: 'test_user_2',
        keyTypeId: 'key_test',
        quantity: 1.5,
        transactionId: 'txn_3',
        now: DAY_ONE,
      }),
    ).rejects.toThrow();
  });

  it('is idempotent: retrying the exact same transaction the same day changes nothing', async () => {
    const gateway = gatewayFor(GOOD_WORKBOOK);
    const mutex = new KeyMutex();
    await awardKey(gateway, mutex, {
      userId: 'test_user_3',
      keyTypeId: 'key_test',
      quantity: 1,
      transactionId: 'txn_same',
      now: DAY_ONE,
    });
    const retry = await awardKey(gateway, mutex, {
      userId: 'test_user_3',
      keyTypeId: 'key_test',
      quantity: 1,
      transactionId: 'txn_same',
      now: new Date(DAY_ONE.getTime() + 5000),
    });

    expect(retry.applied).toBe(false);
    expect(retry.reason).toBe('duplicate_transaction');
    expect(retry.key.quantityFound).toBe(1);
  });

  it('is idempotent when the exact same transaction is retried on a later day', async () => {
    const gateway = gatewayFor(GOOD_WORKBOOK);
    const mutex = new KeyMutex();
    await awardKey(gateway, mutex, {
      userId: 'test_user_late_retry',
      keyTypeId: 'key_test',
      quantity: 1,
      transactionId: 'txn_late_retry',
      now: DAY_ONE,
    });
    const retry = await awardKey(gateway, mutex, {
      userId: 'test_user_late_retry',
      keyTypeId: 'key_test',
      quantity: 1,
      transactionId: 'txn_late_retry',
      now: DAY_TWO,
    });

    expect(retry.applied).toBe(false);
    expect(retry.reason).toBe('duplicate_transaction');
    expect(retry.key.quantityFound).toBe(1);
  });

  it('rejects a second, genuinely different award of the same key shape on the same authoritative day', async () => {
    const gateway = gatewayFor(GOOD_WORKBOOK);
    const mutex = new KeyMutex();
    await awardKey(gateway, mutex, {
      userId: 'test_user_4',
      keyTypeId: 'key_test',
      quantity: 1,
      transactionId: 'txn_first',
      now: DAY_ONE,
    });
    const second = await awardKey(gateway, mutex, {
      userId: 'test_user_4',
      keyTypeId: 'key_test',
      quantity: 1,
      transactionId: 'txn_second_different',
      now: new Date(DAY_ONE.getTime() + 3600_000),
    });

    expect(second.applied).toBe(false);
    expect(second.reason).toBe('daily_cap_reached');
    // Quantity changed exactly once (T018/T020 from the Master Build Plan's acceptance matrix).
    expect(second.key.quantityFound).toBe(1);
  });

  it('allows a new award of the same key shape on a different authoritative day', async () => {
    const gateway = gatewayFor(GOOD_WORKBOOK);
    const mutex = new KeyMutex();
    await awardKey(gateway, mutex, {
      userId: 'test_user_5',
      keyTypeId: 'key_test',
      quantity: 1,
      transactionId: 'txn_day1',
      now: DAY_ONE,
    });
    const dayTwoResult = await awardKey(gateway, mutex, {
      userId: 'test_user_5',
      keyTypeId: 'key_test',
      quantity: 1,
      transactionId: 'txn_day2',
      now: DAY_TWO,
    });

    expect(dayTwoResult.applied).toBe(true);
    expect(dayTwoResult.reason).toBe('applied');
    expect(dayTwoResult.key.quantityFound).toBe(2);
    expect(dayTwoResult.key.quantityAvailable).toBe(2);
  });

  it('keeps found/spent/available consistent across an award after a spend', async () => {
    const gateway = gatewayFor(GOOD_WORKBOOK);
    const mutex = new KeyMutex();
    await awardKey(gateway, mutex, {
      userId: 'test_user_6',
      keyTypeId: 'key_test',
      quantity: 3,
      transactionId: 'txn_award1',
      now: DAY_ONE,
    });
    await spendKey(gateway, mutex, {
      userId: 'test_user_6',
      keyTypeId: 'key_test',
      quantity: 2,
      transactionId: 'txn_spend1',
      now: DAY_ONE,
    });
    const result = await awardKey(gateway, mutex, {
      userId: 'test_user_6',
      keyTypeId: 'key_test',
      quantity: 1,
      transactionId: 'txn_award2',
      now: DAY_TWO,
    });

    expect(result.key.quantityFound).toBe(4);
    expect(result.key.quantitySpent).toBe(2);
    expect(result.key.quantityAvailable).toBe(2);
  });

  it('survives a refresh: getPlayerKeys reads back exactly what was awarded', async () => {
    const gateway = gatewayFor(GOOD_WORKBOOK);
    const mutex = new KeyMutex();
    await awardKey(gateway, mutex, {
      userId: 'test_user_7',
      keyTypeId: 'key_test',
      quantity: 1,
      transactionId: 'txn_7',
      now: DAY_ONE,
    });

    const keys = await getPlayerKeys(gateway, 'test_user_7');
    expect(keys).toHaveLength(1);
    expect(keys[0]!.keyTypeId).toBe('key_test');
    expect(keys[0]!.quantityFound).toBe(1);
  });

  it('never mutates a pre-existing real-shaped fixture row for a different user (isolation)', async () => {
    const gateway = gatewayFor(GOOD_WORKBOOK);
    const before = await gateway.findByPrimaryKey('25_PLAYER_KEYS', 'veoulla|key_shell', {
      bypass: true,
    });

    const mutex = new KeyMutex();
    await awardKey(gateway, mutex, {
      userId: 'test_user_8',
      keyTypeId: 'key_shell',
      quantity: 1,
      transactionId: 'txn_8',
      now: DAY_ONE,
    });

    const after = await gateway.findByPrimaryKey('25_PLAYER_KEYS', 'veoulla|key_shell', {
      bypass: true,
    });
    expect(after!.row.raw).toEqual(before!.row.raw);
  });
});

describe('spendKey', () => {
  it('rejects spending from a key type that has never been found', async () => {
    const gateway = gatewayFor(GOOD_WORKBOOK);
    const mutex = new KeyMutex();
    const result = await spendKey(gateway, mutex, {
      userId: 'test_user_9',
      keyTypeId: 'key_never_found',
      quantity: 1,
      transactionId: 'txn_9',
      now: DAY_ONE,
    });

    expect(result.applied).toBe(false);
    expect(result.reason).toBe('insufficient_keys');
  });

  it('rejects spending more than is available', async () => {
    const gateway = gatewayFor(GOOD_WORKBOOK);
    const mutex = new KeyMutex();
    await awardKey(gateway, mutex, {
      userId: 'test_user_10',
      keyTypeId: 'key_test',
      quantity: 1,
      transactionId: 'txn_10a',
      now: DAY_ONE,
    });
    const result = await spendKey(gateway, mutex, {
      userId: 'test_user_10',
      keyTypeId: 'key_test',
      quantity: 5,
      transactionId: 'txn_10b',
      now: DAY_ONE,
    });

    expect(result.applied).toBe(false);
    expect(result.reason).toBe('insufficient_keys');
    // Nothing changed.
    expect(result.key!.quantityAvailable).toBe(1);
  });

  it('applies a valid spend and keeps quantities consistent', async () => {
    const gateway = gatewayFor(GOOD_WORKBOOK);
    const mutex = new KeyMutex();
    await awardKey(gateway, mutex, {
      userId: 'test_user_11',
      keyTypeId: 'key_test',
      quantity: 3,
      transactionId: 'txn_11a',
      now: DAY_ONE,
    });
    const result = await spendKey(gateway, mutex, {
      userId: 'test_user_11',
      keyTypeId: 'key_test',
      quantity: 2,
      transactionId: 'txn_11b',
      now: DAY_ONE,
    });

    expect(result.applied).toBe(true);
    expect(result.key!.quantityFound).toBe(3);
    expect(result.key!.quantitySpent).toBe(2);
    expect(result.key!.quantityAvailable).toBe(1);
  });

  it('is idempotent for an immediate retry of the same transaction', async () => {
    const gateway = gatewayFor(GOOD_WORKBOOK);
    const mutex = new KeyMutex();
    await awardKey(gateway, mutex, {
      userId: 'test_user_12',
      keyTypeId: 'key_test',
      quantity: 3,
      transactionId: 'txn_12a',
      now: DAY_ONE,
    });
    await spendKey(gateway, mutex, {
      userId: 'test_user_12',
      keyTypeId: 'key_test',
      quantity: 2,
      transactionId: 'txn_12b',
      now: DAY_ONE,
    });
    const retry = await spendKey(gateway, mutex, {
      userId: 'test_user_12',
      keyTypeId: 'key_test',
      quantity: 2,
      transactionId: 'txn_12b',
      now: DAY_ONE,
    });

    expect(retry.applied).toBe(false);
    expect(retry.reason).toBe('duplicate_transaction');
    expect(retry.key!.quantitySpent).toBe(2);
    expect(retry.key!.quantityAvailable).toBe(1);
  });
});

describe('awardKey / spendKey — concurrency', () => {
  it('serializes two concurrent awards for the same (userId, keyTypeId) so neither is lost', async () => {
    const gateway = gatewayFor(GOOD_WORKBOOK);
    const mutex = new KeyMutex();

    const [a, b] = await Promise.all([
      awardKey(gateway, mutex, {
        userId: 'test_user_13',
        keyTypeId: 'key_test',
        quantity: 1,
        transactionId: 'txn_concurrent_a',
        now: DAY_ONE,
      }),
      awardKey(gateway, mutex, {
        userId: 'test_user_13',
        keyTypeId: 'key_test',
        quantity: 1,
        transactionId: 'txn_concurrent_b',
        now: DAY_ONE,
      }),
    ]);

    // Exactly one of the two applies (the other correctly sees the daily
    // cap already reached by its sibling) — never both, and never neither.
    const appliedCount = [a, b].filter((r) => r.applied).length;
    expect(appliedCount).toBe(1);

    const keys = await getPlayerKeys(gateway, 'test_user_13');
    expect(keys[0]!.quantityFound).toBe(1);
  });
});
