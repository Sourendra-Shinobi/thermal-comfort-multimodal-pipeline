/**
 * Trial Engine
 * 
 * React hook that manages the fixation → stimulus → ITI trial cycle.
 * 
 * TIMING PRINCIPLE:
 * - All timestamps are captured via performance.now() at the actual moment of
 *   the relevant event (not from the theoretical schedule).
 * - The trial loop uses requestAnimationFrame to gate phase transitions, ensuring
 *   the recorded stimulus onset timestamp is the actual frame when it first appeared.
 * - RT = response_timestamp_perf - stimulus_onset_perf (both from performance.now()).
 * 
 * KEYBOARD HANDLING:
 * - Only Space key is accepted.
 * - Auto-repeat is suppressed (only first keydown per trial counts).
 * - Premature responses (during fixation) are logged but do not affect the trial.
 * - Browser scrolling on Space is prevented.
 */

import { useCallback, useRef, useState } from 'react';
import type {
  TrialData,
  TrialDefinition,
  TrialPhase,
  SessionMetadata,
  ExperimentConfig,
} from '../types/experiment';
import { perfNow, toWallclock } from '../utils/timestamps';
import { eventLogger } from './eventLogger';

interface TrialEngineState {
  phase: TrialPhase;
  currentTrialIndex: number;
  currentTrial: TrialDefinition | null;
  isRunning: boolean;
  isComplete: boolean;
}

