/**
 * Experiment Types — Odd-One-Out Symbol Selection Task
 *
 * All shared TypeScript types for the ODD-ONE-OUT task.
 * Mirrors the NO-GO task's type architecture but adapted for grid-based selection.
 *
 * Version: 1.0.0
 */

// ─── Symbol System ────────────────────────────────────────────────────────────

/**
 * Each SymbolFamily defines a pair: (distractor, oddSymbol).
 * Exactly one symbol in the grid differs from all others.
 */
export type SymbolFamilyName =
  | 'CIRCLE_FILL'      // ○ vs ●  (open circle vs filled circle)
  | 'ARROW_VERTICAL'   // ↑ vs ↓  (up arrow vs down arrow)
  | 'TRIANGLE'         // △ vs ▽  (upward vs downward triangle)
  | 'SQUARE_DIAMOND'   // □ vs ◇  (square vs diamond)
  | 'ARROW_HORIZONTAL' // ← vs →  (left vs right arrow)
  | 'LINE_ORIENTATION' // ─ vs │  (horizontal vs vertical line)
  | 'CROSS_PLUS'       // + vs ×  (plus vs cross)
  | 'STAR_VARIANTS';   // ☆ vs ★  (open vs filled star)

export interface SymbolPair {
  family: SymbolFamilyName;
  /** Unicode character or SVG string representing the distractor (majority symbol) */
  distractor: string;
  /** Unicode character or SVG string representing the odd symbol (minority symbol) */
  oddSymbol: string;
  /** Human-readable description for logging */
  description: string;
}

// ─── Acquisition / Device Status ──────────────────────────────────────────────

export type AcquisitionMode =
  | 'FULL_MULTIMODAL'   // Camera + GSR + Game (full experiment)
  | 'CAMERA_GAME_TEST'  // Camera + Game only (no GSR)
  | 'GAME_ONLY_TEST'    // Game only (no hardware) — NOT for real sessions
  // The two modes below exist only when launched by the experiment controller
  // (python -m experiment run); they are not offered on the stand-alone welcome screen.
  | 'SHIMMER_GAME_TEST'      // GSR + Game (no camera)
  | 'MOCK_INTEGRATION_TEST'; // mock camera + simulated GSR — NO real data

export type DeviceStatus =
  | 'UNKNOWN'
  | 'CONNECTED'
  | 'RECORDING'
  | 'STOPPED'
  | 'ERROR'
  | 'NOT_CONFIGURED';

export interface AcquisitionStatus {
  /** Acquisition mode selected by operator */
  mode: AcquisitionMode;
  /** Camera/OBS status */
  camera: {
    status: DeviceStatus;
    recordingStarted: boolean;
    recordingStartTimestamp: string | null;
    recordingStopTimestamp: string | null;
    outputFile: string | null;
    error: string | null;
  };
  /** Shimmer GSR status */
  gsr: {
    status: DeviceStatus;
    recordingStarted: boolean;
    recordingStartTimestamp: string | null;
    recordingStopTimestamp: string | null;
    outputFile: string | null;
    error: string | null;
  };
  /** Thermal camera — external device, no direct control */
  thermal: {
    status: DeviceStatus;
    note: string;
  };
}

// ─── Application Screen States ────────────────────────────────────────────────

export type AppScreen =
  | 'WELCOME'
  | 'SETUP'
  | 'READINESS_CHECK'
  | 'INSTRUCTIONS'
  | 'PRACTICE'
  | 'PRACTICE_COMPLETE'
  | 'MAIN_TASK'
  | 'COMPLETION'
  | 'EXPORT';

export type TrialPhase =
  | 'IDLE'
  | 'FIXATION'
  | 'STIMULUS'
  | 'ITI'
  | 'COMPLETE';

// ─── Event Types ──────────────────────────────────────────────────────────────

