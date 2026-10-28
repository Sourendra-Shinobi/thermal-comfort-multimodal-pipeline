/**
 * Test Suite: Randomization Utilities
 */

import { describe, it, expect } from 'vitest';
import { createPRNG, shuffle } from '../experiment/randomization';

describe('createPRNG (Mulberry32)', () => {
  it('produces values in [0, 1)', () => {
    const prng = createPRNG(42);
    for (let i = 0; i < 1000; i++) {
      const v = prng();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('same seed produces identical sequence', () => {
    const prng1 = createPRNG(12345);
    const prng2 = createPRNG(12345);
    for (let i = 0; i < 100; i++) {
      expect(prng1()).toBe(prng2());
    }
  });

  it('different seeds produce different sequences', () => {
    const prng1 = createPRNG(1);
    const prng2 = createPRNG(2);
    const seq1 = Array.from({ length: 10 }, () => prng1());
    const seq2 = Array.from({ length: 10 }, () => prng2());
    expect(seq1).not.toEqual(seq2);
  });
});

describe('shuffle', () => {
  it('preserves all elements', () => {
    const arr = [1, 2, 3, 4, 5];
    const prng = createPRNG(99);
    const shuffled = shuffle([...arr], prng);
    expect(shuffled.sort((a, b) => a - b)).toEqual(arr);
  });

  it('same seed produces same shuffle', () => {
    const arr = ['A', 'B', 'C', 'D', 'E', 'F', 'G'];
    const shuffled1 = shuffle([...arr], createPRNG(777));
    const shuffled2 = shuffle([...arr], createPRNG(777));
    expect(shuffled1).toEqual(shuffled2);
  });

  it('different seeds produce different shuffles (usually)', () => {
    const arr = Array.from({ length: 20 }, (_, i) => i);
    const s1 = shuffle([...arr], createPRNG(1));
    const s2 = shuffle([...arr], createPRNG(2));
    // Statistically certain to differ for 20 elements
    expect(s1).not.toEqual(s2);
  });
});
