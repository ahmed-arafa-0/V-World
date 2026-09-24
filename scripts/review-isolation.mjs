/** Local review only. Normal Gate verification, isolated identity and fail-closed writes. */
export const REVIEW_STATE_TABS = new Set([
  '24_PLAYER_PROGRESS',
  '25_PLAYER_KEYS',
  '26_PLAYER_ACHIEV',
  '27_PLAYER_MESSAGES',
  '29_PLAYER_FARM',
  '33_PLAYER_SCORES',
  '35_PLAYER_EXHIBITS',
  '37_CHARACTER_STATE',
  '40_VAR_CONVERSATIONS',
  '41_VAR_MEMORIES',
]);
export function createReviewGateway(gateway, userId, { adminUserId, birthdayOnly = false } = {}) {
  if (process.env.NODE_ENV === 'production' || process.env.K_SERVICE || process.env.FUNCTION_TARGET)
    throw Error('Local review only.');
  if (!/^manual_review_(?:\d+|bday_[a-z0-9_]+)$/.test(userId))
    throw Error('Expected an isolated review identity.');
  if (adminUserId && !/^admin_bday_review_[a-z0-9_]+$/.test(adminUserId))
    throw Error('Expected a synthetic review admin.');
  const owns = (tab, row) =>
    row.user_id === userId || (tab === '06_SESSIONS' && adminUserId && row.user_id === adminUserId);
  const canWrite = (tab, row) => {
    if (
      tab === '05_ENTRY_LOGS' &&
      (!row.user_id || row.user_id === userId || (adminUserId && row.user_id === adminUserId))
    )
      return;
    if ((REVIEW_STATE_TABS.has(tab) || tab === '06_SESSIONS') && owns(tab, row)) return;
    throw Error('Review isolation: write outside the selected test player refused.');
  };
  const scoped = new Proxy(gateway, {
    get(target, prop) {
      if (prop === 'readTab')
        return async (tab, options) => {
          const result = await target.readTab(tab, options);
          if (tab === '19_MESSAGES') {
            const users = await target.readTab('02_USERS');
            const ownerId = users.rows.find(
              (r) => r.raw.role === 'owner' && r.values.active === true,
            )?.primaryKeyValue;
            return {
              ...result,
              rows: result.rows.map((r) =>
                ownerId &&
                r.raw.recipient_user_id === ownerId &&
                (!birthdayOnly || r.raw.message_id === 'msg_birthday_2026')
                  ? {
                      ...r,
                      raw: { ...r.raw, recipient_user_id: userId },
                      values: { ...r.values, recipient_user_id: userId },
                    }
                  : r,
              ),
            };
          }
          if (REVIEW_STATE_TABS.has(tab) || tab === '06_SESSIONS')
            return { ...result, rows: result.rows.filter((r) => owns(tab, r.raw)) };
          if (tab !== '02_USERS') return result;
          // A local view of the owner credential, not a Sheet edit. The existing authentication
          // service still validates the real active code and rate limits failures. It only receives
          // this test identity as the session owner. Admin accounts are deliberately absent.
          return {
            ...result,
            rows: result.rows
              .filter((r) => r.raw.role === 'owner')
              .map((r) => ({
                ...r,
                primaryKeyValue: userId,
                raw: { ...r.raw, user_id: userId },
                values: { ...r.values, user_id: userId },
              })),
          };
        };
      if (prop === 'findFresh')
        return async (tab, key) => {
          const result = await target.findFresh(tab, key);
          if (result.found && (REVIEW_STATE_TABS.has(tab) || tab === '06_SESSIONS'))
            canWrite(tab, result.found.row.raw);
          return result;
        };
      if (prop === 'findByPrimaryKey')
        return async (tab, key, options) => {
          const found = await target[prop](tab, key, options);
          if (
            found &&
            (REVIEW_STATE_TABS.has(tab) || tab === '06_SESSIONS') &&
            !owns(tab, found.row.raw)
          )
            return null;
          return found;
        };
      if (prop === 'appendRow')
        return async (tab, row, knownAbsentRaw) => {
          canWrite(tab, row);
          return target.appendRow(tab, row, knownAbsentRaw);
        };
      if (prop === 'appendIfAbsent')
        return async (tab, key, make) => {
          const row = make();
          canWrite(tab, row);
          const existing = await target.findByPrimaryKey(tab, key);
          if (existing) canWrite(tab, existing.row.raw);
          return target.appendIfAbsent(tab, key, () => row);
        };
      if (prop === 'appendRowsIfAbsent')
        return async (tab, rows) => {
          for (const row of rows) canWrite(tab, row);
          return target.appendRowsIfAbsent(tab, rows);
        };
      if (prop === 'updateByPrimaryKey')
        return async (tab, key, patch, known) => {
          const existing = known ?? (await target.findByPrimaryKey(tab, key, { bypass: true }));
          if (!existing) throw Error('Review isolation: missing update target.');
          if (existing.row.primaryKeyValue !== key)
            throw Error('Review isolation: update key mismatch.');
          canWrite(tab, { ...existing.row.raw, ...patch });
          canWrite(tab, existing.row.raw);
          return target.updateByPrimaryKey(tab, key, patch, existing);
        };
      const value = Reflect.get(target, prop, target);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
  return scoped;
}
