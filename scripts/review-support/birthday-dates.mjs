import assert from 'node:assert/strict';

export const TIME_ZONE = 'Africa/Cairo';
const formatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
});
export function cairoLocal(instant) {
  const p = Object.fromEntries(
    formatter.formatToParts(new Date(instant)).map((x) => [x.type, x.value]),
  );
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}`;
}
/** Resolve a local wall time through the runtime's IANA zone rules, then require a round trip. */
export function cairoToUtc(local) {
  const wall = Date.parse(`${local}Z`);
  let instant = wall;
  for (let n = 0; n < 4; n++) instant += wall - Date.parse(`${cairoLocal(instant)}Z`);
  assert.equal(cairoLocal(instant), local, 'Cairo local time must round trip');
  return new Date(instant).toISOString();
}
export const TARGET_AT = cairoToUtc('2026-09-26T00:00:00');
export const END_AT = cairoToUtc('2026-09-28T00:00:00');
assert.equal(TARGET_AT, '2026-09-25T21:00:00.000Z');
assert.equal(END_AT, '2026-09-27T21:00:00.000Z');
