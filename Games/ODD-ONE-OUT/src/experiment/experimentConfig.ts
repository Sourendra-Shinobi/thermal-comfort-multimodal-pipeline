/**
 * Experiment Configuration — Odd-One-Out Symbol Selection Task
 *
 * SINGLE SOURCE OF TRUTH for all experimental parameters.
 * Do not scatter these values throughout the codebase.
 *
 * These are INITIAL SOFTWARE DEFAULTS, not finalized experimental parameters.
 * Change them here after pilot testing and supervisor review.
 *
 * Version: 1.0.0
 */

import type { ExperimentConfig, SymbolFamilyName } from '../types/experiment';

export const ALL_SYMBOL_FAMILIES: SymbolFamilyName[] = [
  'CIRCLE_FILL',
  'ARROW_VERTICAL',
  'TRIANGLE',
  'SQUARE_DIAMOND',
  'ARROW_HORIZONTAL',
  'LINE_ORIENTATION',
  'CROSS_PLUS',
  'STAR_VARIANTS',
];

export const DEFAULT_CONFIG: ExperimentConfig = {
  // ── Versioning ────────────────────────────────────────────────────────────
  APP_VERSION: '1.0.0',
  EXPERIMENT_VERSION: '1.0.0',

  // ── Grid parameters ───────────────────────────────────────────────────────
  GRID_ROWS: 4,
  GRID_COLS: 4,
  TOTAL_SYMBOLS: 16,       // Must equal GRID_ROWS × GRID_COLS
  ODD_SYMBOL_COUNT: 1,     // Exactly one odd symbol — never change this
  CELL_SIZE_PX: 80,
  CELL_GAP_PX: 12,

  // ── Trial counts ──────────────────────────────────────────────────────────
  NUMBER_OF_TRIALS: 10,
  PRACTICE_TRIALS: 3,

  // ── Timing (ms) ───────────────────────────────────────────────────────────
  FIXATION_DURATION_MS: 400,
  RESPONSE_WINDOW_MS: 3000,  // 3-second response window
  ITI_DURATION_MS: 500,
  PRE_TASK_DELAY_MS: 2000,
  PRACTICE_FEEDBACK_DURATION_MS: 1000,

  // ── Randomization ─────────────────────────────────────────────────────────
  ENABLED_SYMBOL_FAMILIES: ALL_SYMBOL_FAMILIES,
  MAX_CONSECUTIVE_SAME_FAMILY: 3,

  // ── RT quality flags ──────────────────────────────────────────────────────
  RT_MIN_VALID_MS: 150,    // < 150ms flagged as anticipatory
  RT_MAX_VALID_MS: 4800,   // > 4800ms flagged as near window boundary

  // ── Synchronization markers ────────────────────────────────────────────────
  SYNC_MARKERS_ENABLED: true,
  SYNC_MARKER_DURATION_MS: 500,

  // ── Feedback (scientific defaults) ────────────────────────────────────────
  PRACTICE_FEEDBACK_ENABLED: true,
  MAIN_TASK_FEEDBACK_ENABLED: false,  // Must NOT show feedback in main task
};
