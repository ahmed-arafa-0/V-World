import type { Request, Response } from 'express';
import type { ApiError } from '@veoullas-world/contracts';
import { AppError, toSafeApiError } from '../errors/app-error.js';
import { PUBLIC_ICON_ASSETS, PUBLIC_MEDIA_ASSET_IDS } from './public-media.js';
import { computeContentRuntime } from '../services/content-runtime.service.js';
import { buildPublicMediaRef } from '../services/media-ref.js';
import type { SheetGateway } from '../repositories/sheet-gateway.js';

function sendError(res: Response, err: unknown): void {
  const { code, message, httpStatus } = toSafeApiError(err);
  const error: ApiError = { ok: false, code, message };
  res.status(httpStatus).json(error);
}

/**
 * The only dialogue group this deliberately PUBLIC (no owner session
 * required) endpoint will ever return — the Living Bible §18J beats 01–04
 * (opening line, unseen VAR, reveal) happen before Veoulla has entered the
 * Gate code at all, so no owner session can exist yet to gate this behind.
 * See docs/content/PHASE_1_VOICEOVER_CUES.md §1a for why `dlg_gate_01` is
 * the real live dialogue group used here.
 */
const PRE_GATE_DIALOGUE_IDS = new Set(['dlg_gate_01']);

/**
 * `GET /api/content/pre-gate` — intentionally public. Reuses the same
 * validated `computeContentRuntime()` the owner-session-gated
 * `/api/content/runtime` uses, then narrows the result to only the
 * pre-Gate dialogue group, the language list needed to resolve its
 * direction, the one `action_continue` UI-text group (the localized
 * "Continue" control the text-progression model uses — Ahmed's 2026-09-17
 * decision replaced audio-paced narration with an explicit Continue
 * action), and — since Ahmed's 2026-09-18 explicit authorization — the
 * small fixed `assets` allowlist (`PUBLIC_MEDIA_ASSET_IDS`, shared with
 * `api/public-media.ts` so the two can never drift apart) rebuilt to point
 * at the public `/api/public-media/:assetId` route rather than the
 * owner-session-protected `/api/media/:assetId` one. `icons` carries only the
 * pre-Gate settings icon (`PUBLIC_ICON_ASSETS`); the full icon table, the full
 * asset list, and diagnostics stay absent.
 *
 * Voice-over is no longer part of this response at all (narration is
 * text-only), which also closes the earlier "pre-Gate audio unreachable
 * pre-authentication" gap by removing the need for pre-Gate audio
 * altogether rather than opening a new unauthenticated media path.
 */
export function createPreGateContentHandler(getGateway: () => SheetGateway | null) {
  return async (_req: Request, res: Response): Promise<void> => {
    const gateway = getGateway();
    if (!gateway) {
      sendError(
        res,
        new AppError('backend_not_configured', 'Google Sheets backend is not configured.'),
      );
      return;
    }
    try {
      const [full, appConfig] = await Promise.all([
        computeContentRuntime(gateway),
        gateway.readTab('01_APP_CONFIG'),
      ]);
      const appName =
        appConfig.rows.find(
          (row) => row.primaryKeyValue === 'app_name' && row.values.enabled === true,
        )?.raw.value ?? '';
      const dialogue = full.dialogue.filter((d) => PRE_GATE_DIALOGUE_IDS.has(d.dialogueId));
      const uiText = full.uiText.filter((u) => u.textId === 'action_continue');
      const assets = full.assets
        .filter((a) => PUBLIC_MEDIA_ASSET_IDS.has(a.assetId))
        .map((a) => ({ ...a, mediaRef: buildPublicMediaRef(a.assetId, a.version) }));
      // Only allowlisted control icons, and only while the Sheet row still points at
      // the exact allowlisted asset; the ref is rebuilt to the public route.
      const icons = full.icons.flatMap((icon) => {
        const assetId = PUBLIC_ICON_ASSETS.get(icon.iconId);
        const asset = assetId ? full.assets.find((a) => a.assetId === assetId) : undefined;
        if (!assetId || !asset || !icon.mediaRef?.startsWith(`/api/media/${assetId}?`)) return [];
        return [{ ...icon, mediaRef: buildPublicMediaRef(assetId, asset.version) }];
      });
      res.status(200).json({
        ok: true,
        appName,
        languages: full.languages,
        dialogue,
        uiText,
        assets,
        icons,
      });
    } catch (err) {
      sendError(res, err);
    }
  };
}
