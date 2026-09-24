import { useEffect, useRef, useState } from 'react';
import type {
  RuntimeAssetStatus,
  RuntimeIconEntry,
  RuntimeUiTextEntry,
} from '@veoullas-world/contracts';
import { fetchContentRuntime } from '../../services/contentRuntimeClient';
import { mobileMediaRef } from '../../services/mediaVariant';
import { fetchPlayerState, postCheckpoint } from '../../services/playerClient';
import { useLocaleStore } from '../../i18n/localeStore';
import { playerText } from '../../i18n/playerText';
import { SceneStage } from './SceneStage';
import type { LocationAudioPolicy, WorldRuntimeExtensions } from './runtimeExtensions';
import { BEACH_TO_CHURCH_JOURNEY } from './sceneDefinitions';
import type { JourneyDefinition, SceneNode } from './types';
import { useBoundedPan } from './useBoundedPan';
import styles from './SceneJourney.module.css';

/** Pan units per tap of an on-screen look control; keyboard steps are 4. */
const LOOK_STEP = 6;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export interface SceneJourneyProps {
  journey?: JourneyDefinition;
  /** Delay between each hop of a guided multi-node travel — overridable in tests. */
  stepDelayMs?: number;
  /** Explicit development-only diagnostics; never enabled by default in the player. */
  forceDebugOverlay?: boolean;
  extensions?: WorldRuntimeExtensions;
  /** Hides individual markers (e.g. the road onward until the next place is open). */
  markerFilter?: (markerId: string) => boolean;
  onMarkerActivate?: (
    markerId: string,
    locationId: string,
    nodeId: string,
  ) => Promise<string | void> | string | void;
  /** Begin at this node (for example Back from the crossroads) instead of the saved checkpoint. */
  startNodeId?: string;
  onLocationChange?: (locationId: string) => void;
  /** Safe owner identity from the resolved session; scopes cache and pending writes without ever entering an API body. */
  userId?: string;
}

/** Full-viewport presentation of the existing authored route and checkpoint API.
 * Flat illustrations use a single crop-aware plane; no synthetic parallax layers.
 */
