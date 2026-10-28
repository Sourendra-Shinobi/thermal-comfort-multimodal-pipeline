/**
 * Trial Engine — Odd-One-Out Task
 *
 * React hook managing the fixation → stimulus → ITI trial cycle for grid-based
 * symbol selection.
 *
 * TIMING PRINCIPLE (identical to NO-GO task):
 * - All timestamps use performance.now() at the actual moment of the event.
 * - RAF-based loop gates phase transitions, so the recorded stimulus onset
 *   timestamp is the actual frame when it first appeared.
 * - RT = response_timestamp_perf − stimulus_onset_perf
 *
 * RESPONSE HANDLING:
 * - Mouse click on a grid cell records (row, col) and response time.
 * - Keyboard: arrow keys to navigate, Enter/Space to confirm.
 * - Only the FIRST valid response counts per trial.
 * - Clicks outside the grid are ignored.
 * - Responses during fixation are logged as premature but do not count.
 * - No response before the deadline → omission.
 *
 * DESIGN CONSTRAINTS:
 * - No feedback during main task.
 * - No score, no progress bar.
 * - Grid geometry is fixed per trial (does not move/resize).
 */

import { useCallback, useRef, useState } from 'react';
import type {
  TrialData,
  TrialDefinition,
  TrialPhase,
  SessionMetadata,
  ExperimentConfig,
  ResponseModality,
  TrialStatus,
} from '../types/experiment';
import { perfNow, toWallclock } from '../utils/timestamps';
import { eventLogger } from './eventLogger';
import { checkAnswer } from './trialGenerator';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface TrialEngineState {
  phase: TrialPhase;
  currentTrialIndex: number;
  currentTrial: TrialDefinition | null;
  isRunning: boolean;
  isComplete: boolean;
  /** Currently keyboard-navigated cell (for accessibility) */
  keyboardCursorRow: number;
  keyboardCursorCol: number;
  /** Has the participant selected a cell this trial? */
  selectedRow: number | null;
  selectedCol: number | null;
}