export type EventType =
  // Session lifecycle
  | 'SESSION_CREATED'
  | 'EXPERIMENT_ARMED'
  | 'EXPERIMENT_LOADED'
  | 'PARTICIPANT_STARTED'
  | 'INSTRUCTIONS_STARTED'
  | 'PRACTICE_STARTED'
  | 'PRACTICE_COMPLETED'
  | 'MAIN_TASK_STARTED'
  | 'MAIN_TASK_START'
  | 'MAIN_TASK_COMPLETED'
  | 'MAIN_TASK_END'
  | 'EXPERIMENT_COMPLETED'
  | 'EXPERIMENT_ABORTED'
  // Trial lifecycle
  | 'TRIAL_START'
  | 'TRIAL_FIXATION_ONSET'
  | 'FIXATION_START'
  | 'TRIAL_STIMULUS_ONSET'
  | 'STIMULUS_ONSET'
  | 'TRIAL_RESPONSE'
  | 'RESPONSE_RECEIVED'
  | 'STIMULUS_OFFSET'
  | 'TRIAL_COMPLETED'
  | 'TRIAL_END'
  | 'PREMATURE_RESPONSE'
  | 'EARLY_RESPONSE'
  // Camera (OBS)
  | 'CAMERA_START_REQUESTED'
  | 'CAMERA_RECORDING_CONFIRMED'
  | 'CAMERA_STOP_REQUESTED'
  | 'CAMERA_RECORDING_STOPPED'
  // GSR (Shimmer)
  | 'GSR_START_REQUESTED'
  | 'GSR_RECORDING_CONFIRMED'
  | 'GSR_STOP_REQUESTED'
  | 'GSR_RECORDING_STOPPED'
  // Synchronization
  | 'SYNC_MARKER_ONSET'
  | 'SYNC_MARKER_OFFSET'
  | 'BASELINE_STARTED'
  | 'BASELINE_COMPLETED'
  | 'THERMAL_CONDITION_MARKER'
  | 'REST_STARTED'
  | 'REST_COMPLETED'
  // Errors and state
  | 'DEVICE_ERROR'
  | 'CAMERA_CONNECTION_REQUESTED'
  | 'CAMERA_CONNECTED'
  // Experiment-controller integration (src/integration/)
  | 'ORCHESTRATOR_CONNECTED'
  | 'SYNC_SEQUENCE_STARTED'
  | 'SYNC_SEQUENCE_COMPLETED'
  | 'FULLSCREEN_ENTERED'
  | 'FULLSCREEN_EXITED'
  | 'VISIBILITY_CHANGE';

// ─── Configuration ────────────────────────────────────────────────────────────

export interface ExperimentConfig {
  /** Application version for reproducibility tracking */
  APP_VERSION: string;
  /** Experiment protocol version */
  EXPERIMENT_VERSION: string;

  // ── Grid parameters ──────────────────────────────────────────────────────
  /** Number of grid rows */
  GRID_ROWS: number;
  /** Number of grid columns */
  GRID_COLS: number;
  /** Total symbols = GRID_ROWS × GRID_COLS */
  TOTAL_SYMBOLS: number;
  /** Number of odd symbols per trial (must always be 1) */
  ODD_SYMBOL_COUNT: number;
  /** Cell size in pixels (symbol rendering area) */
  CELL_SIZE_PX: number;
  /** Gap between cells in pixels */
  CELL_GAP_PX: number;

  // ── Trial counts ──────────────────────────────────────────────────────────
  /** Number of main-task trials */
  NUMBER_OF_TRIALS: number;
  /** Number of practice trials */
  PRACTICE_TRIALS: number;

  // ── Timing (ms) ───────────────────────────────────────────────────────────
  /** Duration of fixation cross display */
  FIXATION_DURATION_MS: number;
  /** Response window (stimulus display duration) */
  RESPONSE_WINDOW_MS: number;
  /** Inter-trial interval */
  ITI_DURATION_MS: number;
  /** Pre-task delay after START button (ms) */
  PRE_TASK_DELAY_MS: number;
  /** Practice feedback display duration (ms) */
  PRACTICE_FEEDBACK_DURATION_MS: number;

  // ── Randomization ─────────────────────────────────────────────────────────
  /** Symbol families enabled for this experiment */
  ENABLED_SYMBOL_FAMILIES: SymbolFamilyName[];
  /** Max consecutive trials with same symbol family */
  MAX_CONSECUTIVE_SAME_FAMILY: number;

  // ── RT flags (raw RT always preserved) ───────────────────────────────────
  /** RT below this value flagged as anticipatory */
  RT_MIN_VALID_MS: number;
  /** RT above this value flagged as near window boundary */
  RT_MAX_VALID_MS: number;

  // ── Synchronization markers ────────────────────────────────────────────────
  /** Whether sync markers are enabled */
  SYNC_MARKERS_ENABLED: boolean;
  /** Duration of sync marker display (ms) */
  SYNC_MARKER_DURATION_MS: number;

  // ── Feedback ──────────────────────────────────────────────────────────────
  /** Show correctness feedback during practice */
  PRACTICE_FEEDBACK_ENABLED: boolean;
  /** Show correctness feedback during main task (must be false for research) */
  MAIN_TASK_FEEDBACK_ENABLED: boolean;
}

// ─── Session Metadata ─────────────────────────────────────────────────────────

