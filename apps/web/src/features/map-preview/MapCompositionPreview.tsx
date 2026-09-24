import { useCallback } from 'react';
import { LoadingState } from '../../components/LoadingState';
import {
  fetchDevMapPreviewAssets,
  isDevMapPreviewUnavailable,
} from '../../services/devMapPreviewClient';
import { useApiResource } from '../../services/useApiResource';
import styles from './MapCompositionPreview.module.css';

const ISLAND_ASSET_ID = 'map_island_transparent';
const OCEAN_ASSET_ID = 'map_ocean_loop';

/**
 * Phase 1 item B developer-only preview: composes the existing transparent
 * island image over the looping top-down ocean video, both served through
 * the accepted M03-B1 same-origin media gateway (`asset.mediaRef`, never a
 * raw Drive file ID). This is explicitly NOT the real living Map — the Map
 * stays locked to a new player until M14 (Phase 2), nothing here reads or
 * writes `first_journey_completed`, and no story/progress state is touched.
 *
 * This component is only ever backed by real data in a `local`/`emulator`
 * backend: it calls the dedicated `/api/dev/map-preview-assets` route,
 * which 404s in `staging`/`production` BEFORE checking owner authentication
 * (`development-only-middleware.ts`) — an owner session and this
 * component's own "developer preview" label are not, by themselves, an
 * access boundary; the enforcement lives server-side. In any non-development
 * environment this renders only the "not available" message below, never
 * composed media.
 */
export function MapCompositionPreview() {
  const fetcher = useCallback(() => fetchDevMapPreviewAssets(), []);
  const { state, refetch } = useApiResource(fetcher);

  if (state.status === 'loading') {
    return (
      <div className={styles.lab}>
        <LoadingState label="Loading map composition preview…" />
      </div>
    );
  }

  if (state.status === 'offline') {
    if (isDevMapPreviewUnavailable(state.message)) {
      return (
        <div className={styles.lab} data-testid="map-preview-unavailable" role="note">
          <p>
            The map composition preview is only available when running against a local or emulator
            development backend. It is intentionally disabled here.
          </p>
        </div>
      );
    }
    return (
      <div className={styles.lab} role="alert">
        <p>Could not load map composition preview: {state.message}</p>
        <button type="button" onClick={refetch}>
          Retry
        </button>
      </div>
    );
  }

  const island = state.data.assets.find((a) => a.assetId === ISLAND_ASSET_ID);
  const ocean = state.data.assets.find((a) => a.assetId === OCEAN_ASSET_ID);

  return (
    <div className={styles.lab} data-testid="map-composition-preview">
      <h2>Map Composition Preview</h2>
      <p className={styles.devBanner} role="note">
        DEVELOPER PREVIEW ONLY — not the real Map. The Map stays locked until the first journey
        completes (M14). Nothing on this screen sets story progress.
      </p>

      {(!island || !ocean) && (
        <p className={styles.missingNote} data-testid="map-preview-missing">
          {!island && !ocean
            ? 'Neither map asset is registered in 10_ASSETS yet.'
            : !island
              ? `"${ISLAND_ASSET_ID}" is not registered in 10_ASSETS yet.`
              : `"${OCEAN_ASSET_ID}" is not registered in 10_ASSETS yet.`}{' '}
          Run <code>npm run seed:phase1:map-assets</code> against the real Sheet, then refresh.
        </p>
      )}

      {island && ocean && (
        <div className={styles.stage} data-testid="map-preview-stage">
          <video
            className={styles.oceanLayer}
            src={ocean.mediaRef ?? undefined}
            poster={
              ocean.hasPosterVariant && ocean.mediaRef
                ? `${ocean.mediaRef}&variant=poster`
                : undefined
            }
            autoPlay
            muted
            loop
            playsInline
            data-testid="map-preview-ocean-video"
          />
          <img
            className={styles.islandLayer}
            src={island.mediaRef ?? undefined}
            alt="Island composition preview (developer only)"
            data-testid="map-preview-island-image"
          />
        </div>
      )}

      <ul className={styles.statusList} data-testid="map-preview-asset-status">
        <li>
          {ISLAND_ASSET_ID}: {island ? `registered, v${island.version}` : 'not registered'}
        </li>
        <li>
          {OCEAN_ASSET_ID}: {ocean ? `registered, v${ocean.version}` : 'not registered'}
          {ocean?.hasPosterVariant ? ' (poster available)' : ''}
        </li>
      </ul>
    </div>
  );
}
