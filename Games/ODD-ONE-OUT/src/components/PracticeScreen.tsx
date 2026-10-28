/**
 * PracticeScreen Component — Odd-One-Out Task
 *
 * Runs the practice block. Shows correctness feedback after each trial.
 * Practice data is marked is_practice = true and excluded from main summary.
 */

import React, { useEffect, useRef, useState } from 'react';
import type { TrialData, TrialDefinition, SessionMetadata, ExperimentConfig } from '../types/experiment';
import { useTrialEngine } from '../experiment/trialEngine';
import { SymbolGrid } from './SymbolGrid';

interface PracticeScreenProps {
  trials: TrialDefinition[];
  metadata: SessionMetadata;
  config: ExperimentConfig;
  onComplete: (practiceTrials: TrialData[]) => void;
}

interface FeedbackState {
  text: string;
  className: string;
}

function getFeedback(trial: TrialData): FeedbackState {
  if (trial.omission) return { text: 'Too slow — no response recorded', className: 'feedback-slow' };
  if (trial.correct)  return { text: 'Correct ✓', className: 'feedback-correct' };
  return { text: 'Incorrect — the different symbol was elsewhere', className: 'feedback-error' };
}

export const PracticeScreen: React.FC<PracticeScreenProps> = ({
  trials, metadata, config, onComplete,
}) => {
  const [feedback, setFeedback] = useState<FeedbackState | null>(null);
  const [started, setStarted] = useState(false);
  const allTrialsRef = useRef<TrialData[]>([]);

  const handleTrialComplete = (trial: TrialData) => {
    allTrialsRef.current.push(trial);
    setFeedback(getFeedback(trial));
    setTimeout(() => setFeedback(null), config.PRACTICE_FEEDBACK_DURATION_MS);
  };

  const { state, startTrials, handleCellClick } = useTrialEngine(
    trials,
    metadata,
    config,
    true,
    handleTrialComplete,
    onComplete
  );

  useEffect(() => {
    if (started) startTrials();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [started]);

  if (!started) {
    return (
      <div className="screen task-screen">
        <div className="screen-content">
          <h1 className="screen-title">Practice</h1>
          <p className="screen-subtitle">
            You will now complete {config.PRACTICE_TRIALS} practice trials.
            Feedback will be shown after each response.
          </p>
          <p className="screen-subtitle">
            Select the symbol that <strong>looks different</strong> from all others.
            You have {config.RESPONSE_WINDOW_MS / 1000} seconds per trial.
          </p>
          <div className="button-group">
            <button
              id="btn-begin-practice"
              className="btn btn-primary"
              onClick={() => setStarted(true)}
              type="button"
            >
              START PRACTICE
            </button>
          </div>
        </div>
      </div>
    );
  }

  const { phase, currentTrial, keyboardCursorRow, keyboardCursorCol, selectedRow, selectedCol } = state;
  const showCorrectness = phase === 'ITI' && feedback !== null;

  return (
    <div className="screen task-screen" aria-label="Practice trial">
      <div className="practice-label">PRACTICE</div>

      <div className="task-area">
        {phase === 'FIXATION' && (
          <div className="fixation-cross" aria-hidden="true">+</div>
        )}

        {phase === 'STIMULUS' && currentTrial && (
          <SymbolGrid
            trial={currentTrial}
            cellSizePx={config.CELL_SIZE_PX}
            cellGapPx={config.CELL_GAP_PX}
            keyboardCursorRow={keyboardCursorRow}
            keyboardCursorCol={keyboardCursorCol}
            selectedRow={selectedRow}
            selectedCol={selectedCol}
            showCorrectness={showCorrectness}
            selectionEnabled={selectedRow === null}
            onCellClick={handleCellClick}
            isMainTask={false}
          />
        )}

        {phase === 'ITI' && (
          <div className="iti-feedback">
            {feedback && (
              <div className={`feedback-text ${feedback.className}`}>
                {feedback.text}
              </div>
            )}
          </div>
        )}

        {phase === 'IDLE' && <div className="fixation-cross" aria-hidden="true" />}
      </div>

      <div className="trial-counter">
        Trial {Math.min(state.currentTrialIndex + 1, trials.length)} of {trials.length}
      </div>
    </div>
  );
};