export interface SessionMetadata {
  participant_id: string;
  session_id: string;
  thermal_condition_id: string;
  temperature_celsius: number | null;
  block_id: string;
  notes: string;
  acquisition_mode: AcquisitionMode;
  random_seed: number;

  experiment_start_wallclock: string;
  experiment_start_perf: number;
  experiment_end_wallclock: string | null;
  experiment_end_perf: number | null;

  app_version: string;
  experiment_version: string;

  /** True if this is a test session, not a real research recording */
  is_test_session: boolean;
}

// ─── Trial Definition ─────────────────────────────────────────────────────────

/** Generated trial specification (before timing data is added) */
export interface TrialDefinition {
  trial_id: string;
  trial_number: number;
  symbol_family: SymbolFamilyName;
  distractor_symbol: string;
  odd_symbol: string;
  grid_rows: number;
  grid_cols: number;
  /** Row index (0-based) of the odd symbol */
  target_row: number;
  /** Column index (0-based) of the odd symbol */
  target_col: number;
  difficulty_condition: string;
  random_seed: number;
  is_practice: boolean;
}

// ─── Trial Response ───────────────────────────────────────────────────────────

export type ResponseModality = 'MOUSE' | 'KEYBOARD' | null;
export type TrialStatus = 'CORRECT' | 'INCORRECT' | 'OMISSION' | 'ABORTED';

// ─── Trial Record (with timing) ───────────────────────────────────────────────

export interface TrialData {
  // Session context
  participant_id: string;
  session_id: string;
  condition_id: string;
  block_id: string;
  is_practice: boolean;
  random_seed: number;

  // Trial identity (from TrialDefinition)
  trial_number: number;
  trial_id: string;
  symbol_family: SymbolFamilyName;
  distractor_symbol: string;
  odd_symbol: string;
  grid_rows: number;
  grid_columns: number;
  target_row: number;
  target_column: number;
  difficulty_condition: string;

  // Timestamps — monotonic (performance.now epoch, ms)
  fixation_onset_perf: number | null;
  stimulus_onset_perf: number | null;
  stimulus_offset_perf: number | null;
  response_timestamp_perf: number | null;
  premature_response_perf: number | null;

  // Timestamps — wall-clock (ISO 8601)
  fixation_onset_wallclock: string | null;
  stimulus_onset_wallclock: string | null;
  stimulus_offset_wallclock: string | null;
  response_timestamp_wallclock: string | null;

  // Timing diagnostics
  expected_fixation_duration_ms: number;
  actual_fixation_duration_ms: number | null;
  timing_deviation_fixation_ms: number | null;

  // Response
  responded: boolean;
  response_modality: ResponseModality;
  selected_row: number | null;
  selected_col: number | null;
  correct: boolean;
  omission: boolean;
  premature_response: boolean;
  trial_status: TrialStatus;

  // RT
  reaction_time_ms: number | null;
  rt_valid: boolean | null;
  rt_exclusion_reason: string | null;

  // Trial boundaries
  trial_start_perf: number | null;
  trial_end_perf: number | null;
}

// ─── Experiment Event ─────────────────────────────────────────────────────────

export interface ExperimentEvent {
  event_id: string;
  event_sequence: number;
  event_type: EventType;
  /** performance.now() at event time */
  timestamp_perf: number;
  /** ISO 8601 wall-clock equivalent */
  timestamp_wallclock: string;
  trial_number: number | null;
  detail: Record<string, unknown> | null;
  acquisition_status?: Partial<AcquisitionStatus>;
}

// ─── Summary Statistics ───────────────────────────────────────────────────────

export interface SummaryStatistics {
  total_trials: number;
  completed_trials: number;
  correct_trials: number;
  incorrect_trials: number;
  omission_count: number;
  valid_response_count: number;

  accuracy: number | null;
  omission_rate: number | null;

  mean_rt_ms: number | null;
  median_rt_ms: number | null;
  std_rt_ms: number | null;
  fastest_rt_ms: number | null;
  slowest_rt_ms: number | null;
  valid_rt_count: number;

  /** Per-family accuracy breakdown */
  accuracy_by_family: Record<string, number | null>;

  acquisition_status_summary: {
    camera_recorded: boolean;
    gsr_recorded: boolean;
    session_complete: boolean;
  };
}

// ─── Session Export ───────────────────────────────────────────────────────────

export interface SessionExport {
  metadata: SessionMetadata;
  configuration: ExperimentConfig;
  randomization: {
    seed: number;
    algorithm: string;
    note: string;
  };
  acquisition_status: AcquisitionStatus;
  events: ExperimentEvent[];
  trials: TrialData[];
  summary: SummaryStatistics;
}
