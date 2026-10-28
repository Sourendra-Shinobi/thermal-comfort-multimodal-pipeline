/**
 * PracticeFeedback Component
 *
 * Shown after practice block completes.
 * Operator can review a quick summary and decide whether to repeat practice
 * or proceed to the main task.
 */

import React from 'react';
import type { TrialData } from '../types/experiment';

interface PracticeFeedbackProps {
  practiceTrials: TrialData[];
  onProceed: () => void;
  onRepeat: () => void;
}

export const PracticeFeedback: React.FC<PracticeFeedbackProps> = ({
  practiceTrials,
  onProceed,
  onRepeat,
}) => {
  const total = practiceTrials.length;
  const correct = practiceTrials.filter(t => t.correct).length;
  const omissions = practiceTrials.filter(t => t.omission).length;
  const accuracy = total > 0 ? ((correct / total) * 100).toFixed(1) : 'N/A';
  const validRTs = practiceTrials
    .filter(t => t.correct && t.reaction_time_ms !== null)
    .map(t => t.reaction_time_ms as number);
  const meanRT = validRTs.length > 0
    ? (validRTs.reduce((a, b) => a + b, 0) / validRTs.length).toFixed(1)
    : 'N/A';

  return (
    <div className="screen completion-screen">
      <div className="screen-content">
        <div className="study-badge">PRACTICE COMPLETE</div>
        <h1 className="screen-title">Practice Results</h1>

        <div className="experimenter-summary">
          <h2 className="experimenter-summary-title">Practice Summary</h2>
          <div className="summary-grid-compact">
            <SummaryRow label="Total practice trials" value={String(total)} />
            <SummaryRow label="Correct" value={`${correct} (${accuracy}%)`} />
            <SummaryRow label="Omissions" value={String(omissions)} />
            <SummaryRow label="Mean RT (correct)" value={meanRT !== 'N/A' ? `${meanRT} ms` : 'N/A'} />
          </div>
        </div>

        <div className="info-block">
          <p>
            The participant may now proceed to the main task or repeat practice if needed.
            <strong> No feedback will be shown during the main task.</strong>
          </p>
        </div>

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
            START MAIN TASK →
          </button>
        </div>
      </div>
    </div>
  );
};

const SummaryRow: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div className="summary-row-compact">
    <span className="summary-label-compact">{label}</span>
    <span className="summary-value-compact">{value}</span>
  </div>
);
