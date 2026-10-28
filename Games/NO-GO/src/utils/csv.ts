/**
 * CSV Utility
 *
 * Converts trial data to CSV format with proper escaping.
 * One row per trial. Null values are exported as empty strings.
 *
 * Column order is fixed — do not reorder, as downstream analysis scripts
 * may rely on positional parsing.
 *
 * New columns added for Advanced mode support (always present; null in standard mode):
 *   experiment_mode, no_go_color_1, no_go_color_2
 */

import type { TrialData } from '../types/experiment';

const CSV_COLUMNS: (keyof TrialData)[] = [
  // ── Session metadata ─────────────────────────────────────────────────────
  'participant_id',
  'session_id',
  'thermal_condition',
  'block_id',
  'is_practice',
  'random_seed',
  'experiment_mode',    // 'standard' | 'advanced'
  'no_go_color_1',      // always present
  'no_go_color_2',      // null in standard mode; second NO-GO color in advanced mode

  // ── Trial identity ───────────────────────────────────────────────────────
  'trial_number',
  'stimulus_color',
  'trial_type',

  // ── Timestamps (performance.now relative, ms) ────────────────────────────
  'fixation_onset_perf',
  'fixation_onset_wallclock',
  'stimulus_onset_perf',
  'stimulus_onset_wallclock',
  'stimulus_offset_perf',
  'stimulus_offset_wallclock',
  'response_timestamp_perf',
  'response_timestamp_wallclock',
  'early_response_timestamp_perf',

  // ── Response ─────────────────────────────────────────────────────────────
  'responded',
  'reaction_time_ms',
  'correct',
  'error_type',
  'early_response',

  // ── RT quality flags ──────────────────────────────────────────────────────
  'rt_valid',
  'rt_exclusion_reason',

  // ── Trial boundaries ──────────────────────────────────────────────────────
  'trial_start_timestamp_perf',
  'trial_end_timestamp_perf',
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
