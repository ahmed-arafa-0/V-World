import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SceneStage } from '../src/features/scene-engine/SceneStage';
import { coverPlane } from '../src/features/scene-engine/sceneComposition';
import { BEACH_TO_CHURCH_JOURNEY } from '../src/features/scene-engine/sceneDefinitions';

const art = {
  assetId: 'beach_three_steps_scene',
  assetType: 'image',
  version: 1,
  preloadPriority: 1,
  hasMobileVariant: true,
  hasPosterVariant: false,
  mediaRef: '/api/media/beach_three_steps_scene?v=1',
};
const seated = { ...art, assetId: 'var_idle_collar', mediaRef: '/api/media/var_idle_collar?v=1' };
const walking = { ...art, assetId: 'var_walk_collar', mediaRef: '/api/media/var_walk_collar?v=1' };
describe('Illustrated scene presentation', () => {
  it('shows the seated collared pose when still and the walking pose only while moving', () => {
    const props = {
      node: BEACH_TO_CHURCH_JOURNEY.nodes[0]!,
      pan: 0,
      backgroundAsset: art,
      companionAsset: seated,
      walkingAsset: walking,
    };
    const { rerender } = render(<SceneStage {...props} />);
    expect(screen.getByTestId('scene-cat')).toHaveAttribute('data-pose', 'idle');
    expect(screen.getByTestId('scene-companion')).toHaveAttribute('src', seated.mediaRef);
    expect(screen.getByTestId('scene-cat-shadow')).toBeInTheDocument();
    rerender(<SceneStage {...props} moving />);
    expect(screen.getByTestId('scene-cat')).toHaveAttribute('data-pose', 'walk');
    expect(screen.getByTestId('scene-companion')).toHaveAttribute('src', walking.mediaRef);
    rerender(<SceneStage {...props} moving={false} />);
    expect(screen.getByTestId('scene-cat')).toHaveAttribute('data-pose', 'idle');
  });
  it('does not lose the cat when only one pose is registered', () => {
    render(
      <SceneStage
        node={BEACH_TO_CHURCH_JOURNEY.nodes[0]!}
        pan={0}
        backgroundAsset={art}
        walkingAsset={walking}
      />,
    );
    expect(screen.getByTestId('scene-companion')).toHaveAttribute('src', walking.mediaRef);
  });
  it('renders every control as an SVG icon with an accessible name and no raw glyph text', () => {
    render(
      <SceneStage
        node={BEACH_TO_CHURCH_JOURNEY.nodes[0]!}
        pan={0}
        backgroundAsset={art}
        onForward={vi.fn()}
        onBack={vi.fn()}
        onMarkerActivate={vi.fn()}
      />,
    );
    for (const button of screen.getAllByRole('button')) {
      expect(button).toHaveAccessibleName();
      // A captioned choice (the road onward) carries its visible localized label; every other control is icon-only.
      if (!button.querySelector('[data-testid^="marker-caption-"]'))
        expect(button.textContent).toBe('');
      expect(button.querySelector('svg, img')).not.toBeNull();
    }
    expect(screen.getByTestId('walk-forward').querySelector('svg')).not.toBeNull();
    expect(screen.getByTestId('walk-back').querySelector('svg')).not.toBeNull();
  });
  it.each(BEACH_TO_CHURCH_JOURNEY.nodes)(
    'never paints placeholder layers, occluders or steps over $id artwork',
    (node) => {
      const { container } = render(<SceneStage node={node} pan={0} backgroundAsset={art} />);
      expect(screen.getByTestId(`scene-photo-${node.id}`)).toBeInTheDocument();
      expect(container.querySelector('[data-occluder]')).toBeNull();
      expect(container.querySelector('[data-testid^="scene-layer-"]')).toBeNull();
      expect(screen.queryAllByTestId('step')).toHaveLength(0);
      expect(container.textContent).not.toMatch(/DEV|placeholder/i);
    },
  );
  it('uses portrait art and puts interactive objects in the same coordinate plane as the image', () => {
    render(
      <SceneStage
        node={BEACH_TO_CHURCH_JOURNEY.nodes[0]!}
        pan={10}
        backgroundAsset={art}
        onMarkerActivate={vi.fn()}
      />,
    );
    const plane = screen.getByTestId('scene-image-plane');
    expect(plane).toContainElement(screen.getByTestId('marker-shell'));
    expect(plane.querySelector('source')).toHaveAttribute('media', '(max-aspect-ratio: 1/1)');
    expect(plane.querySelector('source')).toHaveAttribute(
      'srcset',
      `${art.mediaRef}&variant=mobile`,
    );
  });
  it('supports keyboard activation and blocks every hotspot during a transition', async () => {
    const forward = vi.fn(),
      marker = vi.fn();
    const props = {
      node: BEACH_TO_CHURCH_JOURNEY.nodes[0]!,
      pan: 0,
      backgroundAsset: art,
      onForward: forward,
      onMarkerActivate: marker,
    };
    const { rerender } = render(<SceneStage {...props} />);
    screen.getByRole('button', { name: 'Walk forward' }).focus();
    await userEvent.setup().keyboard('{Enter}');
    expect(forward).toHaveBeenCalledTimes(1);
    rerender(<SceneStage {...props} disabled />);
    fireEvent.click(screen.getByTestId('marker-shell'));
    expect(marker).not.toHaveBeenCalled();
    for (const button of screen.getAllByRole('button')) expect(button).toBeDisabled();
  });
  it.each([
    [1440, 900, 1672, 941],
    [393, 852, 941, 1672],
    [852, 393, 1672, 941],
    [768, 1024, 941, 1672],
  ])('covers %sx%s without exposing blank edges when looking', (w, h, iw, ih) => {
    for (const pan of [-100, -20, 0, 20, 100]) {
      const plane = coverPlane(w, h, iw, ih, pan);
      expect(plane.left).toBeLessThanOrEqual(0);
      expect(plane.top).toBeLessThanOrEqual(0);
      expect(plane.width + plane.left).toBeGreaterThanOrEqual(w - 0.001);
      expect(plane.height + plane.top).toBeGreaterThanOrEqual(h - 0.001);
    }
  });
});
