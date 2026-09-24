import type { JourneyDefinition } from './types';

/** Existing authored connector chain and stable checkpoint IDs.
 * Background IDs resolve through the registered Sheet/Drive runtime. Flat artwork
 * contains its own steps and occlusion; legacy layer data is fallback-only.
 * Responsive image-space interaction anchors live in sceneComposition.ts.
 */
export const BEACH_TO_CHURCH_JOURNEY: JourneyDefinition = {
  id: 'm05_prototype',
  nodes: [
    {
      id: 'beach_focus',
      locationId: 'beach',
      displayName: 'Beach focus (placeholder)',
      panBounds: { min: -20, max: 20 },
      stepCount: 0,
      backgroundAssetId: 'beach_focus_scene',
      layers: [
        {
          id: 'sky',
          kind: 'gradient',
          parallaxFactor: 0,
          css: 'linear-gradient(#a9d6e5, #f2e9c9)',
        },
        { id: 'sea', kind: 'color', parallaxFactor: 0.2, css: '#2f6690' },
        { id: 'sand', kind: 'color', parallaxFactor: 0.6, css: '#e8d9a0' },
      ],
      markers: [
        { id: 'shell', worldX: 30, worldY: 80, labelForTest: 'A shell on the sand' },
        // The road to the Church / Vinyl Café crossroads. Only a walk: it never touches the Church entrance
        // screen, and which places may be entered is still decided server-side.
        {
          id: 'road_onward',
          worldX: 90,
          worldY: 70,
          labelForTest: 'The road onward',
          captioned: true,
          viewportAnchor: { desktop: [86, 78], mobile: [78, 72] },
        },

        {
          id: 'path_to_steps',
          worldX: 75,
          worldY: 72,
          labelForTest: 'Path to the three steps',
          destinationNodeId: 'beach_steps',
        },
      ],
    },
    {
      id: 'beach_steps',
      locationId: 'beach',
      displayName: 'Beach + three steps (placeholder)',
      panBounds: { min: -15, max: 15 },
      stepCount: 3,
      backgroundAssetId: 'beach_three_steps_scene',
      layers: [
        {
          id: 'sky',
          kind: 'gradient',
          parallaxFactor: 0,
          css: 'linear-gradient(#a9d6e5, #f2e9c9)',
        },
        { id: 'sand', kind: 'color', parallaxFactor: 0.6, css: '#e8d9a0' },
        {
          id: 'steps_occluder',
          kind: 'color',
          parallaxFactor: 0.9,
          css: '#8a7a5c',
          isOccluder: true,
        },
      ],
      markers: [
        // The road to the Church / Vinyl Café crossroads. Only a walk: it never touches the Church entrance
        // screen, and which places may be entered is still decided server-side.
        {
          id: 'road_onward',
          worldX: 90,
          worldY: 70,
          labelForTest: 'The road onward',
          captioned: true,
          viewportAnchor: { desktop: [86, 78], mobile: [78, 72] },
        },
      ],
    },
    {
      id: 'steps_church_approach',
      locationId: 'church',
      displayName: 'Near steps + Church approach (placeholder)',
      panBounds: { min: -15, max: 15 },
      stepCount: 3,
      backgroundAssetId: 'steps_church_approach_scene',
      layers: [
        {
          id: 'sky',
          kind: 'gradient',
          parallaxFactor: 0,
          css: 'linear-gradient(#a9d6e5, #cfd9c9)',
        },
        { id: 'road', kind: 'color', parallaxFactor: 0.5, css: '#b8ab8c' },
        {
          id: 'steps_occluder',
          kind: 'color',
          parallaxFactor: 0.9,
          css: '#8a7a5c',
          isOccluder: true,
        },
      ],
      markers: [
        { id: 'church_door_hint', worldX: 70, worldY: 55, labelForTest: 'The Church door ahead' },
        // The road to the Church / Vinyl Café crossroads. Only a walk: it never touches the Church entrance
        // screen, and which places may be entered is still decided server-side.
        {
          id: 'road_onward',
          worldX: 90,
          worldY: 70,
          labelForTest: 'The road onward',
          captioned: true,
          viewportAnchor: { desktop: [86, 78], mobile: [78, 72] },
        },
      ],
    },
    {
      id: 'church_focus',
      locationId: 'church',
      displayName: 'Church focus, exterior only (placeholder)',
      panBounds: { min: -10, max: 10 },
      stepCount: 0,
      backgroundAssetId: 'church_focus_scene',
      layers: [
        {
          id: 'sky',
          kind: 'gradient',
          parallaxFactor: 0,
          css: 'linear-gradient(#cfd9c9, #efe6d8)',
        },
        { id: 'facade', kind: 'color', parallaxFactor: 0.7, css: '#c9b89a' },
      ],
      markers: [
        {
          id: 'church_door',
          worldX: 50,
          worldY: 60,
          labelForTest: 'Church entrance',
          captioned: true,
        },
        // The road to the Church / Vinyl Café crossroads. Only a walk: it never touches the Church entrance
        // screen, and which places may be entered is still decided server-side.
        {
          id: 'road_onward',
          worldX: 90,
          worldY: 70,
          labelForTest: 'The road onward',
          captioned: true,
          viewportAnchor: { desktop: [86, 78], mobile: [78, 72] },
        },
      ],
    },
  ],
};

/** Same authored nodes, but a distinct progress route for the real Phase 1 first-opening flow. */
export const FIRST_OPENING_BEACH_JOURNEY: JourneyDefinition = {
  ...BEACH_TO_CHURCH_JOURNEY,
  id: 'first_opening_beach',
};
