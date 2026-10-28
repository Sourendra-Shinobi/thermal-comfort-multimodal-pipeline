/**
 * Experiment Types
 * All shared TypeScript types for the NO-GO Color Inhibition Task.
 * 
 * Version: 1.0.0
 */

// ─── Enumerations ────────────────────────────────────────────────────────────

export type StimulusColor = 'RED' | 'BLUE' | 'GREEN' | 'YELLOW';
export type TrialType = 'GO' | 'NO_GO';
export type ErrorType = 'omission' | 'commission' | null;
export type ExperimentMode = 'standard' | 'advanced';

export type AppScreen =
  | 'WELCOME'
  | 'SETUP'
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

export type EventType =
  | 'EXPERIMENT_LOADED'
  | 'PARTICIPANT_STARTED'
  | 'INSTRUCTIONS_STARTED'
  | 'PRACTICE_STARTED'
  | 'PRACTICE_COMPLETED'
  | 'MAIN_TASK_STARTED'
  | 'MAIN_TASK_START'
  | 'TRIAL_START'
  | 'FIXATION_START'
  | 'STIMULUS_ONSET'
  | 'RESPONSE_RECEIVED'
  | 'STIMULUS_OFFSET'
  | 'TRIAL_END'
  | 'MAIN_TASK_COMPLETED'
  | 'MAIN_TASK_END'
  | 'EXPERIMENT_COMPLETED'
  | 'EXPERIMENT_ABORTED'
  | 'FULLSCREEN_ENTERED'
  | 'FULLSCREEN_EXITED'
  | 'VISIBILITY_CHANGE'
  | 'EARLY_RESPONSE'
  // Experiment-controller integration (src/integration/)
  | 'ORCHESTRATOR_CONNECTED'
  | 'SYNC_SEQUENCE_STARTED'
  | 'SYNC_MARKER_ONSET'
  | 'SYNC_MARKER_OFFSET'
  | 'SYNC_SEQUENCE_COMPLETED';

// ─── Configuration ────────────────────────────────────────────────────────────

export interface ExperimentConfig {
  /** Application version for reproducibility tracking */
  APP_VERSION: string;
  /** Experiment version for reproducibility tracking */
  EXPERIMENT_VERSION: string;

  /** Total main-task trials */
  NUMBER_OF_TRIALS: number;
  /** Fraction of trials that are GO (rest are NO-GO) */
  GO_PROPORTION: number;

  /** Duration of fixation cross in ms */
  FIXATION_DURATION_MS: number;
  /** Duration of stimulus in ms (= response window) */
  STIMULUS_DURATION_MS: number;
  /** Inter-trial interval in ms */
  ITI_DURATION_MS: number;

  /** Number of practice trials */
  PRACTICE_TRIALS: number;
  /** GO proportion in practice */
  PRACTICE_GO_PROPORTION: number;

  /** All available colors */
  STIMULUS_COLORS: StimulusColor[];
  /** Default NO-GO color — used in standard mode (single NO-GO) */
  DEFAULT_NO_GO_COLOR: StimulusColor;
  /** Default NO-GO colors — used in advanced mode (two NO-GO colors) */
  DEFAULT_NO_GO_COLORS: StimulusColor[];

  /** Default experiment mode */
  EXPERIMENT_MODE: ExperimentMode;

  /** Stimulus circle diameter in pixels */
  STIMULUS_SIZE_PX: number;

  /** Response key code (KeyboardEvent.code) */
  RESPONSE_KEY: string;

  /** Maximum consecutive NO-GO trials allowed during generation */
  MAX_CONSECUTIVE_NOGO: number;
  /** Minimum RT to flag as suspiciously fast (ms) — raw RT preserved regardless */
  RT_MIN_VALID_MS: number;
  /** Maximum RT to flag as suspiciously slow (ms) — raw RT preserved regardless */
  RT_MAX_VALID_MS: number;

  /** Delay after START button press before trial 1 begins (ms) */
  PRE_TASK_DELAY_MS: number;

