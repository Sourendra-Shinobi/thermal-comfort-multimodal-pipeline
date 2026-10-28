/**
 * ExperimentScreen Component
 * 
 * Runs the main 150-trial experiment.
 * 
 * CRITICAL CONSTRAINTS:
 * - NO feedback during trials (no "Correct!", "Wrong!", score, etc.)
 * - NO visible progress indicator
 * - NO distracting UI elements
 * - Only fixation cross, stimulus circle, or blank screen visible
 * - ESC aborts the experiment
 * - Fullscreen exit triggers abort + logging
 * - Tab visibility change is logged
 */

import React, { useEffect, useCallback, useState } from 'react';
import type { TrialData, TrialDefinition, SessionMetadata, ExperimentConfig } from '../types/experiment';
import { useTrialEngine } from '../experiment/trialEngine';
import { eventLogger } from '../experiment/eventLogger';

interface ExperimentScreenProps {
  trials: TrialDefinition[];
  metadata: SessionMetadata;
  config: ExperimentConfig;
  onComplete: (mainTrials: TrialData[]) => void;
  onAbort: (partialTrials: TrialData[]) => void;
}

const COLOR_CSS: Record<string, string> = {
  RED: '#e53e3e',
  BLUE: '#3182ce',
  GREEN: '#38a169',
  YELLOW: '#d69e2e',
};

type StartState = 'WAITING' | 'COUNTDOWN' | 'RUNNING';

export const ExperimentScreen: React.FC<ExperimentScreenProps> = ({
  trials,
  metadata,
  config,
  onComplete,
  onAbort,
}) => {
  const [startState, setStartState] = useState<StartState>('WAITING');
  const completedTrialsRef = React.useRef<TrialData[]>([]);

  const handleComplete = useCallback((mainTrials: TrialData[]) => {
    eventLogger.emit('MAIN_TASK_COMPLETED');
    onComplete(mainTrials);
  }, [onComplete]);

  const { state, startTrials, abortTrials } = useTrialEngine(
    trials,
    metadata,
    config,
    false, // isPractice = false
    undefined,
    handleComplete
  );

  // ── ESC to abort ───────────────────────────────────────────────────────────
  useEffect(() => {
    const handleKeydown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && startState === 'RUNNING') {
        e.preventDefault();
        abortTrials();
        onAbort(completedTrialsRef.current);
      }
    };
    window.addEventListener('keydown', handleKeydown);
    return () => window.removeEventListener('keydown', handleKeydown);
  }, [startState, abortTrials, onAbort]);

  // ── Fullscreen exit detection ──────────────────────────────────────────────
  useEffect(() => {
    const handleFullscreenChange = () => {
      if (!document.fullscreenElement && startState === 'RUNNING') {
        eventLogger.emit('FULLSCREEN_EXITED');
        abortTrials();
        onAbort(completedTrialsRef.current);
      }
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, [startState, abortTrials, onAbort]);

  // ── Tab visibility change ──────────────────────────────────────────────────
  useEffect(() => {
    const handleVisibility = () => {
      eventLogger.emit('VISIBILITY_CHANGE', {
        hidden: document.hidden,
        visibilityState: document.visibilityState,
      });
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, []);

  // ── Browser safety: prevent text selection and context menu ───────────────
  useEffect(() => {
    const preventSelect = (e: Event) => e.preventDefault();
    const preventContext = (e: MouseEvent) => e.preventDefault();
    document.addEventListener('selectstart', preventSelect);
    document.addEventListener('contextmenu', preventContext);
    return () => {
      document.removeEventListener('selectstart', preventSelect);
      document.removeEventListener('contextmenu', preventContext);
    };
  }, []);

  // ── Handle start ──────────────────────────────────────────────────────────
  const handleStart = useCallback(() => {
    setStartState('COUNTDOWN');
    eventLogger.emit('MAIN_TASK_STARTED');
    // Pre-task delay then begin
    setTimeout(() => {
      setStartState('RUNNING');
      startTrials();
    }, config.PRE_TASK_DELAY_MS);
  }, [config.PRE_TASK_DELAY_MS, startTrials]);

  // ── Pre-start screen ──────────────────────────────────────────────────────
  if (startState === 'WAITING') {
    return (
      <div className="screen task-screen" id="main-task-ready-screen">
        <div className="screen-content">
          <h1 className="screen-title">Ready</h1>
          <div className="main-task-briefing">
            <p>Practice is complete.</p>
            <p>The real task will now begin.</p>
            <p>There will be <strong>no feedback</strong> during the task.</p>
            <p>Please remain focused and respond as accurately and quickly as possible.</p>
          </div>
          <div className="button-group">
            <button
              id="btn-start-main-task"
              className="btn btn-primary"
              onClick={handleStart}
              type="button"
            >
              PRESS SPACEBAR OR CLICK START
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (startState === 'COUNTDOWN') {
    return (
      <div className="screen task-screen">
        <div className="task-area">
          <div className="fixation-cross" aria-hidden="true">+</div>
        </div>
      </div>
    );
  }

  // ── Main task running ──────────────────────────────────────────────────────
  const currentTrial = state.currentTrial;
  const phase = state.phase;

  return (
    <div
      className="screen task-screen main-task-running"
      id="main-task-screen"
      aria-label="Main experiment"
    >
      <div className="task-area">
        {/* Fixation cross */}
        {phase === 'FIXATION' && (
          <div className="fixation-cross" aria-hidden="true">+</div>
        )}

        {/* Stimulus circle — no labels, no indicators */}
        {phase === 'STIMULUS' && currentTrial && (
          <div
            className="stimulus-circle"
            style={{
              backgroundColor: COLOR_CSS[currentTrial.stimulus_color] || '#888',
              width: `${config.STIMULUS_SIZE_PX}px`,
              height: `${config.STIMULUS_SIZE_PX}px`,
            }}
            aria-hidden="true"
          />
        )}

        {/* ITI — completely blank */}
        {phase === 'ITI' && <div className="iti-blank" aria-hidden="true" />}

        {/* IDLE/COMPLETE — blank */}
        {(phase === 'IDLE' || phase === 'COMPLETE') && (
          <div aria-hidden="true" />
        )}
      </div>

      {/* ESC hint — small and unobtrusive, shown only to experimenter */}
      <div className="experimenter-hint" aria-hidden="true">
        ESC to abort
      </div>
    </div>
  );
};
