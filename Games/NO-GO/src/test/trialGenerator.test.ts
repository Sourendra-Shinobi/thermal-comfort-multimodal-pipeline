/**
 * Test Suite: Trial Generator
 * 
 * Tests:
 *   1. Trial count matches config
 *   2. GO/NO-GO ratio within ±2 of target
 *   3. Max consecutive NO-GO constraint enforced
 *   4. Same seed → same sequence (reproducibility)
 *   5. Different seeds → different sequences
 *   6. NO-GO trials use the configured NO-GO color
 *   7. GO trials only use GO colors
 *   8. Practice trials are marked is_practice = true
 *   9. Main trials are marked is_practice = false
 */

import { describe, it, expect } from 'vitest';
import { generateTrialSequenceWithConfig, validateSequence } from '../experiment/trialGenerator';
import { DEFAULT_CONFIG } from '../experiment/experimentConfig';
import type { ExperimentConfig } from '../types/experiment';

const testConfig: ExperimentConfig = {
  ...DEFAULT_CONFIG,
  DEFAULT_NO_GO_COLOR: 'RED',
};

describe('generateTrialSequenceWithConfig — Main Task', () => {
  it('generates exactly NUMBER_OF_TRIALS trials', () => {
    const trials = generateTrialSequenceWithConfig(testConfig, 42, false);
    expect(trials.length).toBe(testConfig.NUMBER_OF_TRIALS);
  });

  it('GO/NO-GO ratio is approximately correct', () => {
    const trials = generateTrialSequenceWithConfig(testConfig, 42, false);
    const nGo = trials.filter(t => t.trial_type === 'GO').length;
    const nNoGo = trials.filter(t => t.trial_type === 'NO_GO').length;
    const targetGo = Math.round(testConfig.NUMBER_OF_TRIALS * testConfig.GO_PROPORTION);
    const targetNoGo = testConfig.NUMBER_OF_TRIALS - targetGo;

    expect(Math.abs(nGo - targetGo)).toBeLessThanOrEqual(2);
    expect(Math.abs(nNoGo - targetNoGo)).toBeLessThanOrEqual(2);
  });

  it('never exceeds MAX_CONSECUTIVE_NOGO consecutive NO-GO trials', () => {
    // Test across multiple seeds
    for (let seed = 0; seed < 20; seed++) {
      const trials = generateTrialSequenceWithConfig(testConfig, seed * 1000, false);
      let maxRun = 0;
      let run = 0;
      for (const t of trials) {
        if (t.trial_type === 'NO_GO') {
          run++;
          maxRun = Math.max(maxRun, run);
        } else {
          run = 0;
        }
      }
      expect(maxRun).toBeLessThanOrEqual(testConfig.MAX_CONSECUTIVE_NOGO);
    }
  });

  it('same seed produces identical sequence (reproducibility)', () => {
    const seed = 999999;
    const t1 = generateTrialSequenceWithConfig(testConfig, seed, false);
    const t2 = generateTrialSequenceWithConfig(testConfig, seed, false);
    expect(t1.map(t => t.trial_type)).toEqual(t2.map(t => t.trial_type));
    expect(t1.map(t => t.stimulus_color)).toEqual(t2.map(t => t.stimulus_color));
  });

  it('different seeds produce different sequences', () => {
    const t1 = generateTrialSequenceWithConfig(testConfig, 1, false);
    const t2 = generateTrialSequenceWithConfig(testConfig, 2, false);
    // Statistically certain to differ
    const seq1 = t1.map(t => t.trial_type).join('');
    const seq2 = t2.map(t => t.trial_type).join('');
    expect(seq1).not.toBe(seq2);
  });

  it('NO-GO trials use the configured NO-GO color', () => {
    const trials = generateTrialSequenceWithConfig(testConfig, 42, false);
    const noGoTrials = trials.filter(t => t.trial_type === 'NO_GO');
    for (const t of noGoTrials) {
      expect(t.stimulus_color).toBe('RED');
    }
  });

  it('GO trials only use GO colors (not NO-GO color)', () => {
    const trials = generateTrialSequenceWithConfig(testConfig, 42, false);
    const goTrials = trials.filter(t => t.trial_type === 'GO');
    for (const t of goTrials) {
      expect(t.stimulus_color).not.toBe('RED');
      expect(['BLUE', 'GREEN', 'YELLOW']).toContain(t.stimulus_color);
    }
  });

  it('trial numbers are sequential starting at 1', () => {
    const trials = generateTrialSequenceWithConfig(testConfig, 42, false);
    trials.forEach((t, i) => {
      expect(t.trial_number).toBe(i + 1);
    });
  });

  it('main trials are marked is_practice = false', () => {
    const trials = generateTrialSequenceWithConfig(testConfig, 42, false);
    for (const t of trials) {
      expect(t.is_practice).toBe(false);
    }
  });

  it('passes validateSequence', () => {
    const trials = generateTrialSequenceWithConfig(testConfig, 42, false);
    const result = validateSequence(trials, testConfig, false);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });
});

describe('generateTrialSequenceWithConfig — Practice Block', () => {
  it('generates exactly PRACTICE_TRIALS trials', () => {
    const trials = generateTrialSequenceWithConfig(testConfig, 43, true);
    expect(trials.length).toBe(testConfig.PRACTICE_TRIALS);
  });

  it('practice trials are marked is_practice = true', () => {
    const trials = generateTrialSequenceWithConfig(testConfig, 43, true);
    for (const t of trials) {
      expect(t.is_practice).toBe(true);
    }
  });

  it('practice max consecutive NO-GO respected', () => {
    for (let seed = 0; seed < 10; seed++) {
      const trials = generateTrialSequenceWithConfig(testConfig, seed * 100, true);
      let run = 0;
      for (const t of trials) {
        if (t.trial_type === 'NO_GO') {
          run++;
          expect(run).toBeLessThanOrEqual(testConfig.MAX_CONSECUTIVE_NOGO);
        } else {
          run = 0;
        }
      }
    }
  });
});

describe('generateTrialSequenceWithConfig — Color change', () => {
  it('respects a different NO-GO color (BLUE)', () => {
    const blueConfig: ExperimentConfig = { ...testConfig, DEFAULT_NO_GO_COLOR: 'BLUE' };
    const trials = generateTrialSequenceWithConfig(blueConfig, 42, false);
    const noGoTrials = trials.filter(t => t.trial_type === 'NO_GO');
    for (const t of noGoTrials) {
      expect(t.stimulus_color).toBe('BLUE');
    }
    const goTrials = trials.filter(t => t.trial_type === 'GO');
    for (const t of goTrials) {
      expect(t.stimulus_color).not.toBe('BLUE');
    }
  });
});