  /** Practice feedback display duration (ms) */
  PRACTICE_FEEDBACK_DURATION_MS: number;
}

// ─── Session ─────────────────────────────────────────────────────────────────

export interface SessionMetadata {
  participant_id: string;
  session_id: string;
  thermal_condition: string;
  block_id: string;
  notes: string;

  experiment_mode: ExperimentMode;
  /**
   * All NO-GO colors.
   * Standard mode: one entry. Advanced mode: two entries.
   * Use no_go_colors[0] if you need the primary color.
   */
  no_go_colors: StimulusColor[];
  go_colors: StimulusColor[];
  random_seed: number;

  experiment_start_wallclock: string;
  experiment_start_perf: number;

  app_version: string;
  experiment_version: string;
}

// ─── Trial Definition ─────────────────────────────────────────────────────────

/** A trial in the generated sequence (before timing data is attached) */
export interface TrialDefinition {
  trial_number: number;
  stimulus_color: StimulusColor;
  trial_type: TrialType;
  is_practice: boolean;
}

// ─── Trial Record (logged, including timing) ──────────────────────────────────

export interface TrialData {
  // Session context
  participant_id: string;
  session_id: string;
  thermal_condition: string;
  block_id: string;
  is_practice: boolean;
  random_seed: number;
  experiment_mode: ExperimentMode;
  /** Primary NO-GO color (always populated; = no_go_color_2 sentinel 'NONE' in standard) */
  no_go_color_1: StimulusColor;
  /** Second NO-GO color — null in standard mode, populated in advanced mode */
  no_go_color_2: StimulusColor | null;

  // Trial identity
  trial_number: number;
  stimulus_color: StimulusColor;
  trial_type: TrialType;

  // High-resolution relative timestamps (ms from performance.now() epoch)
  fixation_onset_perf: number | null;
  stimulus_onset_perf: number | null;
  stimulus_offset_perf: number | null;
  response_timestamp_perf: number | null;
  early_response_timestamp_perf: number | null;

  // Wall-clock timestamps (ISO 8601)
  fixation_onset_wallclock: string | null;
  stimulus_onset_wallclock: string | null;
  stimulus_offset_wallclock: string | null;
  response_timestamp_wallclock: string | null;

  // Response data
  responded: boolean;
  reaction_time_ms: number | null;
  correct: boolean;
  error_type: ErrorType;
  early_response: boolean;

  // RT quality flags
  rt_valid: boolean | null;
  rt_exclusion_reason: string | null;

  // Trial boundaries
  trial_start_timestamp_perf: number | null;
  trial_end_timestamp_perf: number | null;
}

// ─── Event ───────────────────────────────────────────────────────────────────

export interface ExperimentEvent {
  event_type: EventType;
  /** performance.now() value at event time */
  timestamp_perf: number;
  /** ISO 8601 wall-clock equivalent */
  timestamp_wallclock: string;
  trial_number: number | null;
  detail: Record<string, unknown> | null;
}

// ─── Session Export ───────────────────────────────────────────────────────────

export interface SummaryStatistics {
  total_trials: number;
  total_go_trials: number;
  total_no_go_trials: number;

  go_accuracy: number | null;
  no_go_accuracy: number | null;
  overall_accuracy: number | null;

  go_omission_rate: number | null;
  no_go_commission_rate: number | null;

  mean_go_rt_ms: number | null;
  median_go_rt_ms: number | null;
  std_go_rt_ms: number | null;
  rt_coefficient_of_variation: number | null;
  fastest_go_rt_ms: number | null;
  slowest_go_rt_ms: number | null;
  valid_go_rt_count: number;
}

export interface SessionExport {
  metadata: SessionMetadata;
  configuration: ExperimentConfig;
  randomization: {
    seed: number;
    algorithm: string;
    note: string;
  };
  events: ExperimentEvent[];
  trials: TrialData[];
  summary: SummaryStatistics;
}
