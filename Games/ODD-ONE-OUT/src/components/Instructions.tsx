/**
 * Instructions Component — Odd-One-Out Task
 */

import React from 'react';

interface InstructionsProps {
  onContinue: () => void;
  responseWindowSeconds?: number;
}

export const Instructions: React.FC<InstructionsProps> = ({ onContinue, responseWindowSeconds = 5 }) => {
  return (
    <div className="screen instructions-screen">
      <div className="screen-content">
        <div className="study-badge">TASK INSTRUCTIONS</div>
        <h1 className="screen-title">Odd-One-Out Symbol Task</h1>

        <div className="info-block">
          <p className="label">What you will do</p>
          <p>
            You will see a grid of symbols on the screen. Most symbols will be the same,
            but <strong>exactly one symbol will be different</strong> from all the others.
          </p>
          <p>
            Your task is to <strong>select the symbol that is different</strong>.
          </p>
        </div>

        <div className="info-block">
          <p className="label">Example</p>
          <div className="instruction-example" aria-label="Example grid: all open circles except one filled circle">
            <div className="example-grid">
              {Array.from({ length: 16 }, (_, i) => (
                <span key={i} className="example-cell">
                  {i === 6 ? '●' : '○'}
                </span>
              ))}
            </div>
            <p className="example-caption">
              The filled circle (●) is the odd one out. Select it.
            </p>
          </div>
        </div>

        <div className="info-block">
          <p className="label">How to respond</p>
          <p>
            <strong>Mouse:</strong> Click the symbol that looks different.
          </p>
          <p>
            <strong>Keyboard:</strong> Use arrow keys to move the cursor,
            then press <kbd>Enter</kbd> or <kbd>Space</kbd> to select.
          </p>
          <p>
            You have <strong>{responseWindowSeconds} seconds</strong> to respond on each trial.
          </p>
        </div>

        <div className="info-block">
          <p className="label">Important notes</p>
          <p>
            A fixation cross (+) will appear before each trial. Please focus on it.
          </p>
          <p>
            In the main task, you will <strong>not receive feedback</strong> on whether
            your answer was correct or incorrect. Simply respond as accurately and quickly
            as possible.
          </p>
          <p>
            Before the main task, you will complete a short practice with feedback.
          </p>
        </div>

        <div className="button-group">
          <button
            id="btn-start-instructions"
            className="btn btn-primary"
            onClick={onContinue}
            type="button"
          >
            START PRACTICE →
          </button>
        </div>
      </div>
    </div>
  );
};
