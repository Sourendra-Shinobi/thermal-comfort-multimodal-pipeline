/**
 * WelcomeScreen Component — Odd-One-Out Task
 */

import React from 'react';
import type { AcquisitionMode } from '../types/experiment';

interface WelcomeScreenProps {
  onContinue: (mode: AcquisitionMode) => void;
  /** Mode fixed by the experiment controller; selection is disabled. */
  lockedMode?: AcquisitionMode | null;
}

type ModeInfo = { label: string; desc: string; badge: string };

const MODE_INFO: Partial<Record<AcquisitionMode, ModeInfo>> = {
  FULL_MULTIMODAL: {
    label: 'Full Multimodal',
    badge: 'RESEARCH',
    desc: 'Camera (OBS) + GSR (Shimmer) + Game. For real participant sessions.',
  },
  CAMERA_GAME_TEST: {
    label: 'Camera + Game Test',
    badge: 'PARTIAL',
    desc: 'Camera recording only. GSR not required. For camera integration testing.',
  },
  GAME_ONLY_TEST: {
    label: 'Game Only (Software Test)',
    badge: 'TEST',
    desc: 'No hardware required. For software development and task debugging.',
  },
};

const CONTROLLER_MODE_INFO: Record<AcquisitionMode, ModeInfo> = {
  FULL_MULTIMODAL: { label: 'Full Multimodal', badge: 'RESEARCH', desc: 'Camera + GSR recording confirmed by the experiment controller.' },
  CAMERA_GAME_TEST: { label: 'Camera + Game Test', badge: 'TEST', desc: 'Camera recording by the controller; no GSR.' },
  SHIMMER_GAME_TEST: { label: 'GSR + Game Test', badge: 'TEST', desc: 'Shimmer recording by the controller; no camera.' },
  GAME_ONLY_TEST: { label: 'Game Only (Software Test)', badge: 'TEST', desc: 'No hardware.' },
  MOCK_INTEGRATION_TEST: { label: 'Mock Integration Test', badge: 'MOCK', desc: 'Mock camera + simulated GSR. NO REAL DATA.' },
};

export const WelcomeScreen: React.FC<WelcomeScreenProps> = ({ onContinue, lockedMode }) => {
  const [selectedMode, setSelectedMode] = React.useState<AcquisitionMode>(lockedMode ?? 'FULL_MULTIMODAL');
  const modeEntries = (lockedMode
    ? [[lockedMode, CONTROLLER_MODE_INFO[lockedMode]]]
    : Object.entries(MODE_INFO)) as [AcquisitionMode, ModeInfo][];

  const handleFullscreen = () => {
    if (document.documentElement.requestFullscreen) {
      document.documentElement.requestFullscreen().catch(() => {});
    }
  };

  return (
    <div className="screen welcome-screen">
      <div className="screen-content">
        <div className="study-badge">COGNITIVE RESEARCH TASK · IIT KHARAGPUR</div>
        <h1 className="screen-title">Odd-One-Out Symbol Selection Task</h1>
        <p className="screen-subtitle">
          Thermal Comfort Study · Symbol Discrimination Paradigm
        </p>

        <div className="info-block">
          <p className="label">Experimenter note</p>
          <p>
            Select the acquisition mode before proceeding. In a real session,
            verify OBS and Shimmer are running before clicking Continue.
          </p>
          <p>
            The mode selected here determines which devices must be ready before
            the task begins. Test sessions are clearly labelled in exported data.
          </p>
        </div>

        <div className="mode-selection" style={{ gridTemplateColumns: '1fr' }}>
          {modeEntries.map(
            ([mode, info]) => (
              <button
                key={mode}
                id={`mode-${mode.toLowerCase()}`}
                type="button"
                className={`mode-card ${selectedMode === mode ? 'mode-card--selected' : ''}`}
                onClick={() => !lockedMode && setSelectedMode(mode)}
                aria-pressed={selectedMode === mode}
              >
                <div className="mode-card-header">
                  <span className="mode-card-title">{info.label}</span>
                  <span className={`mode-card-badge ${selectedMode === mode ? 'mode-card-badge--active' : ''}`}>
                    {info.badge}
                  </span>
                </div>
                <p className="mode-card-description">{info.desc}</p>
                {selectedMode === mode && (
                  <div className="mode-card-selected-indicator">✓ Selected</div>
                )}
              </button>
            )
          )}
        </div>

        <div className="button-group">
          <button
            id="btn-fullscreen"
            className="btn btn-secondary"
            onClick={handleFullscreen}
            type="button"
          >
            ENTER FULLSCREEN
          </button>
          <button
            id="btn-continue-welcome"
            className="btn btn-primary"
            onClick={() => onContinue(selectedMode)}
            type="button"
          >
            CONTINUE TO SETUP →
          </button>
        </div>
      </div>
    </div>
  );
};
