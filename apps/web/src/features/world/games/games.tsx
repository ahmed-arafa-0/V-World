import { useEffect, useMemo, useRef, useState } from 'react';
import type { TriviaQuestionView } from '@veoullas-world/contracts';
import { useWorld } from '../WorldContext';
import { worldApi } from '../worldClient';
import styles from '../world.module.css';

export interface GameResult {
  score: number;
  result: 'win' | 'lose';
}

export interface GameProps {
  /** Server-assigned adaptive level, 1–5. */
  difficulty: number;
  /** Game sound effects only (there is never game music). */
  sfx: boolean;
  labels: { moves: string; score: string; time: string; level: string };
  onFinish: (result: GameResult) => void;
  /** Deterministic randomness for tests. */
  random?: () => number;
  /** Registered artwork for a card symbol (a seed, crop or key icon), or null to show the plain symbol. */
  faceArt?: (symbol: string) => string | null;
  /** The cabinet's own `game_id` — only Trivia needs it, to fetch/answer its server-validated questions. */
  gameId?: string;
}

/** A short sound effect via WebAudio; silently skipped when unsupported or blocked. */
export function sfxBeep(enabled: boolean, freq: number, ms = 90): void {
  if (!enabled) return;
  try {
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    const ctx = new Ctor();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    gain.gain.value = 0.05;
    osc.frequency.value = freq;
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + ms / 1000);
    window.setTimeout(() => void ctx.close(), ms + 50);
  } catch {
    // Blocked or unavailable audio never affects play.
  }
}

/* ------------------------------------------------------------------ */
/* Memory cards                                                          */
/* ------------------------------------------------------------------ */

const SYMBOLS = ['🌻', '🥭', '🫐', '🐚', '🕯️', '🎵', '✉️', '🗝️'];

/** Which registered icon (09_ICONS) stands for each symbol: crops and key shapes the player already knows. */
export const SYMBOL_ICON_IDS: Record<string, string> = {
  '🌻': 'crop_sunflower_icon',
  '🥭': 'crop_mango_icon',
  '🫐': 'crop_blueberry_icon',
  '🐚': 'key_shell_icon',
  '🕯️': 'key_candle_icon',
  '🎵': 'key_music_icon',
  '✉️': 'key_letter_icon',
  '🗝️': 'key_everkeep_icon',
};
const PAIRS_BY_LEVEL = [3, 4, 5, 6, 8];

export function memoryPairs(difficulty: number): number {
  return PAIRS_BY_LEVEL[Math.max(0, Math.min(4, difficulty - 1))]!;
}

