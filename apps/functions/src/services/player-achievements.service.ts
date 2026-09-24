import { isPlaceholder, type NormalizedRow } from '@veoullas-world/sheet-schema';
import type { PlayerAchievementView } from '@veoullas-world/contracts';
import type { SheetGateway } from '../repositories/sheet-gateway.js';
import { buildMediaRef } from './media-ref.js';

export interface PlayerAchievementSummary {
  userId: string;
  achievementId: string;
  status: string;
  progressValue: number;
  unlockedAt: string;
  claimed: boolean;
  rewardClaimedAt: string;
}

/** `|` matches the real live Sheet's existing convention (e.g. `veoulla|ach_first_step`) — never `:`. */
function achievementRowKey(userId: string, achievementId: string): string {
  return `${userId}|${achievementId}`;
}

function toSummary(raw: Record<string, string>): PlayerAchievementSummary {
  return {
    userId: raw.user_id ?? '',
    achievementId: raw.achievement_id ?? '',
    status: raw.status ?? '',
    progressValue: Number(raw.progress_value ?? '0') || 0,
    unlockedAt: raw.unlocked_at ?? '',
    claimed: raw.claimed === 'TRUE',
    rewardClaimedAt: raw.reward_claimed_at ?? '',
  };
}

/** All `26_PLAYER_ACHIEV` rows for one user. Never reads another user's rows. */
export async function getPlayerAchievements(
  gateway: SheetGateway,
  userId: string,
): Promise<PlayerAchievementSummary[]> {
  const result = await gateway.readTab('26_PLAYER_ACHIEV');
  return result.rows.filter((r) => r.raw.user_id === userId).map((r) => toSummary(r.raw));
}

export type ClaimAchievementReason = 'unlocked_and_claimed' | 'already_claimed';

export interface ClaimAchievementResult {
  applied: boolean;
  reason: ClaimAchievementReason;
  achievement: PlayerAchievementSummary;
}

/**
 * Claims one achievement's reward. Idempotency here needs no transaction-ID
 * tracking at all — `claimed` is a true one-time boolean flag by
 * definition (Master Build Plan: "a one-time reward"), so "already true"
 * is unconditionally the complete, correct idempotency check on its own:
 * a retry (from any transaction ID, any time later) is always a safe
 * no-op, exactly the guarantee CLAUDE.md rule 12 requires.
 */
export async function claimAchievement(
  gateway: SheetGateway,
  userId: string,
  achievementId: string,
  now: Date,
): Promise<ClaimAchievementResult> {
  const key = achievementRowKey(userId, achievementId);
  const existing = await gateway.findByPrimaryKey('26_PLAYER_ACHIEV', key, { bypass: true });

  if (!existing) {
    const patch: Record<string, string> = {
      user_id: userId,
      achievement_id: achievementId,
      status: 'unlocked',
      progress_value: '0',
      unlocked_at: now.toISOString(),
      claimed: 'TRUE',
      reward_claimed_at: now.toISOString(),
      updated_at: now.toISOString(),
    };
    await gateway.appendRow('26_PLAYER_ACHIEV', { user_achievement_key: key, ...patch });
    return { applied: true, reason: 'unlocked_and_claimed', achievement: toSummary(patch) };
  }

  const raw = existing.row.raw;
  if (existing.row.values.claimed === true) {
    return { applied: false, reason: 'already_claimed', achievement: toSummary(raw) };
  }

  const patch: Record<string, string> = {
    status: 'unlocked',
    claimed: 'TRUE',
    unlocked_at: raw.unlocked_at || now.toISOString(),
    reward_claimed_at: now.toISOString(),
    updated_at: now.toISOString(),
  };
  await gateway.updateByPrimaryKey('26_PLAYER_ACHIEV', key, patch);
  return {
    applied: true,
    reason: 'unlocked_and_claimed',
    achievement: toSummary({ ...raw, ...patch }),
  };
}

function usableText(value: string | undefined): value is string {
  if (value === undefined) return false;
  const trimmed = value.trim();
  return trimmed !== '' && !isPlaceholder(trimmed);
}

/** Sheet-first label with an English fallback, matching every other world text lookup. */
function textFor(rows: NormalizedRow[], textId: string | undefined, locale: string): string {
  if (!usableText(textId)) return '';
  const candidates = rows.filter(
    (r) => r.values.enabled !== false && r.raw.text_id === textId && usableText(r.raw.text),
  );
  return (
    candidates.find((r) => r.raw.locale === locale)?.raw.text ??
    candidates.find((r) => r.raw.locale === 'en')?.raw.text ??
    ''
  );
}

/**
 * The player-facing achievements list: every enabled `23_ACHIEVEMENTS` catalog row, joined with this
 * user's `26_PLAYER_ACHIEV` progress and localized via `08_UI_TEXT`. A still-locked secret achievement
 * never carries its title, description, icon, or points — only that it exists and is locked — so the
 * browser cannot reveal what it is before the player earns it (matches `WorldAchievementView`'s same
 * rule for the in-the-moment unlock event).
 */
export async function getPlayerAchievementViews(
  gateway: SheetGateway,
  userId: string,
  locale: string,
): Promise<PlayerAchievementView[]> {
  const [catalog, mine, uiText, icons, assets] = await Promise.all([
    gateway.readEnabledRows('23_ACHIEVEMENTS'),
    getPlayerAchievements(gateway, userId),
    gateway.readTab('08_UI_TEXT'),
    gateway.readTab('09_ICONS'),
    gateway.readTab('10_ASSETS'),
  ]);
  const progressByAchievement = new Map(mine.map((a) => [a.achievementId, a] as const));

  const iconRefFor = (iconId: string | undefined): string | null => {
    if (!usableText(iconId)) return null;
    const icon = icons.rows.find((r) => r.primaryKeyValue === iconId && r.values.enabled === true);
    const assetId = icon?.raw.asset_id;
    if (!usableText(assetId)) return null;
    const asset = assets.rows.find(
      (r) => r.primaryKeyValue === assetId && r.values.enabled === true,
    );
    const drive = (asset?.raw.drive_file_id ?? '').trim();
    if (!asset || !drive || isPlaceholder(drive)) return null;
    return buildMediaRef(assetId, Number(asset.raw.version) || 1);
  };

  return catalog.map((row) => {
    const achievementId = row.primaryKeyValue ?? '';
    const progress = progressByAchievement.get(achievementId);
    const status: PlayerAchievementView['status'] =
      progress?.status === 'unlocked' ? 'unlocked' : 'locked';
    const secret = row.values.secret === true;
    // A locked secret achievement reveals nothing but its existence and lock state.
    const hidden = secret && status === 'locked';
    return {
      achievementId,
      category: row.raw.category ?? '',
      status,
      secret,
      points: hidden ? 0 : Number(row.raw.points ?? '0') || 0,
      progressValue: progress?.progressValue ?? 0,
      unlockedAt: progress?.unlockedAt ?? '',
      iconRef: hidden ? null : iconRefFor(row.raw.icon_id),
      title: hidden ? '' : textFor(uiText.rows, row.raw.title_text_id, locale),
      description: hidden ? '' : textFor(uiText.rows, row.raw.description_text_id, locale),
    };
  });
}