export interface UseTrialEngineReturn {
  state: TrialEngineState;
  completedTrials: TrialData[];
  startTrials: () => void;
  abortTrials: () => void;
  /** Called by SymbolGrid component when participant clicks a cell */
  handleCellClick: (row: number, col: number) => void;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useTrialEngine(
  trials: TrialDefinition[],
  metadata: SessionMetadata,
  config: ExperimentConfig,
  isPractice: boolean,
  onTrialComplete?: (trial: TrialData) => void,
  onComplete?: (trials: TrialData[]) => void
): UseTrialEngineReturn {
  const [state, setState] = useState<TrialEngineState>({
    phase: 'IDLE',
    currentTrialIndex: -1,
    currentTrial: null,
    isRunning: false,
    isComplete: false,
    keyboardCursorRow: 0,
    keyboardCursorCol: 0,
    selectedRow: null,
    selectedCol: null,
  });

  const completedTrialsRef = useRef<TrialData[]>([]);
  const abortedRef = useRef(false);
  const rafRef = useRef<number | null>(null);
  const keydownHandlerRef = useRef<((e: KeyboardEvent) => void) | null>(null);

  // Per-trial mutable state (not in React state to avoid re-render lag)
  const ts = useRef({
    trialStartPerf: 0 as number,
    fixationOnsetPerf: null as number | null,
    stimulusOnsetPerf: null as number | null,
    stimulusOffsetPerf: null as number | null,
    responsePerf: null as number | null,
    prematureResponsePerf: null as number | null,
    selectedRow: null as number | null,
    selectedCol: null as number | null,
    responded: false,
    prematureResponse: false,
    responseModality: null as ResponseModality,
    responseProcessed: false, // prevents duplicate responses
    phase: 'IDLE' as TrialPhase,
    trialIndex: -1,
    keyboardRow: 0,
    keyboardCol: 0,
  });

  // ─── Cell click handler (exposed to SymbolGrid) ───────────────────────────

  const handleCellClick = useCallback((row: number, col: number) => {
    const t = ts.current;
    if (t.phase !== 'STIMULUS') return;
    if (t.responseProcessed) return; // Only first response counts

    t.responseProcessed = true;
    t.responded = true;
    t.responsePerf = perfNow();
    t.responseModality = 'MOUSE';
    t.selectedRow = row;
    t.selectedCol = col;

    eventLogger.emit(
      'TRIAL_RESPONSE',
      {
        trial_index: t.trialIndex,
        selected_row: row,
        selected_col: col,
        modality: 'MOUSE',
      },
      t.trialIndex + 1
    );

    // Update React state to show selection highlight
    setState(prev => ({ ...prev, selectedRow: row, selectedCol: col }));
  }, []);

  // ─── Keyboard handler ──────────────────────────────────────────────────────

  const handleKeydown = useCallback((e: KeyboardEvent) => {
    const t = ts.current;

    if (t.phase === 'FIXATION') {
      // Premature response during fixation
      if (['Enter', ' ', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
        e.preventDefault();
        if (!t.prematureResponse) {
          t.prematureResponse = true;
          t.prematureResponsePerf = perfNow();
          eventLogger.emit(
            'PREMATURE_RESPONSE',
            { trial_index: t.trialIndex },
            t.trialIndex + 1
          );
        }
      }
      return;
    }

    if (t.phase !== 'STIMULUS') return;

    const rows = trials[t.trialIndex]?.grid_rows ?? config.GRID_ROWS;
    const cols = trials[t.trialIndex]?.grid_cols ?? config.GRID_COLS;

    // Arrow key navigation
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      t.keyboardRow = Math.max(0, t.keyboardRow - 1);
      setState(prev => ({ ...prev, keyboardCursorRow: t.keyboardRow }));
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      t.keyboardRow = Math.min(rows - 1, t.keyboardRow + 1);
      setState(prev => ({ ...prev, keyboardCursorRow: t.keyboardRow }));
      return;
    }
    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      t.keyboardCol = Math.max(0, t.keyboardCol - 1);
      setState(prev => ({ ...prev, keyboardCursorCol: t.keyboardCol }));
      return;
    }
    if (e.key === 'ArrowRight') {
      e.preventDefault();
      t.keyboardCol = Math.min(cols - 1, t.keyboardCol + 1);
      setState(prev => ({ ...prev, keyboardCursorCol: t.keyboardCol }));
      return;
    }

    // Enter or Space to confirm keyboard selection
    if ((e.key === 'Enter' || e.key === ' ') && !t.responseProcessed) {
      e.preventDefault();
      t.responseProcessed = true;
      t.responded = true;
      t.responsePerf = perfNow();
      t.responseModality = 'KEYBOARD';
      t.selectedRow = t.keyboardRow;
      t.selectedCol = t.keyboardCol;

      eventLogger.emit(
        'TRIAL_RESPONSE',
        {
          trial_index: t.trialIndex,
          selected_row: t.keyboardRow,
          selected_col: t.keyboardCol,
          modality: 'KEYBOARD',
        },
        t.trialIndex + 1
      );

      setState(prev => ({
        ...prev,
        selectedRow: t.keyboardRow,
        selectedCol: t.keyboardCol,
      }));
    }
  }, [trials, config.GRID_ROWS, config.GRID_COLS]);

  // ─── Trial runner ─────────────────────────────────────────────────────────

