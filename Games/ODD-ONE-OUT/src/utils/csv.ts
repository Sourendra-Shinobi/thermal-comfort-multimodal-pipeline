/**
 * CSV Utility — Odd-One-Out Task
 *
 * Converts trial data to CSV format with proper escaping.
 * One row per trial. Null values exported as empty strings.
 *
 * Column order is fixed — downstream analysis scripts may rely on
 * positional or name-based parsing.
 */

import type { TrialData } from '../types/experiment';

const CSV_COLUMNS: (keyof TrialData)[] = [
  // ── Session metadata ─────────────────────────────────────────────────────
  'participant_id',
  'session_id',
  'condition_id',
  'block_id',
  'is_practice',
  'random_seed',

  // ── Trial identity ───────────────────────────────────────────────────────
  'trial_number',
  'trial_id',
  'symbol_family',
  'distractor_symbol',
  'odd_symbol',
  'grid_rows',
  'grid_columns',
  'target_row',
  'target_column',
  'difficulty_condition',

  // ── Timestamps — monotonic (ms from perf epoch) ──────────────────────────
  'fixation_onset_perf',
  'stimulus_onset_perf',
  'stimulus_offset_perf',
  'response_timestamp_perf',
  'premature_response_perf',

  // ── Timestamps — wall-clock (ISO 8601) ───────────────────────────────────
  'fixation_onset_wallclock',
  'stimulus_onset_wallclock',
  'stimulus_offset_wallclock',
  'response_timestamp_wallclock',

  // ── Timing diagnostics ────────────────────────────────────────────────────
  'expected_fixation_duration_ms',
  'actual_fixation_duration_ms',
  'timing_deviation_fixation_ms',

  // ── Response ─────────────────────────────────────────────────────────────
  'responded',
  'response_modality',
  'selected_row',
  'selected_col',
  'correct',
  'omission',
  'premature_response',
  'trial_status',

  // ── RT ───────────────────────────────────────────────────────────────────
  'reaction_time_ms',
  'rt_valid',
  'rt_exclusion_reason',

  // ── Trial boundaries ──────────────────────────────────────────────────────
  'trial_start_perf',
  'trial_end_perf',
];

function escapeCSV(value: unknown): string {
  if (value === null || value === undefined) return '';
  const str = String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function trialsToCSV(trials: TrialData[]): string {
  const header = CSV_COLUMNS.join(',');
  const rows = trials.map(trial =>
    CSV_COLUMNS.map(col => escapeCSV(trial[col])).join(',')
  );
  return [header, ...rows].join('\r\n');
}

export { CSV_COLUMNS };
