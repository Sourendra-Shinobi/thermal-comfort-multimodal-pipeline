/**
 * CompletionScreen Component
 *
 * Shown after all main trials complete.
 * Participant sees only a thank-you message.
 * Experimenter sees a compact summary panel with mode info.
 */

import React from 'react';
import type { SummaryStatistics, SessionMetadata } from '../types/experiment';

interface CompletionScreenProps {
  summary: SummaryStatistics;
  metadata: SessionMetadata;
  isAborted: boolean;
  onExport: () => void;
}

function pct(val: number | null): string {
  if (val === null) return 'N/A';
  return `${(val * 100).toFixed(1)}%`;
}

function ms(val: number | null): string {
  if (val === null) return 'N/A';
  return `${val.toFixed(1)} ms`;
}

export const CompletionScreen: React.FC<CompletionScreenProps> = ({
  summary,
  metadata,
  isAborted,
  onExport,
}) => {
  const modeLabel = metadata.experiment_mode === 'advanced' ? 'Advanced' : 'Standard';
  const noGoLabel = metadata.no_go_colors.join(', ');
  const goLabel   = metadata.go_colors.join(', ');

  return (
    <div className="screen completion-screen">
      <div className="screen-content">
        {/* Participant-facing message */}
        <div className="participant-message">
          {isAborted ? (
            <>
              <h1 className="screen-title">Experiment Ended</h1>
              <p className="screen-subtitle">The task was ended early.</p>
            </>
          ) : (
            <>
              <h1 className="screen-title">Task Complete</h1>
              <p className="screen-subtitle">Thank you.</p>
            </>
          )}
        </div>

        {/* Experimenter summary */}
        <div className="experimenter-summary">
          <h2 className="experimenter-summary-title">Experimenter Summary</h2>
          {isAborted && (
            <div className="abort-warning">⚠ Session aborted — data may be incomplete.</div>
          )}

          {/* Mode / color configuration context */}
          <div className="session-context-panel">
            <div className="session-context-row">
              <span className="session-context-label">Mode</span>
              <span className={`mode-badge-inline mode-badge-${metadata.experiment_mode}`}>
                {modeLabel}
              </span>
            </div>
            <div className="session-context-row">
              <span className="session-context-label">NO-GO Colors</span>
              <span className="session-context-value nogo-text">{noGoLabel}</span>
            </div>
            <div className="session-context-row">
              <span className="session-context-label">GO Colors</span>
              <span className="session-context-value go-text">{goLabel}</span>
            </div>
          </div>

          <div className="summary-grid-compact">
            <SummaryRow label="Total trials"         value={String(summary.total_trials)} />
            <SummaryRow label="GO trials"            value={String(summary.total_go_trials)} />
            <SummaryRow label="NO-GO trials"         value={String(summary.total_no_go_trials)} />
            <SummaryRow label="GO accuracy"          value={pct(summary.go_accuracy)} />
            <SummaryRow label="NO-GO accuracy"       value={pct(summary.no_go_accuracy)} />
            <SummaryRow label="Overall accuracy"     value={pct(summary.overall_accuracy)} />
            <SummaryRow label="GO omission rate"     value={pct(summary.go_omission_rate)} />
            <SummaryRow label="NO-GO commission rate" value={pct(summary.no_go_commission_rate)} />
            <SummaryRow label="Mean GO RT"           value={ms(summary.mean_go_rt_ms)} />
            <SummaryRow label="Median GO RT"         value={ms(summary.median_go_rt_ms)} />
            <SummaryRow label="SD GO RT"             value={ms(summary.std_go_rt_ms)} />
            <SummaryRow
              label="RT CoV"
              value={summary.rt_coefficient_of_variation !== null
                ? summary.rt_coefficient_of_variation.toFixed(4)
                : 'N/A'}
            />
            <SummaryRow label="Fastest GO RT"  value={ms(summary.fastest_go_rt_ms)} />
            <SummaryRow label="Slowest GO RT"  value={ms(summary.slowest_go_rt_ms)} />
            <SummaryRow label="Valid RT count" value={String(summary.valid_go_rt_count)} />
          </div>
        </div>

        <div className="button-group">
          <button
            id="btn-export"
            className="btn btn-primary"
            onClick={onExport}
            type="button"
          >
            EXPORT DATA →
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