  const runTrial = useCallback((trialIndex: number) => {
    if (abortedRef.current) return;
    if (trialIndex >= trials.length) {
      // All trials complete
      setState(prev => ({
        ...prev,
        phase: 'COMPLETE',
        isRunning: false,
        isComplete: true,
        currentTrial: null,
      }));
      eventLogger.emit(isPractice ? 'PRACTICE_COMPLETED' : 'MAIN_TASK_END');
      if (onComplete) onComplete([...completedTrialsRef.current]);
      return;
    }

    const trial = trials[trialIndex];

    // Reset per-trial state
    const t = ts.current;
    t.trialStartPerf = perfNow();
    t.fixationOnsetPerf = null;
    t.stimulusOnsetPerf = null;
    t.stimulusOffsetPerf = null;
    t.responsePerf = null;
    t.prematureResponsePerf = null;
    t.selectedRow = null;
    t.selectedCol = null;
    t.responded = false;
    t.prematureResponse = false;
    t.responseModality = null;
    t.responseProcessed = false;
    t.phase = 'FIXATION';
    t.trialIndex = trialIndex;
    // Reset keyboard cursor to top-left for each trial
    t.keyboardRow = 0;
    t.keyboardCol = 0;

    eventLogger.emit('TRIAL_START', { trial_id: trial.trial_id }, trialIndex + 1);

    // ── Phase: FIXATION ────────────────────────────────────────────────────
    rafRef.current = requestAnimationFrame(() => {
      if (abortedRef.current) return;
      t.fixationOnsetPerf = perfNow();

      eventLogger.emit(
        'TRIAL_FIXATION_ONSET',
        { trial_id: trial.trial_id },
        trialIndex + 1
      );

      setState({
        phase: 'FIXATION',
        currentTrialIndex: trialIndex,
        currentTrial: trial,
        isRunning: true,
        isComplete: false,
        keyboardCursorRow: 0,
        keyboardCursorCol: 0,
        selectedRow: null,
        selectedCol: null,
      });

      const fixationEnd = t.fixationOnsetPerf + config.FIXATION_DURATION_MS;

      // ── Phase: STIMULUS ────────────────────────────────────────────────
      const waitForStimulus = () => {
        if (abortedRef.current) return;
        if (perfNow() < fixationEnd) {
          rafRef.current = requestAnimationFrame(waitForStimulus);
          return;
        }

        rafRef.current = requestAnimationFrame(() => {
          if (abortedRef.current) return;
          t.stimulusOnsetPerf = perfNow();
          t.phase = 'STIMULUS';

          const expectedStimulusOnset = fixationEnd;
          const actualStimulusOnset = t.stimulusOnsetPerf;
          const timingDeviation = actualStimulusOnset - expectedStimulusOnset;

          eventLogger.emit(
            'TRIAL_STIMULUS_ONSET',
            {
              trial_id: trial.trial_id,
              expected_onset: expectedStimulusOnset,
              actual_onset: actualStimulusOnset,
              timing_deviation_ms: timingDeviation,
              symbol_family: trial.symbol_family,
              target_row: trial.target_row,
              target_col: trial.target_col,
            },
            trialIndex + 1
          );

          setState(prev => ({
            ...prev,
            phase: 'STIMULUS',
            selectedRow: null,
            selectedCol: null,
          }));

          const stimulusEnd = t.stimulusOnsetPerf + config.RESPONSE_WINDOW_MS;

          // ── Phase: ITI (after response window) ────────────────────────
          const waitForITI = () => {
            if (abortedRef.current) return;
            if (perfNow() < stimulusEnd) {
              rafRef.current = requestAnimationFrame(waitForITI);
              return;
            }

            rafRef.current = requestAnimationFrame(() => {
              if (abortedRef.current) return;
              t.stimulusOffsetPerf = perfNow();
              t.phase = 'ITI';

              eventLogger.emit(
                'STIMULUS_OFFSET',
                { trial_id: trial.trial_id },
                trialIndex + 1
              );

              // Build trial record
              const trialRecord = buildTrialRecord(
                trial,
                metadata,
                config,
                t.trialStartPerf,
                t.fixationOnsetPerf!,
                t.stimulusOnsetPerf!,
                t.stimulusOffsetPerf!,
                t.responsePerf,
                t.prematureResponsePerf,
                t.responded,
                t.prematureResponse,
                t.selectedRow,
                t.selectedCol,
                t.responseModality,
                isPractice
              );

              completedTrialsRef.current.push(trialRecord);
              if (onTrialComplete) onTrialComplete(trialRecord);

              eventLogger.emit(
                'TRIAL_COMPLETED',
                {
                  trial_id: trial.trial_id,
                  correct: trialRecord.correct,
                  omission: trialRecord.omission,
                  rt_ms: trialRecord.reaction_time_ms,
                },
                trialIndex + 1
              );

              setState(prev => ({ ...prev, phase: 'ITI' }));

              // Wait for ITI then advance
              const itiEnd = t.stimulusOffsetPerf + config.ITI_DURATION_MS;

              const waitForNextTrial = () => {
                if (abortedRef.current) return;
                if (perfNow() < itiEnd) {
                  rafRef.current = requestAnimationFrame(waitForNextTrial);
                  return;
                }
                runTrial(trialIndex + 1);
              };
              rafRef.current = requestAnimationFrame(waitForNextTrial);
            });
          };

          rafRef.current = requestAnimationFrame(waitForITI);
        });
      };

      rafRef.current = requestAnimationFrame(waitForStimulus);
    });
  }, [trials, metadata, config, isPractice, onTrialComplete, onComplete]);

  // ─── Public API ───────────────────────────────────────────────────────────

  const startTrials = useCallback(() => {
    abortedRef.current = false;
    completedTrialsRef.current = [];

    const handler = (e: KeyboardEvent) => handleKeydown(e);
    keydownHandlerRef.current = handler;
    window.addEventListener('keydown', handler);

    eventLogger.emit(isPractice ? 'PRACTICE_STARTED' : 'MAIN_TASK_START');
    runTrial(0);
  }, [handleKeydown, isPractice, runTrial]);

