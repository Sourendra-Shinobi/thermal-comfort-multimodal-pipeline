/**
 * Instructions Component
 *
 * Dynamically adapts to both Standard and Advanced modes.
 * Colors are substituted based on the configured NO-GO colors.
 */

import React from 'react';
import type { StimulusColor, ExperimentMode } from '../types/experiment';

interface InstructionsProps {
  mode: ExperimentMode;
  noGoColors: StimulusColor[];
  goColors: StimulusColor[];
  onContinue: () => void;
}

const COLOR_CSS: Record<StimulusColor, string> = {
  RED:    '#e53e3e',
  BLUE:   '#3182ce',
  GREEN:  '#38a169',
  YELLOW: '#d69e2e',
};

export const Instructions: React.FC<InstructionsProps> = ({
  mode, noGoColors, goColors, onContinue,
}) => {
  const isAdvanced = mode === 'advanced';

  return (
    <div className="screen instructions-screen">
      <div className="screen-content instructions-content">
        <h1 className="screen-title">Task Instructions</h1>

        <div className="instructions-body">
          <p className="instructions-paragraph">Welcome.</p>

          <p className="instructions-paragraph">
            You will see <strong>colored circles</strong> appear one at a time in the center
            of the screen.
          </p>

          <div className="color-rule-box">
            {/* GO rule */}
            <div className="color-rule go-rule">
              <div className="color-rule-header">
                Press <kbd>SPACEBAR</kbd> as quickly and accurately as you can when you see:
              </div>
              <div className="color-chips">
                {goColors.map(color => (
                  <div key={color} className="color-chip">
                    <div className="color-circle-small"
                      style={{ backgroundColor: COLOR_CSS[color] }} />
                    <span className="color-name">{color}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* NO-GO rule */}
            <div className="color-rule nogo-rule">
              <div className="color-rule-header">
                Do <strong>NOT</strong> press anything when you see
                {isAdvanced ? ' either of these colors:' : ':'}
              </div>
              <div className="color-chips">
                {noGoColors.map(color => (
                  <div key={color} className="color-chip">
                    <div className="color-circle-small"
                      style={{ backgroundColor: COLOR_CSS[color] }} />
                    <span className="color-name">{color}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {isAdvanced && (
            <div className="advanced-mode-note">
              <strong>Advanced mode:</strong> There are now{' '}
              <strong>two colors</strong> you must withhold for ({noGoColors.join(' and ')}).
              Stay alert — both require no response.
            </div>
          )}

          <div className="instructions-tips">
            <p className="instructions-paragraph"><strong>Important:</strong></p>
            <ul className="instructions-list">
              <li>Try to remain still and keep your eyes on the center of the screen.</li>
              <li>Respond only when you see a GO color.</li>
              <li>Press the spacebar <em>once</em> per circle — do not hold it down.</li>
              <li>Speed and accuracy are both important.</li>
              <li>The task will take approximately <strong>5 minutes</strong>.</li>
            </ul>
          </div>

          <p className="instructions-paragraph">
            First, you will complete a <strong>short practice</strong> with feedback,
            so you can get comfortable with the task before the real experiment begins.
          </p>
        </div>

        <div className="button-group">
          <button
            id="btn-start-practice"
            className="btn btn-primary"
            onClick={onContinue}
            type="button"
          >
            BEGIN PRACTICE →
          </button>
        </div>
      </div>
    </div>
  );
};
