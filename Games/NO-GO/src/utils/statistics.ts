/**
 * Summary Statistics Calculator
 * 
 * Computes descriptive statistics over the completed trial set.
 * Does NOT perform inferential statistical testing.
 * All raw data is preserved; flags suspicious RTs but does not delete them.
 */

import type { TrialData, SummaryStatistics } from '../types/experiment';

export function computeSummary(trials: TrialData[]): SummaryStatistics {
  // Exclude practice trials
  const mainTrials = trials.filter(t => !t.is_practice);

  const goTrials = mainTrials.filter(t => t.trial_type === 'GO');
  const noGoTrials = mainTrials.filter(t => t.trial_type === 'NO_GO');

  // GO accuracy: correct GO responses / total GO trials
  const correctGo = goTrials.filter(t => t.correct).length;
  const goAccuracy = goTrials.length > 0 ? correctGo / goTrials.length : null;

  // NO-GO accuracy: correct rejections / total NO-GO trials
  const correctNoGo = noGoTrials.filter(t => t.correct).length;
  const noGoAccuracy = noGoTrials.length > 0 ? correctNoGo / noGoTrials.length : null;

  // Overall accuracy
  const totalCorrect = mainTrials.filter(t => t.correct).length;
  const overallAccuracy = mainTrials.length > 0 ? totalCorrect / mainTrials.length : null;

  // Omission rate: GO trials where participant did not respond
  const goOmissions = goTrials.filter(t => t.error_type === 'omission').length;
  const goOmissionRate = goTrials.length > 0 ? goOmissions / goTrials.length : null;

  // Commission rate: NO-GO trials where participant responded
  const noGoCommissions = noGoTrials.filter(t => t.error_type === 'commission').length;
  const noGoCommissionRate = noGoTrials.length > 0 ? noGoCommissions / noGoTrials.length : null;

  // RT statistics: only from valid GO responses (rt_valid = true)
  const validGoRTs = goTrials
    .filter(t => t.rt_valid === true && t.reaction_time_ms !== null)
    .map(t => t.reaction_time_ms as number);

  const meanGoRt = validGoRTs.length > 0 ? mean(validGoRTs) : null;
  const medianGoRt = validGoRTs.length > 0 ? median(validGoRTs) : null;
  const stdGoRt = validGoRTs.length > 1 ? standardDeviation(validGoRTs) : null;
  const rtCV = meanGoRt !== null && stdGoRt !== null && meanGoRt > 0
    ? stdGoRt / meanGoRt
    : null;
  const fastestGoRt = validGoRTs.length > 0 ? Math.min(...validGoRTs) : null;
  const slowestGoRt = validGoRTs.length > 0 ? Math.max(...validGoRTs) : null;

  return {
    total_trials: mainTrials.length,
    total_go_trials: goTrials.length,
    total_no_go_trials: noGoTrials.length,

    go_accuracy: round2(goAccuracy),
    no_go_accuracy: round2(noGoAccuracy),
    overall_accuracy: round2(overallAccuracy),

    go_omission_rate: round2(goOmissionRate),
    no_go_commission_rate: round2(noGoCommissionRate),

    mean_go_rt_ms: meanGoRt !== null ? Math.round(meanGoRt * 100) / 100 : null,
    median_go_rt_ms: medianGoRt !== null ? Math.round(medianGoRt * 100) / 100 : null,
    std_go_rt_ms: stdGoRt !== null ? Math.round(stdGoRt * 100) / 100 : null,
    rt_coefficient_of_variation: rtCV !== null ? Math.round(rtCV * 10000) / 10000 : null,
    fastest_go_rt_ms: fastestGoRt,
    slowest_go_rt_ms: slowestGoRt,
    valid_go_rt_count: validGoRTs.length,
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