export function SceneJourney({
  journey = BEACH_TO_CHURCH_JOURNEY,
  stepDelayMs = 350,
  forceDebugOverlay,
  extensions,
  markerFilter,
  onMarkerActivate,
  startNodeId,
  onLocationChange,
  userId,
}: SceneJourneyProps) {
  const [nodeIndex, setNodeIndex] = useState<number | null>(null);
  const [previousNodeId, setPreviousNodeId] = useState<string | null>(null);
  const [isTraveling, setIsTraveling] = useState(false);
  const [lastActivatedMarker, setLastActivatedMarker] = useState<string | null>(null);
  const [activeAudioPolicy, setActiveAudioPolicy] = useState<LocationAudioPolicy | null>(null);
  const [assets, setAssets] = useState<RuntimeAssetStatus[]>([]);
  const travelToken = useRef(0);
  const checkpointChain = useRef<Promise<void>>(Promise.resolve());
  const busy = useRef(false);
  const locale = useLocaleStore((s) => s.locale);
  const [uiText, setUiText] = useState<RuntimeUiTextEntry[]>([]);
  const [icons, setIcons] = useState<RuntimeIconEntry[]>([]);
  useEffect(
    () => () => {
      travelToken.current++;
    },
    [],
  );

  // Never blocks or fails the journey when offline/unregistered — a node's
  // `backgroundAssetId` simply has no match yet, and SceneStage keeps
  // rendering its CSS placeholder exactly as it already does (see
  // docs/assets/PHASE_1_ASSET_HANDOFF.md).
  useEffect(() => {
    let cancelled = false;
    fetchContentRuntime().then((result) => {
      if (!cancelled && result.status === 'online') {
        setAssets(result.data.assets);
        setUiText(result.data.uiText);
        setIcons(result.data.icons);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  function resolveBackground(target: SceneNode | null): RuntimeAssetStatus | null {
    if (!target?.backgroundAssetId) return null;
    return assets.find((a) => a.assetId === target.backgroundAssetId) ?? null;
  }

  // SceneJourney only ever mounts after naming is already complete
  // (FirstOpeningFlow renders it in the "beach" phase, reached only past
  // the naming beat) — so the companion always uses the collared poses,
  // never the pre-naming no-collar one. Seated when still, walking only
  // while travelling. See docs/assets/PHASE_1_ASSET_HANDOFF.md §7.
  const companionAsset = assets.find((a) => a.assetId === 'var_idle_collar') ?? null;
  const walkingAsset = assets.find((a) => a.assetId === 'var_walk_collar') ?? null;

  useEffect(() => {
    let cancelled = false;
    const requested = startNodeId ? journey.nodes.findIndex((n) => n.id === startNodeId) : -1;
    if (requested >= 0) {
      setNodeIndex(requested);
      return;
    }
    fetchPlayerState(userId).then((result) => {
      if (cancelled) return;
      if (result.status === 'online' || result.status === 'cached') {
        const progress = result.data.progress.find((p) => p.routeId === journey.id);
        const resumedIndex = progress
          ? journey.nodes.findIndex((n) => n.id === progress.currentBeatId)
          : -1;
        if (resumedIndex >= 0) {
          setNodeIndex(resumedIndex);
          return;
        }
      }
      // Offline, no prior progress, or an unrecognized beat id (e.g. the
      // journey definition changed) — start safely at the first node
      // rather than blocking or crashing.
      setNodeIndex(0);
    });
    return () => {
      cancelled = true;
    };
  }, [journey.id, journey.nodes, userId, startNodeId]);

  const currentNode = nodeIndex !== null ? journey.nodes[nodeIndex] : null;
  useEffect(() => {
    if (currentNode) onLocationChange?.(currentNode.locationId);
  }, [currentNode, onLocationChange]);
  const pan = useBoundedPan(currentNode?.panBounds ?? { min: 0, max: 0 }, currentNode?.id ?? '');

  useEffect(() => {
    if (!currentNode || !extensions) {
      setActiveAudioPolicy(null);
      return;
    }
    const context = { locationId: currentNode.locationId, sceneId: currentNode.id };
    const extension = extensions.location(currentNode.locationId);
    setActiveAudioPolicy(extension?.resolveAudioPolicy?.(context) ?? null);
    extension?.onLocationEnter?.(context);
  }, [currentNode, extensions]);

  async function goToNode(targetIndex: number): Promise<void> {
    const target = journey.nodes[targetIndex];
    if (!target) return;
    const asset = resolveBackground(target);
    if (asset) {
      // Hold the current painting until the destination image is decoded.
      await new Promise<void>((resolve) => {
        const image = new Image();
        const timeout = window.setTimeout(resolve, 8000);
        const finish = () => {
          window.clearTimeout(timeout);
          resolve();
        };
        image.onload = finish;
        image.onerror = finish;
        image.src = window.matchMedia('(max-aspect-ratio: 1/1)').matches
          ? (mobileMediaRef(asset) ?? asset.mediaRef)
          : asset.mediaRef;
      });
    }
    setPreviousNodeId(currentNode?.id ?? null);
    setNodeIndex(targetIndex);
    // Saving the position never holds the player still: hops are sent in order in the background,
    // and a failed one is queued on the device and replayed (postCheckpoint).
    checkpointChain.current = checkpointChain.current.then(() =>
      postCheckpoint({ routeId: journey.id, beatId: target.id, checkpoint: true }, userId).then(
        () => undefined,
      ),
    );
    await sleep(window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 450);
    setPreviousNodeId(null);
  }

  async function travelTo(targetIndex: number): Promise<void> {
    if (busy.current || nodeIndex === null || targetIndex === nodeIndex) return;
    busy.current = true;
    const myToken = ++travelToken.current;
    setIsTraveling(true);
    const step = targetIndex > nodeIndex ? 1 : -1;
    let idx = nodeIndex;
    while (idx !== targetIndex) {
      // A newer travel request (or unmount) supersedes this one — stop
      // advancing rather than racing two guided journeys against each
      // other. Each hop already checkpointed before this check runs, so
      // stopping here never loses progress already made.
      if (travelToken.current !== myToken) return;
      idx += step;
      await goToNode(idx);
      await sleep(window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : stepDelayMs);
    }
    if (travelToken.current === myToken) {
      busy.current = false;
      setIsTraveling(false);
    }
  }

  async function activateMarker(markerId: string): Promise<void> {
    const marker = currentNode?.markers.find((candidate) => candidate.id === markerId);
    if (busy.current || !marker || !currentNode) return;
    if (marker.destinationNodeId) {
      const destinationIndex = journey.nodes.findIndex(
        (node) => node.id === marker.destinationNodeId,
      );
      if (destinationIndex >= 0) {
        await travelTo(destinationIndex);
        return;
      }
    }
    const result = await onMarkerActivate?.(markerId, currentNode.locationId, currentNode.id);
    setLastActivatedMarker(result || markerId);
  }

  if (nodeIndex === null || !currentNode) {
    return (
      <div className={styles.journey} data-testid="scene-journey-loading">
        {playerText('loading', locale, uiText)}
      </div>
    );
  }

  const previousNode = previousNodeId ? journey.nodes.find((n) => n.id === previousNodeId) : null;
  const showDebug = import.meta.env.DEV && forceDebugOverlay === true;

  return (
    <div
      className={styles.journey}
      data-testid="scene-journey"
      tabIndex={0}
      onKeyDown={pan.onKeyDown}
      onPointerDown={pan.onPointerDown}
      onPointerMove={pan.onPointerMove}
      onPointerUp={pan.onPointerUp}
      onPointerLeave={pan.onPointerUp}
      data-background-music={activeAudioPolicy?.backgroundMusic}
      data-song-start={activeAudioPolicy?.songStart}
      data-game-music={activeAudioPolicy?.gameMusic}
      data-walkman-gain={activeAudioPolicy?.walkmanGain}
    >
      <div className={styles.viewport}>
        {previousNode && (
          <SceneStage
            node={previousNode}
            pan={0}
            fadeOut
            backgroundAsset={resolveBackground(previousNode)}
          />
        )}
        <SceneStage
          key={currentNode.id}
          node={
            markerFilter
              ? { ...currentNode, markers: currentNode.markers.filter((m) => markerFilter(m.id)) }
              : currentNode
          }
          pan={pan.pan}
          onMarkerActivate={(markerId) => void activateMarker(markerId)}
          backgroundAsset={resolveBackground(currentNode)}
          companionAsset={companionAsset}
          walkingAsset={walkingAsset}
          moving={isTraveling}
          look={
            currentNode.panBounds.max > currentNode.panBounds.min
              ? {
                  onLeft: () => pan.nudge(-LOOK_STEP),
                  onRight: () => pan.nudge(LOOK_STEP),
                  atMin: pan.atMin,
                  atMax: pan.atMax,
                }
              : undefined
          }
          icons={icons}
          disabled={isTraveling}
          uiText={uiText}
          onForward={
            nodeIndex < journey.nodes.length - 1 ? () => void travelTo(nodeIndex + 1) : undefined
          }
          onBack={nodeIndex > 0 ? () => void travelTo(nodeIndex - 1) : undefined}
        />
        {extensions
          ?.activeOverlays({
            locationId: currentNode.locationId,
            sceneId: currentNode.id,
            nodeIndex,
          })
          .map((overlay) => (
            <div key={overlay.id} data-testid={`event-overlay-${overlay.id}`}>
              {overlay.render({
                locationId: currentNode.locationId,
                sceneId: currentNode.id,
                nodeIndex,
              })}
            </div>
          ))}
      </div>

      {showDebug && (
        <dl className={styles.debugOverlay} data-testid="scene-debug-overlay">
          <dt>Interaction</dt>
          <dd>{lastActivatedMarker}</dd>
          <dt>Node</dt>
          <dd data-testid="debug-node-id">{currentNode.id}</dd>
          <dt>Pan</dt>
          <dd data-testid="debug-pan">{pan.pan.toFixed(1)}</dd>
          <dt>Bounds</dt>
          <dd>
            [{currentNode.panBounds.min}, {currentNode.panBounds.max}]
          </dd>
          <dt>Traveling</dt>
          <dd>{String(isTraveling)}</dd>
        </dl>
      )}
    </div>
  );
}
