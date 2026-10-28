import { describe, it, expect } from 'vitest';
import { generateTrialSequence, validateTrialSequence, checkAnswer } from '../experiment/trialGenerator';
import { DEFAULT_CONFIG } from '../experiment/experimentConfig';

describe('Trial Generator — Odd-One-Out Task', () => {
  it('generates the configured number of main trials', () => {
    const trials = generateTrialSequence(DEFAULT_CONFIG, 12345, false);
    expect(trials.length).toBe(DEFAULT_CONFIG.NUMBER_OF_TRIALS);
  });

  it('generates the configured number of practice trials', () => {
    const trials = generateTrialSequence(DEFAULT_CONFIG, 12345, true);
    expect(trials.length).toBe(DEFAULT_CONFIG.PRACTICE_TRIALS);
  });

  it('produces 100% deterministic sequences given identical seeds', () => {
    const t1 = generateTrialSequence(DEFAULT_CONFIG, 42, false);
    const t2 = generateTrialSequence(DEFAULT_CONFIG, 42, false);

    expect(t1.map(t => t.trial_id)).toEqual(t2.map(t => t.trial_id));
    expect(t1.map(t => `${t.target_row},${t.target_col}`)).toEqual(
      t2.map(t => `${t.target_row},${t.target_col}`)
    );
    expect(t1.map(t => t.symbol_family)).toEqual(t2.map(t => t.symbol_family));
  });

  it('produces different sequences with different seeds', () => {
    const t1 = generateTrialSequence(DEFAULT_CONFIG, 101, false);
    const t2 = generateTrialSequence(DEFAULT_CONFIG, 202, false);

    const positions1 = t1.map(t => `${t.target_row},${t.target_col}`).join('|');
    const positions2 = t2.map(t => `${t.target_row},${t.target_col}`).join('|');
    expect(positions1).not.toBe(positions2);
  });

  it('passes validateTrialSequence with 0 errors', () => {
    const trials = generateTrialSequence(DEFAULT_CONFIG, 8888, false);
    const res = validateTrialSequence(trials, DEFAULT_CONFIG, false);
    expect(res.valid).toBe(true);
    expect(res.errors).toHaveLength(0);
  });

  it('evaluates checkAnswer correctly', () => {
    const trial = generateTrialSequence(DEFAULT_CONFIG, 7777, false)[0];
    expect(checkAnswer(trial, trial.target_row, trial.target_col)).toBe(true);
    expect(checkAnswer(trial, (trial.target_row + 1) % DEFAULT_CONFIG.GRID_ROWS, trial.target_col)).toBe(false);
  });
});
