#!/usr/bin/env node
import assert from 'node:assert/strict';
import { getProductionGatewayOrNull } from '../apps/functions/lib/repositories/gateway-context.js';
import { KeyMutex } from '../apps/functions/lib/repositories/key-mutex.js';
import { getBirthdayState } from '../apps/functions/lib/world/birthday.js';
import { getCottageState } from '../apps/functions/lib/world/cottage.js';
import { TARGET_AT, END_AT, cairoLocal } from './review-support/birthday-dates.mjs';
const gateway = getProductionGatewayOrNull();
const ctx = { gateway, mutex: new KeyMutex(), userId: 'verify_window_readonly', now: new Date() };
const target = Date.parse(TARGET_AT),
  end = Date.parse(END_AT);
for (const [time, window] of [
  [target - 20001, 'before'],
  [target - 20000, 'countdown'],
  [target - 1, 'countdown'],
  [target, 'live'],
  [end - 1, 'live'],
  [end, 'after'],
]) {
  const state = await getBirthdayState({ ...ctx, now: new Date(time) }, 'en');
  assert.equal(state.window, window);
  assert.equal(state.targetAt, TARGET_AT);
  assert.equal(state.endAt, END_AT);
  console.log(`PASS ${new Date(time).toISOString()} → ${window}`);
}
const cottage = await getCottageState(ctx, 'en');
assert.equal(cottage.countdown.targetAt, TARGET_AT);
console.log(
  `PASS ordinary Cottage same target, real clock. Cairo: ${cairoLocal(TARGET_AT)} → ${cairoLocal(END_AT)}`,
);
