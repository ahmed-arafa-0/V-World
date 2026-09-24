import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';

export interface PanBounds {
  min: number;
  max: number;
}

const KEY_STEP = 4;
const DRAG_SENSITIVITY = 0.15;

export interface BoundedPanControls {
  pan: number;
  atMin: boolean;
  atMax: boolean;
  nudge: (delta: number) => void;
  onKeyDown: (event: ReactKeyboardEvent) => void;
  onPointerDown: (event: ReactPointerEvent) => void;
  onPointerMove: (event: ReactPointerEvent) => void;
  onPointerUp: () => void;
}

/**
 * Bounded first-person "look" — a single horizontal pan value clamped to
 * `bounds`, drivable by keyboard (arrow keys), pointer drag (mouse AND
 * touch, since the Pointer Events API already unifies both — Living Bible
 * §7: "drag/swipe, desktop mouse/keyboard"), or an imperative `nudge()` for
 * on-screen Look-Left/Look-Right buttons. The camera can never move past
 * `bounds` — Master Build Plan M05 acceptance: "Camera cannot rotate
 * beyond prepared art."
 *
 * `resetKey` should be the current scene node's `id` — panning resets to 0
 * whenever the node changes, so arriving at a new node always starts
 * centered rather than carrying over the previous node's look offset.
 */
export function useBoundedPan(bounds: PanBounds, resetKey: string): BoundedPanControls {
  const [pan, setPan] = useState(0);
  const dragState = useRef<{ startClientX: number; startPan: number } | null>(null);

  useEffect(() => {
    setPan(0);
  }, [resetKey]);

  const clamp = useCallback(
    (value: number) => Math.min(bounds.max, Math.max(bounds.min, value)),
    [bounds.min, bounds.max],
  );

  const nudge = useCallback((delta: number) => setPan((prev) => clamp(prev + delta)), [clamp]);

  const onKeyDown = useCallback(
    (event: ReactKeyboardEvent) => {
      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        nudge(-KEY_STEP);
      } else if (event.key === 'ArrowRight') {
        event.preventDefault();
        nudge(KEY_STEP);
      }
    },
    [nudge],
  );

  const onPointerDown = useCallback(
    (event: ReactPointerEvent) => {
      if ((event.target as HTMLElement).closest('button, input, select, textarea, a, summary'))
        return;
      dragState.current = { startClientX: event.clientX, startPan: pan };
    },
    [pan],
  );

  const onPointerMove = useCallback(
    (event: ReactPointerEvent) => {
      if (!dragState.current) return;
      const delta = (event.clientX - dragState.current.startClientX) * DRAG_SENSITIVITY;
      setPan(clamp(dragState.current.startPan + delta));
    },
    [clamp],
  );

  const onPointerUp = useCallback(() => {
    dragState.current = null;
  }, []);

  return {
    pan,
    atMin: pan <= bounds.min,
    atMax: pan >= bounds.max,
    nudge,
    onKeyDown,
    onPointerDown,
    onPointerMove,
    onPointerUp,
  };
}
