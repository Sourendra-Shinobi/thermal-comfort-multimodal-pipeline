/**
 * ExperimentScreen Component — Odd-One-Out Task
 *
 * Runs the main experiment block.
 *
 * CRITICAL CONSTRAINTS:
 * - NO feedback during trials (no "Correct!", "Wrong!", score, etc.)
 * - NO visible progress indicator
 * - NO distracting UI elements
 * - Only fixation cross, symbol grid, or blank screen visible
 * - ESC aborts the experiment
 * - Fullscreen exit triggers abort + logging
 * - Tab visibility change is logged
 * - Sync marker overlay shown if enabled
 */

import React, { useEffect, useCallback, useState, useRef } from 'react';
import type { TrialData, TrialDefinition, SessionMetadata, ExperimentConfig } from '../types/experiment';
import { useTrialEngine } from '../experiment/trialEngine';
import { eventLogger } from '../experiment/eventLogger';
import { SymbolGrid } from './SymbolGrid';
import { SyncMarkerOverlay } from './SyncMarkerOverlay';

interface ExperimentScreenProps {
  trials: TrialDefinition[];
  metadata: SessionMetadata;
  config: ExperimentConfig;
  onComplete: (mainTrials: TrialData[]) => void;
  onAbort: (partialTrials: TrialData[]) => void;
}

type StartState = 'WAITING' | 'COUNTDOWN' | 'RUNNING';

export const ExperimentScreen: React.FC<ExperimentScreenProps> = ({
  trials,
  metadata,
  config,
  onComplete,
  onAbort,
}) => {
  const [startState, setStartState] = useState<StartState>('WAITING');
  const completedTrialsRef = useRef<TrialData[]>([]);

  const handleTrialComplete = useCallback((trial: TrialData) => {
    completedTrialsRef.current.push(trial);
  }, []);

  const handleComplete = useCallback((mainTrials: TrialData[]) => {
    eventLogger.emit('MAIN_TASK_COMPLETED');
    onComplete(mainTrials);
  }, [onComplete]);

  const { state, startTrials, abortTrials, handleCellClick } = useTrialEngine(
    trials,
    metadata,
    config,
    false, // isPractice = false
    handleTrialComplete,
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
    setTimeout(() => {
      setStartState('RUNNING');
      startTrials();
    }, config.PRE_TASK_DELAY_MS);
  }, [config.PRE_TASK_DELAY_MS, startTrials]);

  // Keyboard shortcut (Space/Enter) on pre-start screen
  useEffect(() => {
    if (startState !== 'WAITING') return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.code === 'Space' || e.key === 'Enter') {
        e.preventDefault();
        handleStart();
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [startState, handleStart]);

  // ── Pre-start screen ──────────────────────────────────────────────────────
  if (startState === 'WAITING') {
    return (
      <div className="screen task-screen" id="main-task-ready-screen">
        <div className="screen-content">
          <h1 className="screen-title">Ready</h1>
          <div className="main-task-briefing">
            <p>Practice is complete.</p>
            <p>The main task will now begin ({trials.length} trials).</p>
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
  const { currentTrial, phase, keyboardCursorRow, keyboardCursorCol, selectedRow, selectedCol } = state;

  return (
    <div
      className="screen task-screen main-task-running"
      id="main-task-screen"
      aria-label="Main experiment"
    >
      {/* Synchronization marker overlay (if enabled) */}
      <SyncMarkerOverlay
        visible={config.SYNC_MARKERS_ENABLED && phase === 'STIMULUS'}
        markerType="WHITE"
        durationMs={config.SYNC_MARKER_DURATION_MS}
      />

      <div className="task-area">
        {/* Fixation cross */}
        {phase === 'FIXATION' && (
          <div className="fixation-cross" aria-hidden="true">+</div>
        )}

        {/* Stimulus grid — no labels, no indicators, no correctness feedback */}
        {phase === 'STIMULUS' && currentTrial && (
          <SymbolGrid
            trial={currentTrial}
            cellSizePx={config.CELL_SIZE_PX}
            cellGapPx={config.CELL_GAP_PX}
            keyboardCursorRow={keyboardCursorRow}
            keyboardCursorCol={keyboardCursorCol}
            selectedRow={selectedRow}
            selectedCol={selectedCol}
            showCorrectness={false}
            selectionEnabled={selectedRow === null}
            onCellClick={handleCellClick}
            isMainTask={true}
          />
        )}

        {/* ITI — blank screen */}
        {phase === 'ITI' && <div className="iti-blank" aria-hidden="true" />}

        {/* IDLE / COMPLETE */}
        {(phase === 'IDLE' || phase === 'COMPLETE') && (
          <div aria-hidden="true" />
        )}
      </div>

      {/* ESC hint — unobtrusive */}
      <div className="experimenter-hint" aria-hidden="true">
        ESC to abort
      </div>
    </div>
  );
};
