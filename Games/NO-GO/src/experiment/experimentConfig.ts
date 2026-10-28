/**
 * Experiment Configuration
 * 
 * SINGLE SOURCE OF TRUTH for all experimental parameters.
 * Do not scatter these values throughout the codebase.
 * 
 * Version: 1.0.0
 */

import type { ExperimentConfig } from '../types/experiment';

export const DEFAULT_CONFIG: ExperimentConfig = {
  // ── Versioning ────────────────────────────────────────────────────────────
  APP_VERSION: '1.0.0',
  EXPERIMENT_VERSION: '1.0.0',

  // ── Trial counts ──────────────────────────────────────────────────────────
  NUMBER_OF_TRIALS: 20,
  GO_PROPORTION: 0.75,           // ≈ 112-113 GO, 37-38 NO-GO

  // ── Timing (milliseconds) ─────────────────────────────────────────────────
  FIXATION_DURATION_MS: 400,
  STIMULUS_DURATION_MS: 1000,
  ITI_DURATION_MS: 400,

  // ── Practice ──────────────────────────────────────────────────────────────
  PRACTICE_TRIALS: 10,
  PRACTICE_GO_PROPORTION: 0.75,  // ≈ 15 GO, 5 NO-GO

  // ── Stimulus ──────────────────────────────────────────────────────────────
  STIMULUS_COLORS: ['RED', 'BLUE', 'GREEN', 'YELLOW'],
  DEFAULT_NO_GO_COLOR: 'RED',           // Standard mode: one NO-GO color
  DEFAULT_NO_GO_COLORS: ['RED', 'BLUE'], // Advanced mode: two NO-GO colors
  STIMULUS_SIZE_PX: 160,

  // ── Mode ──────────────────────────────────────────────────────────────────
  EXPERIMENT_MODE: 'standard',

  // ── Response ──────────────────────────────────────────────────────────────
  RESPONSE_KEY: 'Space',         // KeyboardEvent.code

  // ── Randomization ─────────────────────────────────────────────────────────
  MAX_CONSECUTIVE_NOGO: 2,       // never more than 2 NO-GO in a row

  // ── RT quality flags (raw RT is always preserved) ─────────────────────────
  RT_MIN_VALID_MS: 150,          // < 150 ms flagged as anticipatory
  RT_MAX_VALID_MS: 950,          // > 950 ms flagged as approaching window boundary

  // ── Timing gaps ───────────────────────────────────────────────────────────
  PRE_TASK_DELAY_MS: 2000,       // pause after START before trial 1
  PRACTICE_FEEDBACK_DURATION_MS: 800,
};
