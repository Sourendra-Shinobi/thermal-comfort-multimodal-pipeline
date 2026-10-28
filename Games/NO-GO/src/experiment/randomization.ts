/**
 * Randomization Utilities
 * 
 * Implements a seeded pseudo-random number generator (Mulberry32).
 * The same seed always produces the same sequence — critical for
 * experimental reproducibility.
 * 
 * Algorithm: Mulberry32 (fast, high-quality 32-bit PRNG)
 * Reference: https://gist.github.com/tommyettinger/46a874533244883189143505d203312c
 */

export type PRNG = () => number;

/**
 * Create a seeded PRNG using the Mulberry32 algorithm.
 * @param seed  Any integer seed value. The same seed always produces the same sequence.
 * @returns     A function that returns a uniform float in [0, 1) on each call.
 */
export function createPRNG(seed: number): PRNG {
  let s = seed >>> 0; // ensure unsigned 32-bit integer
  return function (): number {
    s += 0x6d2b79f5;
    let z = s;
    z = Math.imul(z ^ (z >>> 15), z | 1);
    z ^= z + Math.imul(z ^ (z >>> 7), z | 61);
    z = (z ^ (z >>> 14)) >>> 0;
    return z / 0x100000000;
  };
}

/**
 * Generate a random integer seed suitable for use with createPRNG.
 * Uses crypto.getRandomValues for high entropy.
 */
export function generateRandomSeed(): number {
  const arr = new Uint32Array(1);
  crypto.getRandomValues(arr);
  return arr[0];
}

/**
 * Fisher-Yates in-place shuffle using the provided PRNG.
 * @param arr   Array to shuffle (mutated in place).
 * @param prng  Seeded PRNG from createPRNG().
 */
export function shuffle<T>(arr: T[], prng: PRNG): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(prng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/**
 * Pick a uniformly random integer in [0, n) using the provided PRNG.
 */
export function randInt(n: number, prng: PRNG): number {
  return Math.floor(prng() * n);
}
