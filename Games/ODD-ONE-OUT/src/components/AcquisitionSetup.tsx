/**
 * AcquisitionSetup Component
 *
 * Operator-facing session configuration form.
 * Collects participant/session metadata and task parameters.
 * Settings are locked once the experiment begins.
 */

import React, { useState } from 'react';
import type { AcquisitionMode } from '../types/experiment';
import { DEFAULT_CONFIG } from '../experiment/experimentConfig';
import { generateRandomSeed } from '../experiment/trialGenerator';

export interface SetupFormValues {
  participant_id: string;
  session_id: string;
  thermal_condition_id: string;
  temperature_celsius: string;
  block_id: string;
  random_seed: string;
  notes: string;
}

/** Values supplied by the experiment controller; participant/session become read-only. */
export interface SetupPreset {
  participant_id: string;
  session_id: string;
  thermal_condition_id: string;
  temperature_celsius: string;
  block_id: string;
  notes: string;
  is_test_session: boolean;
}

interface AcquisitionSetupProps {
  acquisitionMode: AcquisitionMode;
  preset?: SetupPreset | null;
  onSubmit: (values: SetupFormValues & { random_seed_number: number }) => void;
}

const THERMAL_CONDITIONS = ['Cool', 'Neutral', 'Warm', 'Custom'];