  const abortTrials = useCallback(() => {
    abortedRef.current = true;
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (keydownHandlerRef.current) {
      window.removeEventListener('keydown', keydownHandlerRef.current);
      keydownHandlerRef.current = null;
    }
    eventLogger.emit('EXPERIMENT_ABORTED');
    setState(prev => ({ ...prev, isRunning: false, phase: 'IDLE' }));
  }, []);

  return {
    state,
    completedTrials: completedTrialsRef.current,
    startTrials,
    abortTrials,
    handleCellClick,
  };
}

// ─── Build Trial Record ────────────────────────────────────────────────────────

function buildTrialRecord(
  trial: TrialDefinition,
  metadata: SessionMetadata,
  config: ExperimentConfig,
  trialStartPerf: number,
  fixationOnsetPerf: number,
  stimulusOnsetPerf: number,
  stimulusOffsetPerf: number,
  responsePerf: number | null,
  prematureResponsePerf: number | null,
  responded: boolean,
  prematureResponse: boolean,
  selectedRow: number | null,
  selectedCol: number | null,
  responseModality: ResponseModality,
  isPractice: boolean
): TrialData {
  const reactionTime =
    responded && responsePerf !== null
      ? responsePerf - stimulusOnsetPerf
      : null;

  const correct =
    responded &&
    selectedRow !== null &&
    selectedCol !== null &&
    checkAnswer(trial, selectedRow, selectedCol);

  const omission = !responded;

  let trialStatus: TrialStatus;
  if (omission) trialStatus = 'OMISSION';
  else if (correct) trialStatus = 'CORRECT';
  else trialStatus = 'INCORRECT';

  // RT quality flags
  let rtValid: boolean | null = null;
  let rtExclusionReason: string | null = null;
  if (reactionTime !== null) {
    const rtMs = reactionTime; // already in ms (perfNow units)
    if (rtMs < config.RT_MIN_VALID_MS) {
      rtValid = false;
      rtExclusionReason = `RT < ${config.RT_MIN_VALID_MS}ms (anticipatory)`;
    } else if (rtMs > config.RT_MAX_VALID_MS) {
      rtValid = false;
      rtExclusionReason = `RT > ${config.RT_MAX_VALID_MS}ms (near window boundary)`;
    } else {
      rtValid = true;
    }
  }

  // Timing diagnostics
  const actualFixationDuration =
    stimulusOnsetPerf - fixationOnsetPerf;
  const timingDeviationFixation =
    actualFixationDuration - config.FIXATION_DURATION_MS;

  return {
    participant_id: metadata.participant_id,
    session_id: metadata.session_id,
    condition_id: metadata.thermal_condition_id,
    block_id: metadata.block_id,
    is_practice: isPractice,
    random_seed: metadata.random_seed,

    trial_number: trial.trial_number,
    trial_id: trial.trial_id,
    symbol_family: trial.symbol_family,
    distractor_symbol: trial.distractor_symbol,
    odd_symbol: trial.odd_symbol,
    grid_rows: trial.grid_rows,
    grid_columns: trial.grid_cols,
    target_row: trial.target_row,
    target_column: trial.target_col,
    difficulty_condition: trial.difficulty_condition,

    fixation_onset_perf: fixationOnsetPerf,
    stimulus_onset_perf: stimulusOnsetPerf,
    stimulus_offset_perf: stimulusOffsetPerf,
    response_timestamp_perf: responsePerf,
    premature_response_perf: prematureResponsePerf,

    fixation_onset_wallclock: toWallclock(fixationOnsetPerf),
    stimulus_onset_wallclock: toWallclock(stimulusOnsetPerf),
    stimulus_offset_wallclock: toWallclock(stimulusOffsetPerf),
    response_timestamp_wallclock: responsePerf !== null ? toWallclock(responsePerf) : null,

    expected_fixation_duration_ms: config.FIXATION_DURATION_MS,
    actual_fixation_duration_ms: actualFixationDuration,
    timing_deviation_fixation_ms: timingDeviationFixation,

    responded,
    response_modality: responseModality,
    selected_row: selectedRow,
    selected_col: selectedCol,
    correct,
    omission,
    premature_response: prematureResponse,
    trial_status: trialStatus,

    reaction_time_ms: reactionTime !== null ? Math.round(reactionTime * 1000) / 1000 : null,
    rt_valid: rtValid,
    rt_exclusion_reason: rtExclusionReason,

    trial_start_perf: trialStartPerf,
    trial_end_perf: stimulusOffsetPerf + config.ITI_DURATION_MS,
  };
}