interface UseTrialEngineReturn {
  state: TrialEngineState;
  completedTrials: TrialData[];
  startTrials: () => void;
  abortTrials: () => void;
}

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
  });

  const completedTrialsRef = useRef<TrialData[]>([]);
  const abortedRef = useRef(false);
  const rafRef = useRef<number | null>(null);
  const keydownHandlerRef = useRef<((e: KeyboardEvent) => void) | null>(null);

  // Per-trial mutable state (not in React state to avoid re-render lag)
  const trialStateRef = useRef<{
    trialStartPerf: number;
    fixationOnsetPerf: number | null;
    stimulusOnsetPerf: number | null;
    stimulusOffsetPerf: number | null;
    responsePerf: number | null;
    earlyResponsePerf: number | null;
    responded: boolean;
    earlyResponse: boolean;
    keyProcessed: boolean; // prevent auto-repeat
    phase: TrialPhase;
    trialIndex: number;
  }>({
    trialStartPerf: 0,
    fixationOnsetPerf: null,
    stimulusOnsetPerf: null,
    stimulusOffsetPerf: null,
    responsePerf: null,
    earlyResponsePerf: null,
    responded: false,
    earlyResponse: false,
    keyProcessed: false,
    phase: 'IDLE',
    trialIndex: -1,
  });

  // ─── Keyboard handler ───────────────────────────────────────────────────────

  const handleKeydown = useCallback((e: KeyboardEvent) => {
    if (e.code !== config.RESPONSE_KEY) return;
    e.preventDefault(); // prevent browser scroll

    const ts = trialStateRef.current;

    if (ts.phase === 'FIXATION') {
      // Early response during fixation
      if (!ts.earlyResponse) {
        ts.earlyResponse = true;
        ts.earlyResponsePerf = perfNow();
        eventLogger.emit(
          'EARLY_RESPONSE',
          { trial_index: ts.trialIndex },
          ts.trialIndex + 1
        );
      }
      return;
    }

    if (ts.phase === 'STIMULUS') {
      // Only the first keydown per trial counts
      if (ts.keyProcessed) return;
      ts.keyProcessed = true;
      ts.responded = true;
      ts.responsePerf = perfNow();
      eventLogger.emit(
        'RESPONSE_RECEIVED',
        { trial_index: ts.trialIndex },
        ts.trialIndex + 1
      );
    }
  }, [config.RESPONSE_KEY]);

  // ─── Trial runner ───────────────────────────────────────────────────────────

  const runTrial = useCallback((trialIndex: number) => {
    if (abortedRef.current) return;
    if (trialIndex >= trials.length) {
      // All trials done
      setState(prev => ({ ...prev, phase: 'COMPLETE', isRunning: false, isComplete: true, currentTrial: null }));
      eventLogger.emit(isPractice ? 'PRACTICE_COMPLETED' : 'MAIN_TASK_END');
      if (onComplete) onComplete([...completedTrialsRef.current]);
      return;
    }

    const trial = trials[trialIndex];

    // Reset per-trial state
    const ts = trialStateRef.current;
    ts.trialStartPerf = perfNow();
    ts.fixationOnsetPerf = null;
    ts.stimulusOnsetPerf = null;
    ts.stimulusOffsetPerf = null;
    ts.responsePerf = null;
    ts.earlyResponsePerf = null;
    ts.responded = false;
    ts.earlyResponse = false;
    ts.keyProcessed = false;
    ts.phase = 'FIXATION';
    ts.trialIndex = trialIndex;

    eventLogger.emit('TRIAL_START', { trial_index: trialIndex }, trialIndex + 1);

    // ── Phase: FIXATION ──────────────────────────────────────────────────────
    // Record fixation onset at the next animation frame
    rafRef.current = requestAnimationFrame(() => {
      if (abortedRef.current) return;
      ts.fixationOnsetPerf = perfNow();
      eventLogger.emit('FIXATION_START', { trial_index: trialIndex }, trialIndex + 1);

      setState({
        phase: 'FIXATION',
        currentTrialIndex: trialIndex,
        currentTrial: trial,
        isRunning: true,
        isComplete: false,
      });

      const fixationEnd = ts.fixationOnsetPerf + config.FIXATION_DURATION_MS;

      // ── Phase: STIMULUS ────────────────────────────────────────────────────
      const waitForStimulus = () => {
        if (abortedRef.current) return;
        const now = perfNow();
        if (now < fixationEnd) {
          rafRef.current = requestAnimationFrame(waitForStimulus);
          return;
        }

        // Transition to stimulus at the exact animation frame boundary
        rafRef.current = requestAnimationFrame(() => {
          if (abortedRef.current) return;
          ts.stimulusOnsetPerf = perfNow();
          ts.phase = 'STIMULUS';
          eventLogger.emit('STIMULUS_ONSET', { trial_index: trialIndex, color: trial.stimulus_color }, trialIndex + 1);

          setState(prev => ({ ...prev, phase: 'STIMULUS' }));

          const stimulusEnd = ts.stimulusOnsetPerf + config.STIMULUS_DURATION_MS;

          // ── Phase: ITI (after stimulus) ──────────────────────────────────
          const waitForITI = () => {
            if (abortedRef.current) return;
            const now2 = perfNow();
            if (now2 < stimulusEnd) {
              rafRef.current = requestAnimationFrame(waitForITI);
              return;
            }

            // Stimulus has ended — record offset
            rafRef.current = requestAnimationFrame(() => {
              if (abortedRef.current) return;
              ts.stimulusOffsetPerf = perfNow();
              ts.phase = 'ITI';
              eventLogger.emit('STIMULUS_OFFSET', { trial_index: trialIndex }, trialIndex + 1);

              setState(prev => ({ ...prev, phase: 'ITI' }));

              // Build the trial record
              const trialRecord = buildTrialRecord(
                trial,
                metadata,
                config,
                ts.trialStartPerf,
                ts.fixationOnsetPerf!,
                ts.stimulusOnsetPerf!,
                ts.stimulusOffsetPerf!,
                ts.responsePerf,
                ts.earlyResponsePerf,
                ts.responded,
                ts.earlyResponse,
                isPractice
              );

              completedTrialsRef.current.push(trialRecord);
              if (onTrialComplete) onTrialComplete(trialRecord);

              eventLogger.emit('TRIAL_END', { trial_index: trialIndex }, trialIndex + 1);

              // Wait for ITI then advance
              const itiEnd = ts.stimulusOffsetPerf + config.ITI_DURATION_MS;

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

  // ─── Public API ─────────────────────────────────────────────────────────────

  const startTrials = useCallback(() => {
    abortedRef.current = false;
    completedTrialsRef.current = [];

    // Register keyboard listener
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

  // Clean up on unmount
  const cleanup = useCallback(() => {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    if (keydownHandlerRef.current) {
      window.removeEventListener('keydown', keydownHandlerRef.current);
    }
  }, []);

  // Expose cleanup via ref for parent to call
  useCallback(() => cleanup, [cleanup]);

  return {
    state,
    completedTrials: completedTrialsRef.current,
    startTrials,
    abortTrials,
  };
}

// ─── Build Trial Record ───────────────────────────────────────────────────────

function buildTrialRecord(
  trial: TrialDefinition,
  metadata: SessionMetadata,
  config: ExperimentConfig,
  trialStartPerf: number,
  fixationOnsetPerf: number,
  stimulusOnsetPerf: number,
  stimulusOffsetPerf: number,
  responsePerf: number | null,
  earlyResponsePerf: number | null,
  responded: boolean,
  earlyResponse: boolean,
  isPractice: boolean
): TrialData {
  const reactionTime =
    responded && responsePerf !== null
      ? responsePerf - stimulusOnsetPerf
      : null;

  const isGoTrial = trial.trial_type === 'GO';
  const correct = isGoTrial ? responded : !responded;
  const errorType = isGoTrial
    ? responded ? null : 'omission'
    : responded ? 'commission' : null;

  // RT quality flags
  let rtValid: boolean | null = null;
  let rtExclusionReason: string | null = null;
  if (reactionTime !== null) {
    if (reactionTime < config.RT_MIN_VALID_MS) {
      rtValid = false;
      rtExclusionReason = `RT < ${config.RT_MIN_VALID_MS}ms (anticipatory)`;
    } else if (reactionTime > config.RT_MAX_VALID_MS) {
      rtValid = false;
      rtExclusionReason = `RT > ${config.RT_MAX_VALID_MS}ms (near window boundary)`;
    } else {
      rtValid = true;
    }
  }

  return {
    participant_id: metadata.participant_id,
    session_id: metadata.session_id,
    thermal_condition: metadata.thermal_condition,
    block_id: metadata.block_id,
    is_practice: isPractice,
    random_seed: metadata.random_seed,
    experiment_mode: metadata.experiment_mode,
    no_go_color_1: metadata.no_go_colors[0],
    no_go_color_2: metadata.no_go_colors.length > 1 ? metadata.no_go_colors[1] : null,

    trial_number: trial.trial_number,
    stimulus_color: trial.stimulus_color,
    trial_type: trial.trial_type,

    fixation_onset_perf: fixationOnsetPerf,
    stimulus_onset_perf: stimulusOnsetPerf,
    stimulus_offset_perf: stimulusOffsetPerf,
    response_timestamp_perf: responsePerf,
    early_response_timestamp_perf: earlyResponsePerf,

    fixation_onset_wallclock: toWallclock(fixationOnsetPerf),
    stimulus_onset_wallclock: toWallclock(stimulusOnsetPerf),
    stimulus_offset_wallclock: toWallclock(stimulusOffsetPerf),
    response_timestamp_wallclock: responsePerf !== null ? toWallclock(responsePerf) : null,

    responded,
    reaction_time_ms: reactionTime !== null ? Math.round(reactionTime * 1000) / 1000 : null,
    correct,
    error_type: errorType as import('../types/experiment').ErrorType,
    early_response: earlyResponse,

    rt_valid: rtValid,
    rt_exclusion_reason: rtExclusionReason,

    trial_start_timestamp_perf: trialStartPerf,
    trial_end_timestamp_perf: stimulusOffsetPerf + config.ITI_DURATION_MS,
  };
}
