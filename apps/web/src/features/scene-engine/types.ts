/**
 * A single painted/parallax layer inside one scene node. `kind` is
 * intentionally limited to CSS-renderable placeholders for Phase 1 (Master
 * Build Plan M05: "prove the world construction technique before producing
 * every building") — no real Beach/Church artwork exists yet (see
 * docs/assets/PHASE_1_ASSET_HANDOFF.md). `videoSrc` exists so the same
 * layer model already supports the real-video layer requirement once a
 * real asset is registered (mirroring `MapCompositionPreview`'s pattern for
 * `map_ocean_loop`); it stays unused (`kind !== 'video'`) for every current
 * placeholder node.
 */
export interface SceneLayer {
  id: string;
  kind: 'color' | 'gradient' | 'video';
  /** How much this layer shifts relative to the camera pan — 0 = fixed (sky), 1 = foreground. */
  parallaxFactor: number;
  css: string;
  videoSrc?: string;
  videoPosterSrc?: string;
  /** True for a layer whose only purpose is hiding the seam between two adjacent nodes (Living Bible §6: "Scene seams are hidden using natural occluders"). */
  isOccluder?: boolean;
}

export interface SceneParticle {
  id: string;
  worldX: number;
  worldY: number;
  /** CSS-safe visual token supplied by the scene package (for example a leaf or dust mote class). */
  className?: string;
}

export interface DiamondMarker {
  id: string;
  /** Percent-of-stage-width position, independent of the current pan (a world-space, not screen-space, coordinate). */
  worldX: number;
  worldY: number;
  labelForTest: string;
  /** Optional authored rail destination. When absent, the marker is an interaction only. */
  destinationNodeId?: string;
  /** Show the marker's localized label beside it, so an important choice is never icon-only. */
  captioned?: boolean;
  /**
   * Anchor to the screen (percent of the viewport) rather than the painted plane, so a
   * control for something the artwork crops away (the road on a portrait phone) is always reachable.
   */
  viewportAnchor?: { desktop: [number, number]; mobile: [number, number] };
}

export interface SceneNode {
  id: string;
  locationId: string;
  displayName: string;
  /** Bounded look range, in the same pan units `useBoundedPan` operates in. */
  panBounds: { min: number; max: number };
  layers: SceneLayer[];
  markers: DiamondMarker[];
  particles?: SceneParticle[];
  /** Exact count of literal step elements this node renders — only the steps node sets this above 0 (Living Bible §5: "Three literal steps"). */
  stepCount: number;
  /**
   * The real `10_ASSETS` id for this node's complete scene background
   * (see docs/assets/PHASE_1_ASSET_HANDOFF.md — `beach_focus_scene`,
   * `beach_three_steps_scene`, `steps_church_approach_scene`,
   * `church_focus_scene`). The caller (`SceneJourney`/`BeachArrival`)
   * resolves this id against the real `10_ASSETS`-backed asset list and
   * passes the result to `SceneStage` as `backgroundAsset`; until that
   * asset is actually registered/enabled, this field has no visible
   * effect and every layer below keeps rendering as its CSS placeholder.
   */
  backgroundAssetId?: string;
}

export interface JourneyDefinition {
  id: string;
  nodes: SceneNode[];
}
