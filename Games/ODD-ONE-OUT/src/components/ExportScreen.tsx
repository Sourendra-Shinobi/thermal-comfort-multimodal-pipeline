/**
 * ExportScreen Component — Odd-One-Out Task
 *
 * Provides download buttons for:
 *   1. trials.csv (trial-level metrics, reaction times, errors, coordinates)
 *   2. events.csv (full monotonic & wall-clock event sequence)
 *   3. session.json (complete session bundle with configuration, metadata, summary)
 *
 * All data remains local — no network requests or external dependencies.
 */

import React, { useState } from 'react';
import type { SessionExport } from '../types/experiment';
import {
  downloadTrialsCSV,
  downloadEventsCSV,
  downloadSessionJSON,
} from '../experiment/dataExport';

interface ExportScreenProps {
  session: SessionExport;
  onRestart?: () => void;
}

export const ExportScreen: React.FC<ExportScreenProps> = ({ session, onRestart }) => {
  const [trialsDownloaded, setTrialsDownloaded] = useState(false);
  const [eventsDownloaded, setEventsDownloaded] = useState(false);
  const [jsonDownloaded, setJsonDownloaded] = useState(false);

  const { metadata, randomization, trials, events, summary } = session;

  const handleDownloadTrials = () => {
    downloadTrialsCSV(trials, metadata.participant_id, metadata.session_id);
    setTrialsDownloaded(true);
  };

  const handleDownloadEvents = () => {
    downloadEventsCSV(events, metadata.participant_id, metadata.session_id);
    setEventsDownloaded(true);
  };

  const handleDownloadJSON = () => {
    downloadSessionJSON(session, metadata.participant_id, metadata.session_id);
    setJsonDownloaded(true);
  };

  return (
    <div className="screen export-screen" id="export-screen">
      <div className="screen-content">
        <div className="study-badge">DATA EXPORT · ODD-ONE-OUT TASK</div>
        <h1 className="screen-title">Export Session Data</h1>
        <p className="screen-subtitle">
          All data is stored locally in the browser memory. Download the CSV and JSON files below.
          No external server connections are made.
        </p>

        {/* Session Metadata Overview */}
        <div className="export-meta">
          <div className="export-meta-row">
            <span>Participant ID</span>
            <span><code>{metadata.participant_id}</code></span>
          </div>
          <div className="export-meta-row">
            <span>Session ID / Block</span>
            <span><code>{metadata.session_id} / {metadata.block_id}</code></span>
          </div>
          <div className="export-meta-row">
            <span>Acquisition Mode</span>
            <span>
              <span className={`mode-badge-inline mode-badge-${metadata.acquisition_mode.toLowerCase()}`}>
                {metadata.acquisition_mode}
              </span>
            </span>
          </div>
          <div className="export-meta-row">
            <span>Thermal Condition</span>
            <span><code>{metadata.thermal_condition_id} {metadata.temperature_celsius ? `(${metadata.temperature_celsius}°C)` : ''}</code></span>
          </div>
          <div className="export-meta-row">
            <span>Random Seed</span>
            <span><code>{randomization.seed}</code></span>
          </div>
          <div className="export-meta-row">
            <span>Total Trials (Practice + Main)</span>
            <span><code>{trials.length}</code></span>
          </div>
          <div className="export-meta-row">
            <span>Main Trial Accuracy</span>
            <span><code>{summary.accuracy !== null ? `${(summary.accuracy * 100).toFixed(1)}%` : 'N/A'}</code></span>
          </div>
          <div className="export-meta-row">
            <span>Logged Events</span>
            <span><code>{events.length}</code></span>
          </div>
        </div>

        {/* Download Buttons */}
        <div className="export-buttons">
          <div className="export-button-group">
            <button
              id="btn-download-trials-csv"
              className={`btn btn-export ${trialsDownloaded ? 'btn-downloaded' : 'btn-primary'}`}
              onClick={handleDownloadTrials}
              type="button"
            >
              {trialsDownloaded ? '✓ TRIALS CSV DOWNLOADED' : 'DOWNLOAD TRIALS CSV'}
            </button>
            <p className="export-desc">
              One row per trial (practice and main). Includes timestamps, coordinates,
              symbol families, target positions, response times, and accuracy flags.
            </p>
          </div>

          <div className="export-button-group">
            <button
              id="btn-download-events-csv"
              className={`btn btn-export ${eventsDownloaded ? 'btn-downloaded' : 'btn-secondary'}`}
              onClick={handleDownloadEvents}
              type="button"
            >
              {eventsDownloaded ? '✓ EVENTS CSV DOWNLOADED' : 'DOWNLOAD EVENTS CSV'}
            </button>
            <p className="export-desc">
              Sequential millisecond-precision event log for multimodal alignment
              with camera, GSR, and thermal streams.
            </p>
          </div>

          <div className="export-button-group">
            <button
              id="btn-download-session-json"
              className={`btn btn-export ${jsonDownloaded ? 'btn-downloaded' : 'btn-secondary'}`}
              onClick={handleDownloadJSON}
              type="button"
            >
              {jsonDownloaded ? '✓ SESSION JSON DOWNLOADED' : 'DOWNLOAD COMPLETE JSON'}
            </button>
            <p className="export-desc">
              Complete archive containing raw trials, event logs, full system configuration,
              reproducibility seed, and summary statistics.
            </p>
          </div>
        </div>

        {/* Reproducibility info */}
        <div className="reproducibility-note">
          <strong>Reproducibility:</strong> PRNG algorithm: <code>{randomization.algorithm}</code>,
          Seed: <code>{randomization.seed}</code>. Running with this seed generates the exact same sequence.
        </div>

        {onRestart && (
          <div className="button-group" style={{ marginTop: '2rem' }}>
            <button
              id="btn-restart"
              className="btn btn-secondary"
              onClick={onRestart}
              type="button"
            >
              NEW SESSION
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
