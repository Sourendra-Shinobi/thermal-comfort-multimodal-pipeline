/**
 * WelcomeScreen Component
 *
 * First screen. Participants/experimenters select the experiment mode here:
 *   - Standard Mode: 1 NO-GO color, 3 GO colors
 *   - Advanced Mode: 2 NO-GO colors, 2 GO colors
 */

import React, { useState } from 'react';
import type { ExperimentMode } from '../types/experiment';

interface WelcomeScreenProps {
  onContinue: (mode: ExperimentMode) => void;
}

export const WelcomeScreen: React.FC<WelcomeScreenProps> = ({ onContinue }) => {
  const [selectedMode, setSelectedMode] = useState<ExperimentMode>('standard');

  const handleFullscreen = () => {
    if (document.documentElement.requestFullscreen) {
      document.documentElement.requestFullscreen().catch(() => {});
    }
  };

  return (
    <div className="screen welcome-screen">
      <div className="screen-content">
        <div className="study-badge">COGNITIVE RESEARCH TASK</div>
        <h1 className="screen-title">NO-GO Color Inhibition Task</h1>
        <p className="screen-subtitle">Response Inhibition Paradigm · Select a mode below</p>

        {/* ── Mode Selection ─────────────────────────────────────────────── */}
        <div className="mode-selection">
          <ModeCard
            id="mode-standard"
            selected={selectedMode === 'standard'}
            onSelect={() => setSelectedMode('standard')}
            title="Standard Mode"
            badge="DEFAULT"
            description="One NO-GO color and three GO colors."
            goLabel="GO colors (press SPACEBAR)"
            goColors={['BLUE', 'GREEN', 'YELLOW']}
            noGoLabel="NO-GO color (do NOT press)"
            noGoColors={['RED']}
            detail="Approx. 75% GO · 25% NO-GO · ~4.5 min"
          />

          <ModeCard
            id="mode-advanced"
            selected={selectedMode === 'advanced'}
            onSelect={() => setSelectedMode('advanced')}
            title="Advanced Mode"
            badge="ADVANCED"
            description="Two NO-GO colors and two GO colors. Higher inhibition demand."
            goLabel="GO colors (press SPACEBAR)"
            goColors={['GREEN', 'YELLOW']}
            noGoLabel="NO-GO colors (do NOT press)"
            noGoColors={['RED', 'BLUE']}
            detail="Approx. 75% GO · 25% NO-GO · ~4.5 min"
          />
        </div>

        <div className="info-block">
          <p className="label">Experimenter note</p>
          <p>
            The exact NO-GO color(s) are configurable on the next screen.
            The mode selection above sets the <strong>number</strong> of NO-GO colors (1 or 2).
          </p>
          <p>
            Ensure the participant is seated and any recording equipment is running
            before continuing.
          </p>
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

// ─── ModeCard sub-component ────────────────────────────────────────────────────

const COLOR_CSS: Record<string, string> = {
  RED:    '#e53e3e',
  BLUE:   '#3182ce',
  GREEN:  '#38a169',
  YELLOW: '#d69e2e',
};

interface ModeCardProps {
  id: string;
  selected: boolean;
  onSelect: () => void;
  title: string;
  badge: string;
  description: string;
  goLabel: string;
  goColors: string[];
  noGoLabel: string;
  noGoColors: string[];
  detail: string;
}

const ModeCard: React.FC<ModeCardProps> = ({
  id, selected, onSelect, title, badge, description,
  goLabel, goColors, noGoLabel, noGoColors, detail,
}) => (
  <button
    id={id}
    type="button"
    className={`mode-card ${selected ? 'mode-card--selected' : ''}`}
    onClick={onSelect}
    aria-pressed={selected}
  >
    <div className="mode-card-header">
      <span className="mode-card-title">{title}</span>
      <span className={`mode-card-badge ${selected ? 'mode-card-badge--active' : ''}`}>
        {badge}
      </span>
    </div>

    <p className="mode-card-description">{description}</p>

    <div className="mode-card-divider" />

    <div className="mode-card-colors">
      <div className="mode-color-row">
        <span className="mode-color-label go-text">{goLabel}</span>
        <div className="color-chips">
          {goColors.map(c => (
            <div key={c} className="color-chip">
              <div className="color-circle-small" style={{ backgroundColor: COLOR_CSS[c] }} />
              <span className="color-name">{c}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="mode-color-row">
        <span className="mode-color-label nogo-text">{noGoLabel}</span>
        <div className="color-chips">
          {noGoColors.map(c => (
            <div key={c} className="color-chip">
              <div className="color-circle-small" style={{ backgroundColor: COLOR_CSS[c] }} />
              <span className="color-name">{c}</span>
            </div>
          ))}
        </div>
      </div>
    </div>

    <p className="mode-card-detail">{detail}</p>

    {selected && (
      <div className="mode-card-selected-indicator" aria-hidden="true">✓ Selected</div>
    )}
  </button>
);
