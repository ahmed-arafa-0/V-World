import { useMemo, type CSSProperties } from 'react';
import styles from './birthday.module.css';

/**
 * Forty recycled CSS particles remain mounted for the open celebration, with no creation loop or
 * background timer. Unmounting immediately removes all animation. `pointer-events: none` throughout,
 * so the celebration controls stay clickable.
 * Honors `prefers-reduced-motion`: a soft, mostly-static glow instead of flying particles.
 */
const COLORS = ['#8a5cf6', '#fff8ec', '#d4af37'] as const; // violet, ivory, gold
const PER_EDGE = 10;

type Edge = 'top' | 'bottom' | 'left' | 'right';
interface Particle {
  id: string;
  edge: Edge;
  offsetPercent: number;
  delayMs: number;
  durationMs: number;
  color: string;
  rotateDeg: number;
  size: number;
}

function buildParticles(seed: () => number): Particle[] {
  const edges: Edge[] = ['top', 'bottom', 'left', 'right'];
  const particles: Particle[] = [];
  for (const edge of edges) {
    for (let i = 0; i < PER_EDGE; i++) {
      particles.push({
        id: `${edge}-${i}`,
        edge,
        offsetPercent: 5 + seed() * 90,
        delayMs: seed() * 400,
        durationMs: 1400 + seed() * 900,
        color: COLORS[Math.floor(seed() * COLORS.length)]!,
        rotateDeg: seed() * 360,
        size: 6 + seed() * 6,
      });
    }
  }
  return particles;
}

function edgeStyle(p: Particle): CSSProperties {
  const base: CSSProperties = {
    position: 'absolute',
    width: p.size,
    height: p.size * 1.6,
    background: p.color,
    borderRadius: 1,
    animationDelay: `${p.delayMs}ms`,
    animationDuration: `${p.durationMs}ms`,
    transform: `rotate(${p.rotateDeg}deg)`,
  };
  switch (p.edge) {
    case 'top':
      return { ...base, top: -12, left: `${p.offsetPercent}%` };
    case 'bottom':
      return { ...base, top: -12, left: `${p.offsetPercent}%` };
    case 'left':
      return { ...base, left: `${p.offsetPercent}%`, top: `${p.offsetPercent}%` };
    case 'right':
      return { ...base, right: `${p.offsetPercent}%`, top: `${p.offsetPercent}%` };
  }
}

export function Confetti() {
  const reducedMotion = useMemo(
    () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false,
    [],
  );
  const particles = useMemo(() => buildParticles(Math.random), []);
  if (reducedMotion) {
    return (
      <div
        className={styles.confettiReduced}
        aria-hidden="true"
        data-testid="birthday-confetti-reduced"
      />
    );
  }

  return (
    <div className={styles.confettiField} aria-hidden="true" data-testid="birthday-confetti">
      {particles.map((p) => (
        <span key={p.id} className={styles.confettiPiece} style={edgeStyle(p)} />
      ))}
    </div>
  );
}