export const AcquisitionSetup: React.FC<AcquisitionSetupProps> = ({
  acquisitionMode,
  preset,
  onSubmit,
}) => {
  const locked = Boolean(preset);
  const conditions = preset && !THERMAL_CONDITIONS.includes(preset.thermal_condition_id)
    ? [...THERMAL_CONDITIONS, preset.thermal_condition_id]
    : THERMAL_CONDITIONS;
  const [values, setValues] = useState<SetupFormValues>({
    participant_id: preset?.participant_id ?? '',
    session_id: preset?.session_id ?? '',
    thermal_condition_id: preset?.thermal_condition_id ?? 'Neutral',
    temperature_celsius: preset?.temperature_celsius ?? '',
    block_id: preset?.block_id ?? '1',
    random_seed: '',
    notes: preset?.notes ?? '',
  });
  const [errors, setErrors] = useState<Partial<Record<keyof SetupFormValues, string>>>({});

  const isTestMode = preset ? preset.is_test_session : acquisitionMode === 'GAME_ONLY_TEST';

  const validate = (): boolean => {
    const newErrors: Partial<Record<keyof SetupFormValues, string>> = {};
    if (!values.participant_id.trim()) newErrors.participant_id = 'Participant ID is required.';
    if (!values.session_id.trim()) newErrors.session_id = 'Session ID is required.';
    if (!values.block_id.trim()) newErrors.block_id = 'Block ID is required.';
    if (values.temperature_celsius.trim() !== '') {
      const t = parseFloat(values.temperature_celsius);
      if (isNaN(t)) newErrors.temperature_celsius = 'Enter a number or leave blank.';
    }
    if (values.random_seed.trim() !== '') {
      const s = parseInt(values.random_seed, 10);
      if (isNaN(s) || s < 0) newErrors.random_seed = 'Seed must be a non-negative integer.';
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    const seed =
      values.random_seed.trim() !== ''
        ? parseInt(values.random_seed, 10)
        : generateRandomSeed();
    onSubmit({ ...values, random_seed_number: seed });
  };

  const handleChange = (field: keyof SetupFormValues, value: string) => {
    setValues(prev => ({ ...prev, [field]: value }));
    setErrors(prev => ({ ...prev, [field]: undefined }));
  };

  const nTrials = DEFAULT_CONFIG.NUMBER_OF_TRIALS;
  const nPractice = DEFAULT_CONFIG.PRACTICE_TRIALS;
  const grid = `${DEFAULT_CONFIG.GRID_ROWS}×${DEFAULT_CONFIG.GRID_COLS}`;

  return (
    <div className="screen setup-screen">
      <div className="screen-content">
        <div className="study-badge">
          EXPERIMENTER SETUP &nbsp;·&nbsp;
          <span className={`mode-badge-inline ${isTestMode ? 'mode-badge-standard' : 'mode-badge-advanced'}`}>
            {acquisitionMode}
          </span>
        </div>
        {isTestMode && (
          <div className="test-mode-warning">
            ⚠ SOFTWARE TEST MODE — Not a research recording. Exported data will be marked as test.
          </div>
        )}
        <h1 className="screen-title">Session Configuration</h1>
        <p className="screen-subtitle">
          Complete all required fields before starting. Settings are locked once the task begins.
        </p>

        <form className="setup-form" onSubmit={handleSubmit} noValidate>

          {/* ── Participant & Session ───────────────────────────────────── */}
          <div className="form-section">
            <h2 className="form-section-title">Participant &amp; Session</h2>

            <div className="form-group">
              <label htmlFor="participant-id">Participant ID <span className="required">*</span></label>
              <input
                id="participant-id" type="text"
                value={values.participant_id}
                onChange={e => handleChange('participant_id', e.target.value)}
                placeholder="e.g., P001" autoComplete="off" spellCheck={false}
                readOnly={locked}
              />
              {errors.participant_id && <span className="field-error">{errors.participant_id}</span>}
            </div>

            <div className="form-group">
              <label htmlFor="session-id">Session ID <span className="required">*</span></label>
              <input
                id="session-id" type="text"
                value={values.session_id}
                onChange={e => handleChange('session_id', e.target.value)}
                placeholder="e.g., S01" autoComplete="off" spellCheck={false}
                readOnly={locked}
              />
              {locked && <span className="field-note">Set by the experiment controller.</span>}
              {errors.session_id && <span className="field-error">{errors.session_id}</span>}
            </div>

            <div className="form-group">
              <label htmlFor="block-id">Experiment Block <span className="required">*</span></label>
              <input
                id="block-id" type="text"
                value={values.block_id}
                onChange={e => handleChange('block_id', e.target.value)}
                placeholder="e.g., 1"
              />
              {errors.block_id && <span className="field-error">{errors.block_id}</span>}
            </div>
          </div>

          {/* ── Thermal Condition ──────────────────────────────────────── */}
          <div className="form-section">
            <h2 className="form-section-title">Thermal Condition</h2>

            <div className="form-group">
              <label htmlFor="thermal-condition">Condition
                <span className="field-note"> (metadata only — does not alter the task)</span>
              </label>
              <select id="thermal-condition" value={values.thermal_condition_id} disabled={locked}
                onChange={e => handleChange('thermal_condition_id', e.target.value)}>
                {conditions.map(tc => <option key={tc} value={tc}>{tc}</option>)}
              </select>
            </div>

            <div className="form-group">
              <label htmlFor="temperature">Temperature (°C)
                <span className="field-note"> (optional — for metadata)</span>
              </label>
              <input
                id="temperature" type="number"
                value={values.temperature_celsius}
                onChange={e => handleChange('temperature_celsius', e.target.value)}
                placeholder="e.g., 28.5" step="0.1"
              />
              {errors.temperature_celsius && <span className="field-error">{errors.temperature_celsius}</span>}
            </div>
          </div>

          {/* ── Randomization ─────────────────────────────────────────── */}
          <div className="form-section">
            <h2 className="form-section-title">Randomization</h2>

            <div className="form-group">
              <label htmlFor="random-seed">
                Random Seed
                <span className="field-note"> (leave blank to auto-generate)</span>
              </label>
              <input id="random-seed" type="number"
                value={values.random_seed}
                onChange={e => handleChange('random_seed', e.target.value)}
                placeholder="Auto-generated" min="0"
              />
              {errors.random_seed && <span className="field-error">{errors.random_seed}</span>}
              <span className="field-note">Stored in exported data for reproducibility.</span>
            </div>
          </div>

          {/* ── Notes ──────────────────────────────────────────────────── */}
          <div className="form-section">
            <h2 className="form-section-title">Notes</h2>
            <div className="form-group">
              <label htmlFor="notes">Session notes (optional)</label>
              <textarea id="notes" value={values.notes} rows={2}
                onChange={e => handleChange('notes', e.target.value)}
                placeholder="Any relevant experimental notes..."
              />
            </div>
          </div>

          {/* ── Experiment Summary ────────────────────────────────────── */}
          <div className="config-summary">
            <h2 className="form-section-title">Experiment Summary</h2>
            <div className="summary-grid">
              <SummaryItem label="Main Trials" value={String(nTrials)} />
              <SummaryItem label="Practice Trials" value={String(nPractice)} />
              <SummaryItem label="Grid" value={grid} />
              <SummaryItem label="Response Window" value={`${DEFAULT_CONFIG.RESPONSE_WINDOW_MS} ms`} />
              <SummaryItem label="Fixation" value={`${DEFAULT_CONFIG.FIXATION_DURATION_MS} ms`} />
              <SummaryItem label="ITI" value={`${DEFAULT_CONFIG.ITI_DURATION_MS} ms`} />
              <SummaryItem label="Symbol Families" value={String(DEFAULT_CONFIG.ENABLED_SYMBOL_FAMILIES.length)} />
              <SummaryItem label="Acquisition" value={acquisitionMode} />
            </div>
          </div>

          <div className="button-group">
            <button id="btn-start-setup" type="submit" className="btn btn-primary">
              CONFIRM &amp; PROCEED →
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

const SummaryItem: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div className="summary-item">
    <span className="summary-label">{label}</span>
    <span className="summary-value">{value}</span>
  </div>
);
