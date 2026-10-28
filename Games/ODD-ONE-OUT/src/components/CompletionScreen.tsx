/**
 * CompletionScreen Component — Odd-One-Out Task
 *
 * Shown after all main trials complete (or task was aborted).
 * Participant sees a clean thank-you message.
 * Experimenter sees a comprehensive summary panel with accuracy, RT metrics,
 * per-family breakdown, and hardware acquisition confirmation.
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
  if (val === null || val === undefined) return 'N/A';
  return `${(val * 100).toFixed(1)}%`;
}

function ms(val: number | null): string {
  if (val === null || val === undefined) return 'N/A';
  return `${val.toFixed(1)} ms`;
}

export const CompletionScreen: React.FC<CompletionScreenProps> = ({
  summary,
  metadata,
  isAborted,
  onExport,
}) => {
  return (
    <div className="screen completion-screen" id="completion-screen">
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
              <p className="screen-subtitle">Thank you for participating.</p>
            </>
          )}
        </div>

        {/* Experimenter summary */}
        <div className="experimenter-summary">
          <h2 className="experimenter-summary-title">Experimenter Summary</h2>
          {isAborted && (
            <div className="abort-warning">⚠ Session aborted — data may be incomplete.</div>
          )}

          {/* Session Context Panel */}
          <div className="session-context-panel">
            <div className="session-context-row">
              <span className="session-context-label">Participant ID</span>
              <span className="session-context-value">{metadata.participant_id}</span>
            </div>
            <div className="session-context-row">
              <span className="session-context-label">Session / Block</span>
              <span className="session-context-value">{metadata.session_id} / {metadata.block_id}</span>
            </div>
            <div className="session-context-row">
              <span className="session-context-label">Acquisition Mode</span>
              <span className={`mode-badge-inline mode-badge-${metadata.acquisition_mode.toLowerCase()}`}>
                {metadata.acquisition_mode}
              </span>
            </div>
            <div className="session-context-row">
              <span className="session-context-label">Thermal Condition</span>
              <span className="session-context-value">{metadata.thermal_condition_id}</span>
            </div>
          </div>

          {/* Performance Metrics */}
          <div className="summary-grid-compact">
            <SummaryRow label="Total main trials" value={String(summary.total_trials)} />
            <SummaryRow label="Completed trials" value={String(summary.completed_trials)} />
            <SummaryRow label="Correct responses" value={`${summary.correct_trials} (${pct(summary.accuracy)})`} />
            <SummaryRow label="Incorrect responses" value={String(summary.incorrect_trials)} />
            <SummaryRow label="Omissions (timed out)" value={`${summary.omission_count} (${pct(summary.omission_rate)})`} />
            <SummaryRow label="Mean RT (correct)" value={ms(summary.mean_rt_ms)} />
            <SummaryRow label="Median RT" value={ms(summary.median_rt_ms)} />
            <SummaryRow label="SD RT" value={ms(summary.std_rt_ms)} />
            <SummaryRow label="Fastest RT" value={ms(summary.fastest_rt_ms)} />
            <SummaryRow label="Slowest RT" value={ms(summary.slowest_rt_ms)} />
            <SummaryRow label="Valid RT count" value={String(summary.valid_rt_count)} />
          </div>

          {/* Per-family breakdown */}
          {summary.accuracy_by_family && Object.keys(summary.accuracy_by_family).length > 0 && (
            <div className="family-breakdown-panel" style={{ marginTop: '1rem' }}>
              <div className="label" style={{ marginBottom: '0.4rem' }}>Accuracy by Symbol Family</div>
              <div className="summary-grid-compact">
                {Object.entries(summary.accuracy_by_family).map(([family, acc]) => (
                  <SummaryRow key={family} label={family} value={pct(acc)} />
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="button-group">
          <button
            id="btn-export"
            className="btn btn-primary"
            onClick={onExport}
            type="button"
          >
            EXPORT SESSION DATA →
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
