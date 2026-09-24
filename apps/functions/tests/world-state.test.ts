import { describe, expect, it } from 'vitest';
import { mutateWorldDoc, parseDoc, readWorldDoc, storedVersion } from '../src/world/state.js';
import { WORLD_USER, worldCtx, worldGateway } from './helpers/world-fixture.js';

const key = `${WORLD_USER}|world_church`;
const rawOf = async (g: ReturnType<typeof worldGateway>) =>
  (await g.findByPrimaryKey('37_CHARACTER_STATE', key, { bypass: true }))?.row.raw.story_flags_json;
const seed = (g: ReturnType<typeof worldGateway>, json: string) =>
  g.appendRow('37_CHARACTER_STATE', {
    user_character_key: key,
    user_id: WORLD_USER,
    character_id: 'world_church',
    story_flags_json: json,
  });

describe('world state documents', () => {
  it('writes a versioned document and reads it back typed', async () => {
    const g = worldGateway();
    await mutateWorldDoc(worldCtx(g), 'church', (d) => {
      d.candlesLitEver = 2;
    });
    expect(storedVersion(await rawOf(g))).toBe(1);
    expect((await readWorldDoc(g, WORLD_USER, 'church', { bypass: true })).candlesLitEver).toBe(2);
  });

  it('replaces a malformed field with its default instead of crashing', () => {
    const doc = parseDoc(
      'church',
      JSON.stringify({ candles: 'oops', openedStories: {}, candlesLitEver: 3 }),
    );
    expect(doc.candles).toEqual({});
    expect(doc.openedStories).toEqual([]);
    expect(doc.candlesLitEver).toBe(3);
  });

  it('preserves unrelated fields (other features, later versions) across a save', async () => {
    const g = worldGateway();
    await seed(g, JSON.stringify({ v: 1, candlesLitEver: 1, futureFeature: { keep: 'me' } }));
    await mutateWorldDoc(worldCtx(g), 'church', (d) => {
      d.candlesLitEver += 1;
    });
    expect(JSON.parse((await rawOf(g)) ?? '{}')).toMatchObject({
      v: 1,
      candlesLitEver: 2,
      futureFeature: { keep: 'me' },
    });
  });

  it('upgrades an unversioned document on its next save, keeping all state', async () => {
    const g = worldGateway();
    await seed(g, JSON.stringify({ candlesLitEver: 4, visited: true }));
    await mutateWorldDoc(worldCtx(g), 'church', () => undefined);
    expect(storedVersion(await rawOf(g))).toBe(1);
    expect(JSON.parse((await rawOf(g)) ?? '{}')).toMatchObject({
      candlesLitEver: 4,
      visited: true,
    });
  });

  it('refuses to overwrite unreadable or newer-version state', async () => {
    const corrupt = worldGateway();
    await seed(corrupt, '{not json');
    await expect(
      mutateWorldDoc(worldCtx(corrupt), 'church', (d) => {
        d.visited = true;
      }),
    ).rejects.toMatchObject({ code: 'WORLD_INVALID_STATE' });
    expect(await rawOf(corrupt)).toBe('{not json');

    const newer = worldGateway();
    await seed(newer, JSON.stringify({ v: 9, visited: true }));
    await expect(
      mutateWorldDoc(worldCtx(newer), 'church', (d) => {
        d.candlesLitEver = 1;
      }),
    ).rejects.toMatchObject({ code: 'WORLD_INVALID_STATE' });
  });

  it('keeps each system document independent of the others', async () => {
    const g = worldGateway();
    const ctx = worldCtx(g);
    await mutateWorldDoc(ctx, 'church', (d) => {
      d.candlesLitEver = 5;
    });
    await mutateWorldDoc(ctx, 'farm', (d) => {
      d.harvests = 2;
    });
    expect((await readWorldDoc(g, WORLD_USER, 'church', { bypass: true })).candlesLitEver).toBe(5);
    expect((await readWorldDoc(g, WORLD_USER, 'farm', { bypass: true })).harvests).toBe(2);
  });

  it('serializes concurrent writers to one document without losing an update', async () => {
    const g = worldGateway();
    const ctx = worldCtx(g);
    await Promise.all(
      Array.from({ length: 8 }, () =>
        mutateWorldDoc(ctx, 'church', (d) => {
          d.candlesLitEver += 1;
        }),
      ),
    );
    expect((await readWorldDoc(g, WORLD_USER, 'church', { bypass: true })).candlesLitEver).toBe(8);
  });
});
