/**
 * Test Suite: Summary Statistics
 * 
 * Tests all 15 summary statistics computed by computeSummary().
 */

import { describe, it, expect } from 'vitest';
import { computeSummary } from '../utils/statistics';
import type { TrialData } from '../types/experiment';

function makeTrial(overrides: Partial<TrialData>): TrialData {
  return {
    participant_id: 'P001',
    session_id: 'S01',
    thermal_condition: 'Neutral',
    block_id: '1',
    is_practice: false,
    random_seed: 42,
    experiment_mode: 'standard',
    no_go_color_1: 'RED',
    no_go_color_2: null,
    trial_number: 1,
    stimulus_color: 'BLUE',
    trial_type: 'GO',
    fixation_onset_perf: 0,
    stimulus_onset_perf: 400,
    stimulus_offset_perf: 1400,
    response_timestamp_perf: 700,
    early_response_timestamp_perf: null,
    fixation_onset_wallclock: null,
    stimulus_onset_wallclock: null,
    stimulus_offset_wallclock: null,
    response_timestamp_wallclock: null,
    responded: true,
    reaction_time_ms: 300,
    correct: true,
    error_type: null,
    early_response: false,
    rt_valid: true,
    rt_exclusion_reason: null,
    trial_start_timestamp_perf: 0,
    trial_end_timestamp_perf: 1800,
    ...overrides,
  };
}

describe('computeSummary', () => {
  it('excludes practice trials', () => {
    const trials = [
      makeTrial({ is_practice: true, trial_number: 1 }),
      makeTrial({ is_practice: false, trial_number: 2 }),
    ];
    const summary = computeSummary(trials);
    expect(summary.total_trials).toBe(1);
  });

  it('counts GO and NO-GO correctly', () => {
    const trials = [
      makeTrial({ trial_type: 'GO', trial_number: 1 }),
      makeTrial({ trial_type: 'GO', trial_number: 2 }),
      makeTrial({ trial_type: 'NO_GO', stimulus_color: 'RED', trial_number: 3, responded: false, correct: true, reaction_time_ms: null, rt_valid: null }),
    ];
    const summary = computeSummary(trials);
    expect(summary.total_go_trials).toBe(2);
    expect(summary.total_no_go_trials).toBe(1);
  });

  it('calculates GO accuracy correctly', () => {
    const trials = [
      makeTrial({ trial_number: 1, correct: true }),
      makeTrial({ trial_number: 2, correct: true }),
      makeTrial({ trial_number: 3, correct: false, responded: false, error_type: 'omission' }),
      makeTrial({ trial_number: 4, correct: false, responded: false, error_type: 'omission' }),
    ];
    const summary = computeSummary(trials);
    expect(summary.go_accuracy).toBe(0.5);
  });

  it('calculates NO-GO accuracy (correct rejections)', () => {
    const trials = [
      makeTrial({ trial_number: 1, trial_type: 'NO_GO', stimulus_color: 'RED', responded: false, correct: true, reaction_time_ms: null, error_type: null, rt_valid: null }),
      makeTrial({ trial_number: 2, trial_type: 'NO_GO', stimulus_color: 'RED', responded: true, correct: false, reaction_time_ms: 250, error_type: 'commission', rt_valid: true }),
    ];
    const summary = computeSummary(trials);
    expect(summary.no_go_accuracy).toBe(0.5);
  });

  it('calculates RT statistics from valid GO RTs only', () => {
    const trials = [
      makeTrial({ trial_number: 1, reaction_time_ms: 200, rt_valid: true }),
      makeTrial({ trial_number: 2, reaction_time_ms: 400, rt_valid: true }),
      makeTrial({ trial_number: 3, reaction_time_ms: 600, rt_valid: true }),
      makeTrial({ trial_number: 4, reaction_time_ms: 50, rt_valid: false, rt_exclusion_reason: 'too fast' }), // excluded
    ];
    const summary = computeSummary(trials);
    expect(summary.valid_go_rt_count).toBe(3);
    expect(summary.mean_go_rt_ms).toBeCloseTo(400, 0);
    expect(summary.median_go_rt_ms).toBe(400);
    expect(summary.fastest_go_rt_ms).toBe(200);
    expect(summary.slowest_go_rt_ms).toBe(600);
  });

  it('returns null for RT stats when no valid RTs', () => {
    const trials = [
      makeTrial({ trial_number: 1, trial_type: 'NO_GO', stimulus_color: 'RED', responded: false, correct: true, reaction_time_ms: null, rt_valid: null }),
    ];
    const summary = computeSummary(trials);
    expect(summary.mean_go_rt_ms).toBeNull();
    expect(summary.median_go_rt_ms).toBeNull();
    expect(summary.valid_go_rt_count).toBe(0);
  });

  it('calculates omission rate', () => {
    const trials = [
      makeTrial({ trial_number: 1, responded: true, correct: true }),
      makeTrial({ trial_number: 2, responded: false, correct: false, reaction_time_ms: null, error_type: 'omission', rt_valid: null }),
      makeTrial({ trial_number: 3, responded: false, correct: false, reaction_time_ms: null, error_type: 'omission', rt_valid: null }),
      makeTrial({ trial_number: 4, responded: true, correct: true }),
    ];
    const summary = computeSummary(trials);
    expect(summary.go_omission_rate).toBe(0.5);
  });

  it('calculates commission rate', () => {
    const trials = [
      makeTrial({ trial_number: 1, trial_type: 'NO_GO', stimulus_color: 'RED', responded: true, correct: false, reaction_time_ms: 250, error_type: 'commission', rt_valid: true }),
      makeTrial({ trial_number: 2, trial_type: 'NO_GO', stimulus_color: 'RED', responded: false, correct: true, reaction_time_ms: null, error_type: null, rt_valid: null }),
      makeTrial({ trial_number: 3, trial_type: 'NO_GO', stimulus_color: 'RED', responded: false, correct: true, reaction_time_ms: null, error_type: null, rt_valid: null }),
      makeTrial({ trial_number: 4, trial_type: 'NO_GO', stimulus_color: 'RED', responded: false, correct: true, reaction_time_ms: null, error_type: null, rt_valid: null }),
    ];
    const summary = computeSummary(trials);
    expect(summary.no_go_commission_rate).toBe(0.25);
  });
});
