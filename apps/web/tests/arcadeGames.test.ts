import { describe, expect, it } from 'vitest';
import {
  generateMaze,
  mazeScore,
  mazeShortestPath,
  mazeSizeFor,
  triviaScore,
} from '../src/features/world/games/games';

// A tiny linear-congruential RNG so maze generation is reproducible across runs.
function seededRandom(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1103515245 + 12345) & 0x7fffffff;
    return state / 0x7fffffff;
  };
}

describe('Maze (var_maze)', () => {
  it('scales grid size with difficulty, 5..9', () => {
    expect(mazeSizeFor(1)).toBe(5);
    expect(mazeSizeFor(3)).toBe(7);
    expect(mazeSizeFor(5)).toBe(9);
    expect(mazeSizeFor(99)).toBe(9); // clamped
    expect(mazeSizeFor(-5)).toBe(5); // clamped
  });

  it('always generates a maze where the exit is reachable from the entrance', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const size = mazeSizeFor((seed % 5) + 1);
      const grid = generateMaze(size, seededRandom(seed));
      const distance = mazeShortestPath(grid);
      expect(distance).toBeGreaterThan(0);
      expect(Number.isFinite(distance)).toBe(true);
    }
  });

  it('scores a win when moves stay within budget, a loss otherwise', () => {
    const efficient = mazeScore(10, 12);
    expect(efficient.result).toBe('win');
    expect(efficient.score).toBeGreaterThan(0);

    const wasteful = mazeScore(10, 100);
    expect(wasteful.result).toBe('lose');
  });
});

describe('Trivia scoring', () => {
  it('wins at 60% or better, loses otherwise', () => {
    expect(triviaScore(3, 5).result).toBe('win'); // 60%
    expect(triviaScore(2, 5).result).toBe('lose'); // 40%
    expect(triviaScore(0, 5)).toEqual({ score: 0, result: 'lose' });
    expect(triviaScore(5, 5)).toEqual({ score: 100, result: 'win' });
  });
});