/** Fisher–Yates with an injectable RNG. */
export function shuffle<T>(items: T[], random: () => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

export function memoryScore(
  pairs: number,
  moves: number,
): { score: number; result: 'win' | 'lose' } {
  const budget = pairs * 3 + 2;
  const score = Math.max(1, pairs * 10 + Math.max(0, budget - moves) * 5);
  return { score, result: moves <= budget ? 'win' : 'lose' };
}

export function MemoryGame({
  difficulty,
  sfx,
  labels,
  onFinish,
  random = Math.random,
  faceArt,
}: GameProps) {
  const pairs = memoryPairs(difficulty);
  const deck = useMemo(
    () => shuffle([...SYMBOLS.slice(0, pairs), ...SYMBOLS.slice(0, pairs)], random),
    [pairs, random],
  );
  const [open, setOpen] = useState<number[]>([]);
  const [matched, setMatched] = useState<number[]>([]);
  const [moves, setMoves] = useState(0);
  const finished = useRef(false);
  const columns = pairs <= 3 ? 3 : 4;

  function flip(index: number) {
    if (open.length === 2 || open.includes(index) || matched.includes(index)) return;
    const next = [...open, index];
    setOpen(next);
    sfxBeep(sfx, 520);
    if (next.length < 2) return;
    setMoves((m) => m + 1);
    const [a, b] = next as [number, number];
    if (deck[a] === deck[b]) {
      sfxBeep(sfx, 780);
      setMatched((m) => [...m, a, b]);
      setOpen([]);
    } else {
      window.setTimeout(() => setOpen([]), 650);
    }
  }

  useEffect(() => {
    if (matched.length === deck.length && !finished.current) {
      finished.current = true;
      const { score, result } = memoryScore(pairs, moves);
      onFinish({ score, result });
    }
  }, [matched, deck.length, moves, pairs, onFinish]);

  return (
    <div className={styles.gameArea} data-testid="game-memory">
      <p className={styles.muted}>
        {labels.level} {difficulty} · {labels.moves}: {moves}
      </p>
      <div className={styles.cardGrid} style={{ gridTemplateColumns: `repeat(${columns}, 1fr)` }}>
        {deck.map((symbol, i) => {
          const face = matched.includes(i) ? 'matched' : open.includes(i) ? 'up' : 'down';
          return (
            <button
              key={i}
              type="button"
              className={styles.memoryCard}
              data-face={face}
              data-testid={`memory-card-${i}`}
              data-symbol={face === 'down' ? undefined : symbol}
              onClick={() => flip(i)}
              aria-label={face === 'down' ? '?' : symbol}
            >
              {face === 'down' ? (
                '·'
              ) : faceArt?.(symbol) ? (
                <img className={styles.cardArt} src={faceArt(symbol)!} alt="" />
              ) : (
                symbol
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Catching game                                                         */
/* ------------------------------------------------------------------ */

const CATCH_ITEMS = ['🥭', '🫐', '🌻'];
const CATCH_SECONDS = 30;

export function catchTarget(difficulty: number): number {
  return 40 + difficulty * 20;
}

export function CatchGame({ difficulty, sfx, labels, onFinish, random = Math.random }: GameProps) {
  const [basket, setBasket] = useState(50);
  const [items, setItems] = useState<{ id: number; x: number; y: number; face: string }[]>([]);
  const [score, setScore] = useState(0);
  const [seconds, setSeconds] = useState(CATCH_SECONDS);
  const state = useRef({ basket: 50, score: 0, nextId: 0, done: false });
  const field = useRef<HTMLDivElement | null>(null);
  const speed = 2.2 + difficulty * 0.7;
  const finishRef = useRef(onFinish);
  finishRef.current = onFinish;

  function move(percent: number) {
    const next = Math.max(6, Math.min(94, percent));
    state.current.basket = next;
    setBasket(next);
  }

  useEffect(() => {
    const tick = window.setInterval(() => {
      const s = state.current;
      if (s.done) return;
      setItems((current) => {
        const moved = current
          .map((item) => ({ ...item, y: item.y + speed }))
          .filter((item) => {
            if (item.y >= 88) {
              if (Math.abs(item.x - s.basket) < 11) {
                s.score += 10;
                setScore(s.score);
                sfxBeep(sfx, 880, 60);
              }
              return false;
            }
            return true;
          });
        if (random() < 0.12 + difficulty * 0.02) {
          moved.push({
            id: s.nextId++,
            x: 8 + random() * 84,
            y: 0,
            face: CATCH_ITEMS[Math.floor(random() * CATCH_ITEMS.length)]!,
          });
        }
        return moved;
      });
    }, 60);
    const clock = window.setInterval(() => {
      setSeconds((v) => {
        if (v <= 1 && !state.current.done) {
          state.current.done = true;
          finishRef.current({
            score: state.current.score,
            result: state.current.score >= catchTarget(difficulty) ? 'win' : 'lose',
          });
        }
        return Math.max(0, v - 1);
      });
    }, 1000);
    return () => {
      window.clearInterval(tick);
      window.clearInterval(clock);
    };
  }, [difficulty, random, sfx, speed]);

  return (
    <div className={styles.gameArea} data-testid="game-catch">
      <p className={styles.muted}>
        {labels.level} {difficulty} · {labels.score}: {score} / {catchTarget(difficulty)} ·{' '}
        {labels.time}: {seconds}
      </p>
      <div
        ref={field}
        className={styles.catchField}
        role="application"
        tabIndex={0}
        aria-label="catch"
        onPointerMove={(e) => {
          const rect = field.current?.getBoundingClientRect();
          if (rect) move(((e.clientX - rect.left) / rect.width) * 100);
        }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowLeft') move(state.current.basket - 8);
          if (e.key === 'ArrowRight') move(state.current.basket + 8);
        }}
      >
        {items.map((item) => (
          <span
            key={item.id}
            className={styles.faller}
            style={{ left: `${item.x}%`, top: `${item.y}%` }}
          >
            {item.face}
          </span>
        ))}
        <span
          className={styles.basket}
          style={{ left: `calc(${basket}% - 24px)` }}
          data-testid="catch-basket"
        />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Picture (sliding) puzzle                                              */
/* ------------------------------------------------------------------ */

export function neighbours(blank: number, size: number): number[] {
  const row = Math.floor(blank / size);
  const col = blank % size;
  const out: number[] = [];
  if (row > 0) out.push(blank - size);
  if (row < size - 1) out.push(blank + size);
  if (col > 0) out.push(blank - 1);
  if (col < size - 1) out.push(blank + 1);
  return out;
}

/** Shuffles by legal moves from the solved state, so every puzzle is solvable. */
export function shufflePuzzle(size: number, steps: number, random: () => number): number[] {
  const tiles = Array.from({ length: size * size }, (_, i) => i);
  let blank = tiles.length - 1;
  let previous = -1;
  for (let i = 0; i < steps; i++) {
    const options = neighbours(blank, size).filter((n) => n !== previous);
    const pick = options[Math.floor(random() * options.length)]!;
    [tiles[blank], tiles[pick]] = [tiles[pick]!, tiles[blank]!];
    previous = blank;
    blank = pick;
  }
  return tiles;
}

export function PuzzleGame({ difficulty, sfx, labels, onFinish, random = Math.random }: GameProps) {
  const size = 3;
  const [tiles, setTiles] = useState(() => shufflePuzzle(size, 10 + difficulty * 8, random));
  const [moves, setMoves] = useState(0);
  const finished = useRef(false);

  function tap(index: number) {
    const blank = tiles.indexOf(size * size - 1);
    if (!neighbours(blank, size).includes(index)) return;
    const next = [...tiles];
    [next[blank], next[index]] = [next[index]!, next[blank]!];
    setTiles(next);
    setMoves((m) => m + 1);
    sfxBeep(sfx, 420, 50);
  }

  useEffect(() => {
    if (finished.current || !tiles.every((t, i) => t === i)) return;
    finished.current = true;
    onFinish({ score: Math.max(10, 200 - moves * 3), result: 'win' });
  }, [tiles, moves, onFinish]);

  return (
    <div className={styles.gameArea} data-testid="game-puzzle">
      <p className={styles.muted}>
        {labels.level} {difficulty} · {labels.moves}: {moves}
      </p>
      <div className={styles.puzzleGrid} style={{ gridTemplateColumns: `repeat(${size}, 1fr)` }}>
        {tiles.map((tile, i) => {
          const blank = tile === size * size - 1;
          return (
            <button
              key={i}
              type="button"
              className={styles.tile}
              data-blank={blank}
              data-testid={`puzzle-tile-${i}`}
              disabled={blank}
              style={blank ? undefined : { background: `hsl(${(tile * 40) % 360} 60% 72%)` }}
              onClick={() => tap(i)}
            >
              {blank ? '' : tile + 1}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Maze (VAR's way out)                                                 */
/* ------------------------------------------------------------------ */

interface MazeWalls {
  top: boolean;
  right: boolean;
  bottom: boolean;
  left: boolean;
}

const MAZE_SIZE_BY_LEVEL = [5, 6, 7, 8, 9];

export function mazeSizeFor(difficulty: number): number {
  return MAZE_SIZE_BY_LEVEL[Math.max(0, Math.min(4, difficulty - 1))]!;
}

/** Recursive-backtracker maze generation with an injectable RNG (deterministic for tests). */
export function generateMaze(size: number, random: () => number): MazeWalls[][] {
  const grid: MazeWalls[][] = Array.from({ length: size }, () =>
    Array.from({ length: size }, () => ({ top: true, right: true, bottom: true, left: true })),
  );
  const visited = Array.from({ length: size }, () => new Array<boolean>(size).fill(false));
  const stack: [number, number][] = [[0, 0]];
  visited[0]![0] = true;
  const dirs: [number, number, keyof MazeWalls, keyof MazeWalls][] = [
    [0, -1, 'top', 'bottom'],
    [1, 0, 'right', 'left'],
    [0, 1, 'bottom', 'top'],
    [-1, 0, 'left', 'right'],
  ];
  while (stack.length > 0) {
    const [x, y] = stack[stack.length - 1]!;
    const options = dirs
      .map(([dx, dy, wall, opposite]) => ({ nx: x + dx, ny: y + dy, wall, opposite }))
      .filter(({ nx, ny }) => nx >= 0 && nx < size && ny >= 0 && ny < size && !visited[ny]![nx]);
    if (options.length === 0) {
      stack.pop();
      continue;
    }
    const pick = options[Math.floor(random() * options.length)]!;
    grid[y]![x]![pick.wall] = false;
    grid[pick.ny]![pick.nx]![pick.opposite] = false;
    visited[pick.ny]![pick.nx] = true;
    stack.push([pick.nx, pick.ny]);
  }
  return grid;
}

/** BFS shortest path length from the entrance (0,0) to the exit (size-1,size-1). */
export function mazeShortestPath(grid: MazeWalls[][]): number {
  const size = grid.length;
  const dist = Array.from({ length: size }, () => new Array<number>(size).fill(-1));
  dist[0]![0] = 0;
  const queue: [number, number][] = [[0, 0]];
  while (queue.length > 0) {
    const [x, y] = queue.shift()!;
    const cell = grid[y]![x]!;
    const steps: [number, number, boolean][] = [
      [x, y - 1, !cell.top],
      [x + 1, y, !cell.right],
      [x, y + 1, !cell.bottom],
      [x - 1, y, !cell.left],
    ];
    for (const [nx, ny, open] of steps) {
      if (!open || nx < 0 || nx >= size || ny < 0 || ny >= size || dist[ny]![nx] !== -1) continue;
      dist[ny]![nx] = dist[y]![x]! + 1;
      queue.push([nx, ny]);
    }
  }
  return dist[size - 1]![size - 1]!;
}

export function mazeScore(
  optimal: number,
  moves: number,
): { score: number; result: 'win' | 'lose' } {
  const budget = optimal * 2 + 4;
  const score = Math.max(1, optimal * 10 + Math.max(0, budget - moves) * 3);
  return { score, result: moves <= budget ? 'win' : 'lose' };
}

export function MazeGame({ difficulty, sfx, labels, onFinish, random = Math.random }: GameProps) {
  const size = mazeSizeFor(difficulty);
  const grid = useMemo(() => generateMaze(size, random), [size, random]);
  const optimal = useMemo(() => mazeShortestPath(grid), [grid]);
  const [pos, setPos] = useState<[number, number]>([0, 0]);
  const [moves, setMoves] = useState(0);
  const finished = useRef(false);

  function tryMove(dx: number, dy: number) {
    const [x, y] = pos;
    const nx = x + dx;
    const ny = y + dy;
    if (nx < 0 || nx >= size || ny < 0 || ny >= size) return;
    const cell = grid[y]![x]!;
    const open =
      (dx === 1 && dy === 0 && !cell.right) ||
      (dx === -1 && dy === 0 && !cell.left) ||
      (dy === 1 && dx === 0 && !cell.bottom) ||
      (dy === -1 && dx === 0 && !cell.top);
    if (!open) return;
    setPos([nx, ny]);
    setMoves((m) => m + 1);
    sfxBeep(sfx, 480, 50);
  }

  useEffect(() => {
    if (finished.current || !(pos[0] === size - 1 && pos[1] === size - 1)) return;
    finished.current = true;
    const { score, result } = mazeScore(optimal, moves);
    onFinish({ score, result });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pos, size, optimal]);

  return (
    <div className={styles.gameArea} data-testid="game-maze">
      <p className={styles.muted}>
        {labels.level} {difficulty} · {labels.moves}: {moves}
      </p>
      <div
        className={styles.mazeGrid}
        style={{ gridTemplateColumns: `repeat(${size}, 1fr)` }}
        role="application"
        tabIndex={0}
        aria-label="maze"
        onKeyDown={(e) => {
          if (e.key === 'ArrowUp') tryMove(0, -1);
          if (e.key === 'ArrowDown') tryMove(0, 1);
          if (e.key === 'ArrowLeft') tryMove(-1, 0);
          if (e.key === 'ArrowRight') tryMove(1, 0);
        }}
      >
        {grid.flatMap((row, y) =>
          row.map((cell, x) => {
            const isPlayer = pos[0] === x && pos[1] === y;
            const isGoal = x === size - 1 && y === size - 1;
            return (
              <button
                key={`${x}-${y}`}
                type="button"
                className={styles.mazeCell}
                data-testid={`maze-cell-${x}-${y}`}
                data-player={isPlayer || undefined}
                data-goal={isGoal || undefined}
                aria-label={isPlayer ? 'VAR' : isGoal ? 'exit' : undefined}
                style={{
                  borderTopWidth: cell.top ? 2 : 0,
                  borderRightWidth: cell.right ? 2 : 0,
                  borderBottomWidth: cell.bottom ? 2 : 0,
                  borderLeftWidth: cell.left ? 2 : 0,
                }}
                onClick={() => tryMove(x - pos[0], y - pos[1])}
              >
                {isPlayer ? '🐾' : isGoal ? '🚪' : ''}
              </button>
            );
          }),
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Trivia (one more question)                                            */
/* ------------------------------------------------------------------ */

const POINTS_PER_CORRECT = 20;

export function triviaScore(
  correctCount: number,
  total: number,
): { score: number; result: 'win' | 'lose' } {
  const score = correctCount * POINTS_PER_CORRECT;
  return { score, result: total > 0 && correctCount / total >= 0.6 ? 'win' : 'lose' };
}

/** Trivia is the one game whose correctness cannot be computed client-side, so unlike the other three it
 * fetches its round and validates each answer against the server (`/arcade/trivia/questions` /
 * `/arcade/trivia/answer`), never trusting a locally-known correct_answer. */
export function TriviaGame({ difficulty, sfx, labels, onFinish, gameId }: GameProps) {
  const env = useWorld();
  const [questions, setQuestions] = useState<TriviaQuestionView[] | null>(null);
  const [index, setIndex] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<{ correct: boolean; explanation: string } | null>(null);
  const [correctCount, setCorrectCount] = useState(0);
  const [loadFailed, setLoadFailed] = useState(false);
  const finished = useRef(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const r = await worldApi.post<{ ok: true; questions: TriviaQuestionView[] }>(
        '/arcade/trivia/questions',
        { gameId },
        env.locale,
      );
      if (cancelled) return;
      if (r.status === 'online' && r.data.questions.length > 0) setQuestions(r.data.questions);
      else setLoadFailed(true);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameId]);

  const current = questions?.[index] ?? null;

  function trueFalseLabel(id: string): string {
    return id === 'true' ? env.t('church_true') : env.t('church_false');
  }

  async function answer(optionId: string) {
    if (!current || outcome) return;
    setSelected(optionId);
    const r = await worldApi.post<{ ok: true; correct: boolean; explanation: string }>(
      '/arcade/trivia/answer',
      { gameId, questionId: current.questionId, selectedAnswer: optionId },
      env.locale,
    );
    if (r.status !== 'online') {
      setLoadFailed(true);
      return;
    }
    sfxBeep(sfx, r.data.correct ? 780 : 260);
    if (r.data.correct) setCorrectCount((n) => n + 1);
    setOutcome({ correct: r.data.correct, explanation: r.data.explanation });
  }

  function next() {
    if (!questions) return;
    if (index + 1 >= questions.length) {
      if (finished.current) return;
      finished.current = true;
      onFinish(triviaScore(correctCount, questions.length));
      return;
    }
    setIndex((i) => i + 1);
    setSelected(null);
    setOutcome(null);
  }

  return (
    <div className={styles.gameArea} data-testid="game-trivia">
      <p className={styles.muted}>
        {labels.level} {difficulty} · {labels.score}: {correctCount * POINTS_PER_CORRECT}
      </p>
      {loadFailed && !current && <p role="alert">{env.t('saving_retry')}</p>}
      {current && (
        <div dir={current.direction} data-testid="trivia-question">
          <p>
            {env.t('trivia_question_of')} {index + 1}/{questions?.length}: {current.question}
          </p>
          <div className={styles.list}>
            {current.options.map((o) => (
              <button
                key={o.id}
                type="button"
                data-testid={`trivia-option-${o.id}`}
                data-selected={selected === o.id || undefined}
                disabled={outcome !== null}
                onClick={() => void answer(o.id)}
              >
                {o.text || trueFalseLabel(o.id)}
              </button>
            ))}
          </div>
          {outcome && (
            <div data-testid="trivia-outcome">
              <p>{env.t(outcome.correct ? 'trivia_correct' : 'trivia_incorrect')}</p>
              {outcome.explanation && <p className={styles.muted}>{outcome.explanation}</p>}
              <button type="button" data-testid="trivia-next" onClick={next}>
                {env.t('trivia_next')}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export const GAME_COMPONENTS: Record<string, (props: GameProps) => JSX.Element> = {
  memory_cards: MemoryGame,
  catch_items: CatchGame,
  picture_puzzle: PuzzleGame,
  var_maze: MazeGame,
  trivia: TriviaGame,
};
