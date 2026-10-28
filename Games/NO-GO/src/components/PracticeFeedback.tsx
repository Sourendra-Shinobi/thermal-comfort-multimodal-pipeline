/**
 * PracticeFeedback Component
 * 
 * Shown after practice completes. Gives a brief summary and
 * allows the participant/experimenter to decide to repeat practice or proceed.
 */

import React from 'react';
import type { TrialData, StimulusColor } from '../types/experiment';

interface PracticeFeedbackProps {
  practiceTrials: TrialData[];
  noGoColors: StimulusColor[];
  onProceed: () => void;
  onRepeat: () => void;
}

export const PracticeFeedback: React.FC<PracticeFeedbackProps> = ({
  practiceTrials,
  noGoColors,
  onProceed,
  onRepeat,
}) => {
  const goTrials = practiceTrials.filter(t => t.trial_type === 'GO');
  const noGoTrials = practiceTrials.filter(t => t.trial_type === 'NO_GO');

  const goCorrect = goTrials.filter(t => t.correct).length;
  const noGoCorrect = noGoTrials.filter(t => t.correct).length;

  const goAcc = goTrials.length > 0
    ? Math.round((goCorrect / goTrials.length) * 100)
    : 0;
  const noGoAcc = noGoTrials.length > 0
    ? Math.round((noGoCorrect / noGoTrials.length) * 100)
    : 0;

  const readyToProceed = goAcc >= 60 && noGoAcc >= 60;
  const noGoLabel = noGoColors.join(' & ');

  return (
    <div className="screen practice-feedback-screen">
      <div className="screen-content">
        <h1 className="screen-title">Practice Complete</h1>

        <div className="practice-summary">
          <div className="practice-summary-row">
            <span>GO accuracy (press when colored)</span>
            <span className={goAcc >= 60 ? 'stat-good' : 'stat-warn'}>{goAcc}%</span>
          </div>
          <div className="practice-summary-row">
            <span>NO-GO accuracy (withhold for {noGoLabel})</span>
            <span className={noGoAcc >= 60 ? 'stat-good' : 'stat-warn'}>{noGoAcc}%</span>
          </div>
        </div>

        {readyToProceed ? (
          <p className="instructions-paragraph">
            You are ready to begin the main experiment.
            There will be <strong>no feedback</strong> during the real task.
          </p>
        ) : (
          <p className="instructions-paragraph" style={{ color: '#c53030' }}>
            You may want to repeat the practice to ensure you understand the rules
            before starting the real experiment.
          </p>
        )}

        <div className="button-group">
          <button
            id="btn-repeat-practice"
            className="btn btn-secondary"
            onClick={onRepeat}
            type="button"
          >
            REPEAT PRACTICE
          </button>
          <button
            id="btn-proceed-main"
            className="btn btn-primary"
            onClick={onProceed}
            type="button"
          >
            PROCEED TO MAIN TASK →
          </button>
        </div>
      </div>
    </div>
  );
};
