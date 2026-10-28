/**
 * PracticeScreen Component
 * 
 * Runs the practice block using the same trial engine as the main task.
 * Displays simple feedback after each trial (Correct / Too slow / Wrong / Don't respond).
 * Practice data is clearly marked is_practice = true and never mixed with main data.
 * 
 * Feedback is shown during ITI only — not during the main experiment.
 */

import React, { useEffect, useRef, useState } from 'react';
import type { TrialData, TrialDefinition, SessionMetadata, ExperimentConfig } from '../types/experiment';
import { useTrialEngine } from '../experiment/trialEngine';

interface PracticeScreenProps {
  trials: TrialDefinition[];
  metadata: SessionMetadata;
  config: ExperimentConfig;
  onComplete: (practiceTrials: TrialData[]) => void;
}

const COLOR_CSS: Record<string, string> = {
  RED: '#e53e3e',
  BLUE: '#3182ce',
  GREEN: '#38a169',
  YELLOW: '#d69e2e',
};

function getFeedbackText(trial: TrialData): { text: string; className: string } {
  if (!trial.responded && trial.trial_type === 'GO') {
    return { text: 'Too slow', className: 'feedback-slow' };
  }
  if (trial.responded && trial.trial_type === 'NO_GO') {
    return { text: "Don't respond!", className: 'feedback-error' };
  }
  if (trial.correct) {
    return { text: 'Correct', className: 'feedback-correct' };
  }
  return { text: 'Wrong', className: 'feedback-error' };
}

export const PracticeScreen: React.FC<PracticeScreenProps> = ({
  trials,
  metadata,
  config,
  onComplete,
}) => {
  const [feedback, setFeedback] = useState<{ text: string; className: string } | null>(null);
  const [started, setStarted] = useState(false);
  const allTrialsRef = useRef<TrialData[]>([]);

  const handleTrialComplete = (trial: TrialData) => {
    allTrialsRef.current.push(trial);
    setFeedback(getFeedbackText(trial));
    // Clear feedback after duration
    setTimeout(() => setFeedback(null), config.PRACTICE_FEEDBACK_DURATION_MS);
  };

  const handleComplete = (completedTrials: TrialData[]) => {
    onComplete(completedTrials);
  };

  const { state, startTrials } = useTrialEngine(
    trials,
    metadata,
    config,
    true, // isPractice
    handleTrialComplete,
    handleComplete
  );

  useEffect(() => {
    if (started) {
      startTrials();
    }
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
            Press <kbd>SPACEBAR</kbd> for GO colors. Do <strong>NOT</strong> press
            anything for the {metadata.no_go_colors.join(' & ')} circle.
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

  const currentTrial = state.currentTrial;
  const phase = state.phase;

  return (
    <div className="screen task-screen" aria-label="Practice trial">
      <div className="practice-label">PRACTICE</div>

      <div className="task-area">
        {/* Fixation cross */}
        {phase === 'FIXATION' && (
          <div className="fixation-cross" aria-hidden="true">+</div>
        )}

        {/* Stimulus */}
        {phase === 'STIMULUS' && currentTrial && (
          <div
            className="stimulus-circle"
            style={{
              backgroundColor: COLOR_CSS[currentTrial.stimulus_color] || '#888',
              width: `${config.STIMULUS_SIZE_PX}px`,
              height: `${config.STIMULUS_SIZE_PX}px`,
            }}
            aria-label={`${currentTrial.stimulus_color} circle`}
          />
        )}

        {/* ITI — blank except for feedback */}
        {phase === 'ITI' && (
          <div className="iti-feedback">
            {feedback && (
              <div className={`feedback-text ${feedback.className}`}>
                {feedback.text}
              </div>
            )}
          </div>
        )}

        {/* IDLE / waiting */}
        {phase === 'IDLE' && <div className="fixation-cross" aria-hidden="true" />}
      </div>

      <div className="trial-counter">
        Trial {Math.min(state.currentTrialIndex + 1, trials.length)} of {trials.length}
      </div>
    </div>
  );
};
