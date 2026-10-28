/**
 * ExportScreen Component
 *
 * Provides download buttons for CSV and JSON export.
 * All data remains local — no network requests.
 *
 * Displays session context including experiment mode and NO-GO/GO color
 * configuration so the experimenter can verify before downloading.
 */

import React, { useState } from 'react';
import type { SessionExport } from '../types/experiment';
import { downloadCSV, downloadJSON } from '../experiment/dataExport';

interface ExportScreenProps {
  session: SessionExport;
}

export const ExportScreen: React.FC<ExportScreenProps> = ({ session }) => {
  const [csvDownloaded, setCsvDownloaded] = useState(false);
  const [jsonDownloaded, setJsonDownloaded] = useState(false);

  const handleCSV = () => {
    downloadCSV(
      session.trials,
      session.metadata.participant_id,
      session.metadata.session_id
    );
    setCsvDownloaded(true);
  };

  const handleJSON = () => {
    downloadJSON(
      session,
      session.metadata.participant_id,
      session.metadata.session_id
    );
    setJsonDownloaded(true);
  };

  const { metadata, randomization } = session;
  const modeLabel    = metadata.experiment_mode === 'advanced' ? 'Advanced' : 'Standard';
  const noGoLabel    = metadata.no_go_colors.join(', ');
  const goLabel      = metadata.go_colors.join(', ');

  return (
    <div className="screen export-screen">
      <div className="screen-content">
        <div className="study-badge">DATA EXPORT</div>
        <h1 className="screen-title">Download Session Data</h1>
        <p className="screen-subtitle">
          All data is stored locally. No information is sent to any server.
        </p>

        <div className="export-meta">
          <div className="export-meta-row">
            <span>Participant ID</span>
            <span><code>{metadata.participant_id}</code></span>
          </div>
          <div className="export-meta-row">
            <span>Session ID</span>
            <span><code>{metadata.session_id}</code></span>
          </div>
          <div className="export-meta-row">
            <span>Thermal Condition</span>
            <span><code>{metadata.thermal_condition}</code></span>
          </div>
          <div className="export-meta-row">
            <span>Block</span>
            <span><code>{metadata.block_id}</code></span>
          </div>
          <div className="export-meta-row">
            <span>Experiment Mode</span>
            <span>
              <span className={`mode-badge-inline mode-badge-${metadata.experiment_mode}`}>
                {modeLabel}
              </span>
            </span>
          </div>
          <div className="export-meta-row">
            <span>NO-GO Color(s)</span>
            <span><code className="code-nogo">{noGoLabel}</code></span>
          </div>
          <div className="export-meta-row">
            <span>GO Color(s)</span>
            <span><code className="code-go">{goLabel}</code></span>
          </div>
          <div className="export-meta-row">
            <span>Random Seed</span>
            <span><code>{randomization.seed}</code></span>
          </div>
          <div className="export-meta-row">
            <span>App Version</span>
            <span><code>{metadata.app_version}</code></span>
          </div>
          <div className="export-meta-row">
            <span>Start Time</span>
            <span><code>{metadata.experiment_start_wallclock}</code></span>
          </div>
          <div className="export-meta-row">
            <span>Total Trials (including practice)</span>
            <span><code>{session.trials.length}</code></span>
          </div>
          <div className="export-meta-row">
            <span>Events Logged</span>
            <span><code>{session.events.length}</code></span>
          </div>
        </div>

        <div className="export-buttons">
          <div className="export-button-group">
            <button
              id="btn-download-csv"
              className={`btn btn-export ${csvDownloaded ? 'btn-downloaded' : 'btn-primary'}`}
              onClick={handleCSV}
              type="button"
            >
              {csvDownloaded ? '✓ CSV DOWNLOADED' : 'DOWNLOAD CSV'}
            </button>
            <p className="export-desc">
              One row per trial. Includes practice and main trials.
              Open in Excel, R, Python, or MATLAB.
            </p>
          </div>

          <div className="export-button-group">
            <button
              id="btn-download-json"
              className={`btn btn-export ${jsonDownloaded ? 'btn-downloaded' : 'btn-secondary'}`}
              onClick={handleJSON}
              type="button"
            >
              {jsonDownloaded ? '✓ JSON DOWNLOADED' : 'DOWNLOAD JSON'}
            </button>
            <p className="export-desc">
              Complete session: metadata, configuration, random seed,
              event log, all trial data, summary statistics.
            </p>
          </div>
        </div>

        <div className="reproducibility-note">
          <strong>Reproducibility:</strong> Use seed <code>{randomization.seed}</code> with
          algorithm <code>{randomization.algorithm}</code> to reproduce the exact trial sequence.
        </div>
      </div>
    </div>
  );
};
