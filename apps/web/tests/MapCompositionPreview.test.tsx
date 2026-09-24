import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MapCompositionPreview } from '../src/features/map-preview/MapCompositionPreview';
import { installMockFetch } from './helpers/mockApi';

const BOTH_REGISTERED = {
  ok: true,
  assets: [
    {
      assetId: 'map_island_transparent',
      assetType: 'image',
      version: 1,
      preloadPriority: 1,
      hasMobileVariant: false,
      hasPosterVariant: false,
      mediaRef: '/api/media/map_island_transparent?v=1',
    },
    {
      assetId: 'map_ocean_loop',
      assetType: 'video',
      version: 1,
      preloadPriority: 1,
      hasMobileVariant: false,
      hasPosterVariant: true,
      mediaRef: '/api/media/map_ocean_loop?v=1',
    },
  ],
};

function renderPreview(devMapPreviewResult?: unknown) {
  installMockFetch({ ownerSession: 'authenticated', devMapPreviewResult });
  return render(<MapCompositionPreview />);
}

describe('MapCompositionPreview — development-only enforcement', () => {
  it('shows a clear "not available" state, not composed media, when the backend reports its default (non-development) 404', async () => {
    renderPreview(); // no override — the mock's default IS the real staging/production 404 shape
    const unavailable = await screen.findByTestId('map-preview-unavailable');
    expect(unavailable).toHaveTextContent(
      /only available when running against a local or emulator/i,
    );
    expect(screen.queryByTestId('map-composition-preview')).not.toBeInTheDocument();
    expect(screen.queryByTestId('map-preview-stage')).not.toBeInTheDocument();
  });

  it('renders nothing from a real production-shaped 404 body even if it somehow carried extra fields', async () => {
    renderPreview({
      ok: false,
      code: 'not_found',
      message: 'No route for GET /api/dev/map-preview-assets',
    });
    await screen.findByTestId('map-preview-unavailable');
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(screen.queryByTestId('map-preview-ocean-video')).not.toBeInTheDocument();
  });

  it('treats a genuine network failure differently from the development-only 404', async () => {
    installMockFetch({ ownerSession: 'authenticated' });
    const originalFetch = global.fetch;
    global.fetch = (async () => {
      throw new Error('network down');
    }) as typeof fetch;

    render(<MapCompositionPreview />);
    expect(await screen.findByRole('alert')).toHaveTextContent(/could not load map composition/i);
    expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
    expect(screen.queryByTestId('map-preview-unavailable')).not.toBeInTheDocument();

    global.fetch = originalFetch;
  });
});

describe('MapCompositionPreview — loading and rendering (development environment simulated)', () => {
  it('shows a loading state before the fetch resolves', () => {
    renderPreview(BOTH_REGISTERED);
    expect(screen.getByText(/loading map composition preview/i)).toBeInTheDocument();
  });

  it('always shows the developer-only banner once loaded in a development environment', async () => {
    renderPreview(BOTH_REGISTERED);
    await screen.findByTestId('map-composition-preview');
    const notes = await screen.findAllByRole('note');
    const banner = notes.find((el) => el.textContent?.match(/developer preview only/i));
    expect(banner).toBeDefined();
    expect(banner).toHaveTextContent(/not the real map/i);
  });

  it('composes the island image over the ocean video when both assets are registered', async () => {
    renderPreview(BOTH_REGISTERED);
    const stage = await screen.findByTestId('map-preview-stage');
    expect(stage).toBeInTheDocument();

    const video = screen.getByTestId('map-preview-ocean-video') as HTMLVideoElement;
    expect(video.src).toContain('/api/media/map_ocean_loop?v=1');
    expect(video.poster).toContain('/api/media/map_ocean_loop?v=1&variant=poster');
    expect(video.loop).toBe(true);
    expect(video.muted).toBe(true);

    const island = screen.getByTestId('map-preview-island-image') as HTMLImageElement;
    expect(island.src).toContain('/api/media/map_island_transparent?v=1');
  });

  it('reports both assets as registered in the status list', async () => {
    renderPreview(BOTH_REGISTERED);
    const status = await screen.findByTestId('map-preview-asset-status');
    expect(status).toHaveTextContent('map_island_transparent: registered, v1');
    expect(status).toHaveTextContent('map_ocean_loop: registered, v1');
    expect(status).toHaveTextContent('poster available');
  });

  it('never embeds a raw Drive file ID anywhere in the rendered markup', async () => {
    const { container } = renderPreview(BOTH_REGISTERED);
    await screen.findByTestId('map-preview-stage');
    // Real Drive file IDs supplied for this milestone — none of these
    // literal strings may ever appear client-side.
    expect(container.innerHTML).not.toContain('1NR4PQdVvjZDvALoVLBvvmPrqP6kLvKO8');
    expect(container.innerHTML).not.toContain('1nPeRAGNfun4LeVtoXepXcL6GkFITL5oo');
    expect(container.innerHTML).not.toContain('1de1aBHsIG3PEso7WMALHKIaAVPNberMt');
  });
});

describe('MapCompositionPreview — missing assets (development environment simulated)', () => {
  it('shows a clear not-yet-registered message and seed-script hint when neither asset exists', async () => {
    renderPreview({ ok: true, assets: [] });

    const missing = await screen.findByTestId('map-preview-missing');
    expect(missing).toHaveTextContent(/neither map asset is registered/i);
    expect(missing).toHaveTextContent('npm run seed:phase1:map-assets');
    expect(screen.queryByTestId('map-preview-stage')).not.toBeInTheDocument();
  });

  it('names the specific missing asset when only one is registered', async () => {
    renderPreview({ ok: true, assets: [BOTH_REGISTERED.assets[0]] });

    const missing = await screen.findByTestId('map-preview-missing');
    expect(missing).toHaveTextContent('"map_ocean_loop" is not registered');
    expect(screen.queryByTestId('map-preview-stage')).not.toBeInTheDocument();
  });
});
