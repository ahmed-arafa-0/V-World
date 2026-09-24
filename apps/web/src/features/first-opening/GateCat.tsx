import { useEffect, useState, type CSSProperties } from 'react';
import { catPoses, SUN_SHADOW } from '../scene-engine/sceneComposition';
import { useGateFrame } from './coverFrame';
import styles from './GateCat.module.css';

/**
 * VAR seated on the Gate's cobbles: the sprite is anchored by its paws (see
 * `catPoses.idle`), with a contact shadow and the same fur toning the Beach
 * scenes use, so it sits on the ground instead of hovering beside the door.
 */
export function SeatedGateCat({ src }: { src: string }) {
  const { frame, layout } = useGateFrame();
  const pose = catPoses.idle;
  const spriteWidth = frame.width * layout.seated.width;
  const shadowWidth = spriteWidth * pose.shadow.width;
  return (
    <div
      className={styles.anchor}
      data-testid="var-reveal-anchor"
      style={{
        left: frame.left + frame.width * layout.seated.x,
        top: frame.top + frame.height * layout.seated.y,
      }}
    >
      <span
        className={styles.shadow}
        style={{
          width: shadowWidth,
          height: shadowWidth * SUN_SHADOW.aspect,
          left: (pose.shadow.cx - pose.pawX) * spriteWidth + shadowWidth * SUN_SHADOW.dx,
          top:
            (pose.shadow.cy - pose.pawY) * spriteWidth * pose.ratio + shadowWidth * SUN_SHADOW.dy,
        }}
      />
      <img
        className={styles.sprite}
        src={src}
        alt=""
        data-testid="var-reveal-image"
        style={{
          width: spriteWidth,
          transform: `translate(${-pose.pawX * 100}%, ${-pose.pawY * 100}%)`,
          filter: pose.tone,
        }}
      />
    </div>
  );
}

/** Upper bound for the leap; the sprite is removed even if the animation event never fires. */
export const JUMP_MAX_MS = 2600;

/**
 * VAR's leap through the opened doors: one bounded arc from the cobbles,
 * through the light slit, fading into the island beyond. It always ends
 * (animation `forwards` to opacity 0, then unmounted), so it can never hang
 * frozen in mid-air while the player decides to press Continue.
 */
export function JumpingGateCat({ src }: { src: string }) {
  const { frame, layout } = useGateFrame();
  const [gone, setGone] = useState(
    () => window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  );
  useEffect(() => {
    const timer = window.setTimeout(() => setGone(true), JUMP_MAX_MS);
    return () => window.clearTimeout(timer);
  }, []);
  if (gone) return null;
  const { fromX, groundY, slitX, slitY, width } = layout.jump;
  const spriteWidth = frame.width * width;
  const at = (x: number, y: number) => ({
    x: frame.left + frame.width * x,
    y: frame.top + frame.height * y,
  });
  const start = at(fromX, groundY);
  const apex = at(fromX + (slitX - fromX) * 0.55, slitY - 0.1);
  const through = at(slitX, slitY);
  const beyond = at(slitX + 0.005, slitY - 0.08);
  const px = (v: number) => `${v}px`;
  return (
    <img
      className={styles.jump}
      src={src}
      alt=""
      data-testid="doors-opening-character"
      onAnimationEnd={() => setGone(true)}
      style={
        {
          width: spriteWidth,
          '--x0': px(start.x),
          '--y0': px(start.y),
          '--x1': px(apex.x),
          '--y1': px(apex.y),
          '--x2': px(through.x),
          '--y2': px(through.y),
          '--x3': px(beyond.x),
          '--y3': px(beyond.y),
        } as CSSProperties
      }
    />
  );
}
