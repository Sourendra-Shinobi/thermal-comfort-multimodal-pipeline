/**
 * Statistics Utility — Odd-One-Out Task
 *
 * Computes descriptive statistics over completed trial data.
 * Does NOT perform inferential statistical testing.
 * All raw data is preserved; this function only computes summaries.
 * Outliers are flagged, not removed.
 */

import type { TrialData, SummaryStatistics, SymbolFamilyName } from '../types/experiment';

export function computeSummary(
  trials: TrialData[],
  acquisitionSummary: {
    camera_recorded: boolean;
    gsr_recorded: boolean;
    session_complete: boolean;
  }
): SummaryStatistics {
  // Only use main trials for summary (exclude practice)
  const mainTrials = trials.filter(t => !t.is_practice);

  const completedTrials = mainTrials.filter(t => t.trial_status !== 'ABORTED');
  const correctTrials = completedTrials.filter(t => t.correct);
  const incorrectTrials = completedTrials.filter(t => !t.correct && !t.omission);
  const omissions = completedTrials.filter(t => t.omission);

  const validResponses = completedTrials.filter(t => t.responded);

  const accuracy =
    completedTrials.length > 0
      ? correctTrials.length / completedTrials.length
      : null;

  const omissionRate =
    completedTrials.length > 0
      ? omissions.length / completedTrials.length
      : null;

  // RT statistics: only from valid correct responses
  const validRTs = completedTrials
    .filter(t => t.correct && t.rt_valid === true && t.reaction_time_ms !== null)
    .map(t => t.reaction_time_ms as number);

  // Per-family accuracy
  const families = [...new Set(mainTrials.map(t => t.symbol_family))] as SymbolFamilyName[];
  const accuracyByFamily: Record<string, number | null> = {};
  for (const family of families) {
    const familyTrials = completedTrials.filter(t => t.symbol_family === family);
    accuracyByFamily[family] =
      familyTrials.length > 0
        ? familyTrials.filter(t => t.correct).length / familyTrials.length
        : null;
  }

  return {
    total_trials: mainTrials.length,
    completed_trials: completedTrials.length,
    correct_trials: correctTrials.length,
    incorrect_trials: incorrectTrials.length,
    omission_count: omissions.length,
    valid_response_count: validResponses.length,

    accuracy: round2(accuracy),
    omission_rate: round2(omissionRate),

    mean_rt_ms: validRTs.length > 0 ? roundHundredths(mean(validRTs)) : null,
    median_rt_ms: validRTs.length > 0 ? roundHundredths(median(validRTs)) : null,
    std_rt_ms: validRTs.length > 1 ? roundHundredths(standardDeviation(validRTs)) : null,
    fastest_rt_ms: validRTs.length > 0 ? Math.min(...validRTs) : null,
    slowest_rt_ms: validRTs.length > 0 ? Math.max(...validRTs) : null,
    valid_rt_count: validRTs.length,

    accuracy_by_family: accuracyByFamily,

    acquisition_status_summary: acquisitionSummary,
  };
}

// ─── Math Helpers ─────────────────────────────────────────────────────────────

function mean(values: number[]): number {
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

function standardDeviation(values: number[]): number {
  const m = mean(values);
  const variance = values.reduce((sum, v) => sum + (v - m) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
}

function round2(value: number | null): number | null {
  return value !== null ? Math.round(value * 10000) / 10000 : null;
}

function roundHundredths(value: number): number {
  return Math.round(value * 100) / 100;
}
