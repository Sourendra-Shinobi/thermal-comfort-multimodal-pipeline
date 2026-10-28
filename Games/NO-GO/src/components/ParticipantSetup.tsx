/**
 * ParticipantSetup Component
 *
 * Experimenter-facing form to configure session parameters.
 * Settings are locked once the main task begins.
 *
 * In Standard mode: one NO-GO color selector.
 * In Advanced mode: two NO-GO color selectors (must be different colors).
 */

import React, { useState } from 'react';
import type { StimulusColor, ExperimentMode } from '../types/experiment';
import { DEFAULT_CONFIG } from '../experiment/experimentConfig';
import { generateRandomSeed } from '../experiment/randomization';

interface SetupValues {
  participant_id: string;
  session_id: string;
  thermal_condition: string;
  block_id: string;
  no_go_color_1: StimulusColor;
  no_go_color_2: StimulusColor;
  random_seed: string;
  notes: string;
}

/** Values supplied by the experiment controller; participant/session become read-only. */
export interface SetupPreset {
  participant_id: string;
  session_id: string;
  thermal_condition: string;
  block_id: string;
  notes: string;
}

interface ParticipantSetupProps {
  mode: ExperimentMode;
  preset?: SetupPreset | null;
  onSubmit: (values: {
    participant_id: string;
    session_id: string;
    thermal_condition: string;
    block_id: string;
    no_go_colors: StimulusColor[];
    random_seed: number;
    notes: string;
  }) => void;
}

const THERMAL_CONDITIONS = ['Cool', 'Neutral', 'Warm', 'Custom'];

export const ParticipantSetup: React.FC<ParticipantSetupProps> = ({ mode, preset, onSubmit }) => {
  const locked = Boolean(preset);
  const conditions = preset && !THERMAL_CONDITIONS.includes(preset.thermal_condition)
    ? [...THERMAL_CONDITIONS, preset.thermal_condition]
    : THERMAL_CONDITIONS;
  const [values, setValues] = useState<SetupValues>({
    participant_id: preset?.participant_id ?? '',
    session_id: preset?.session_id ?? '',
    thermal_condition: preset?.thermal_condition ?? 'Neutral',
    block_id: preset?.block_id ?? '1',
    no_go_color_1: DEFAULT_CONFIG.DEFAULT_NO_GO_COLORS[0],
    no_go_color_2: DEFAULT_CONFIG.DEFAULT_NO_GO_COLORS[1] ?? 'BLUE',
    random_seed: '',
    notes: preset?.notes ?? '',
  });
  const [errors, setErrors] = useState<Partial<Record<keyof SetupValues | 'no_go_duplicate', string>>>({});

  const isAdvanced = mode === 'advanced';

  const validate = (): boolean => {
    const newErrors: Partial<Record<keyof SetupValues | 'no_go_duplicate', string>> = {};
    if (!values.participant_id.trim()) newErrors.participant_id = 'Participant ID is required.';
    if (!values.session_id.trim())    newErrors.session_id    = 'Session ID is required.';
    if (!values.block_id.trim())      newErrors.block_id      = 'Block ID is required.';

    if (isAdvanced && values.no_go_color_1 === values.no_go_color_2) {
      newErrors.no_go_duplicate = 'The two NO-GO colors must be different.';
    }

    if (values.random_seed.trim() !== '') {
      const parsed = parseInt(values.random_seed, 10);
      if (isNaN(parsed) || parsed < 0) {
        newErrors.random_seed = 'Seed must be a non-negative integer, or leave blank for auto.';
      }
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    const seed = values.random_seed.trim() !== ''
      ? parseInt(values.random_seed, 10)
      : generateRandomSeed();

    const noGoColors: StimulusColor[] = isAdvanced
      ? [values.no_go_color_1, values.no_go_color_2]
      : [values.no_go_color_1];

    onSubmit({
      participant_id: values.participant_id.trim(),
      session_id:     values.session_id.trim(),
      thermal_condition: values.thermal_condition,
      block_id:       values.block_id.trim(),
      no_go_colors:   noGoColors,
      random_seed:    seed,
      notes:          values.notes.trim(),
    });
  };

  const handleChange = (field: keyof SetupValues, value: string) => {
    setValues(prev => ({ ...prev, [field]: value }));
    setErrors(prev => ({ ...prev, [field]: undefined, no_go_duplicate: undefined }));
  };

  // Derive GO colors for the preview label
  const selectedNoGoColors: StimulusColor[] = isAdvanced
    ? [values.no_go_color_1, values.no_go_color_2].filter(
        (c, i, arr) => arr.indexOf(c) === i
      )
    : [values.no_go_color_1];
  const goColors = DEFAULT_CONFIG.STIMULUS_COLORS.filter(c => !selectedNoGoColors.includes(c));

  const nGoExpected = Math.round(DEFAULT_CONFIG.NUMBER_OF_TRIALS * DEFAULT_CONFIG.GO_PROPORTION);
  const nNoGoExpected = DEFAULT_CONFIG.NUMBER_OF_TRIALS - nGoExpected;

  return (
    <div className="screen setup-screen">
      <div className="screen-content">
        <div className="study-badge">
          EXPERIMENTER SETUP &nbsp;·&nbsp;
          <span className={`mode-badge-inline ${isAdvanced ? 'mode-badge-advanced' : 'mode-badge-standard'}`}>
            {isAdvanced ? 'ADVANCED MODE' : 'STANDARD MODE'}
          </span>
        </div>
        <h1 className="screen-title">Session Configuration</h1>
        <p className="screen-subtitle">
          Complete all required fields before starting the task.
          These settings cannot be changed once the experiment begins.
        </p>

        <form className="setup-form" onSubmit={handleSubmit} noValidate>

          {/* ── Participant & Session ─────────────────────────────────── */}
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
                placeholder="e.g., 1" autoComplete="off"
              />
              {errors.block_id && <span className="field-error">{errors.block_id}</span>}
            </div>

            <div className="form-group">
              <label htmlFor="thermal-condition">
                Thermal Condition
                <span className="field-note"> (metadata only — does not alter the task)</span>
              </label>
              <select id="thermal-condition" value={values.thermal_condition} disabled={locked}
                onChange={e => handleChange('thermal_condition', e.target.value)}>
                {conditions.map(tc => <option key={tc} value={tc}>{tc}</option>)}
              </select>
            </div>

            <div className="form-group">
              <label htmlFor="notes">Notes (optional)</label>
              <textarea id="notes" value={values.notes} rows={2}
                onChange={e => handleChange('notes', e.target.value)}
                placeholder="Any relevant experimental notes..."
              />
            </div>
          </div>

          {/* ── Task Parameters ───────────────────────────────────────── */}
          <div className="form-section">
            <h2 className="form-section-title">
              NO-GO Color Configuration
              {isAdvanced && <span className="form-section-badge">Advanced: 2 colors</span>}
            </h2>

            <div className="form-group">
              <label htmlFor="nogo-color-1">
                {isAdvanced ? 'NO-GO Color 1' : 'NO-GO Color'} <span className="required">*</span>
              </label>
              <select id="nogo-color-1" value={values.no_go_color_1}
                onChange={e => handleChange('no_go_color_1', e.target.value as StimulusColor)}>
                {DEFAULT_CONFIG.STIMULUS_COLORS.map(color => (
                  <option key={color} value={color}>{color}</option>
                ))}
              </select>
            </div>

            {isAdvanced && (
              <div className="form-group">
                <label htmlFor="nogo-color-2">NO-GO Color 2 <span className="required">*</span></label>
                <select id="nogo-color-2" value={values.no_go_color_2}
                  onChange={e => handleChange('no_go_color_2', e.target.value as StimulusColor)}>
                  {DEFAULT_CONFIG.STIMULUS_COLORS.map(color => (
                    <option key={color} value={color}>{color}</option>
                  ))}
                </select>
                {errors.no_go_duplicate && (
                  <span className="field-error">{errors.no_go_duplicate}</span>
                )}
              </div>
            )}

            {/* Live GO/NO-GO color preview */}
            <div className="color-assignment-preview">
              <div className="cap-row">
                <span className="cap-label go-text">GO (press SPACEBAR):</span>
                <div className="color-chips">
                  {goColors.map(c => (
                    <div key={c} className="color-chip">
                      <div className="color-circle-small"
                        style={{ backgroundColor: COLOR_STYLES[c] }} />
                      <span className="color-name">{c}</span>
                    </div>
                  ))}
                  {goColors.length === 0 && (
                    <span className="field-error">No GO colors left — choose different NO-GO colors</span>
                  )}
                </div>
              </div>
              <div className="cap-row">
                <span className="cap-label nogo-text">NO-GO (withhold):</span>
                <div className="color-chips">
                  {selectedNoGoColors.map(c => (
                    <div key={c} className="color-chip">
                      <div className="color-circle-small"
                        style={{ backgroundColor: COLOR_STYLES[c] }} />
                      <span className="color-name">{c}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="form-group" style={{ marginTop: '1rem' }}>
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

          {/* ── Experiment Summary ────────────────────────────────────── */}
          <div className="config-summary">
            <h2 className="form-section-title">Experiment Summary</h2>
            <div className="summary-grid">
              <SummaryItem label="Mode" value={isAdvanced ? 'Advanced' : 'Standard'} />
              <SummaryItem label="Total Trials" value={String(DEFAULT_CONFIG.NUMBER_OF_TRIALS)} />
              <SummaryItem label="Practice Trials" value={String(DEFAULT_CONFIG.PRACTICE_TRIALS)} />
              <SummaryItem label="GO Trials" value={`~${nGoExpected}`} />
              <SummaryItem label="NO-GO Trials" value={`~${nNoGoExpected}`} />
              <SummaryItem label="GO Colors" value={String(goColors.length)} />
              <SummaryItem label="NO-GO Colors" value={isAdvanced ? '2' : '1'} />
              <SummaryItem label="Est. Duration" value="~5 min" />
              <SummaryItem label="Fixation" value={`${DEFAULT_CONFIG.FIXATION_DURATION_MS} ms`} />
              <SummaryItem label="Stimulus" value={`${DEFAULT_CONFIG.STIMULUS_DURATION_MS} ms`} />
              <SummaryItem label="ITI" value={`${DEFAULT_CONFIG.ITI_DURATION_MS} ms`} />
              <SummaryItem label="Response Key" value="SPACEBAR" />
            </div>
          </div>

          <div className="button-group">
            <button id="btn-start-setup" type="submit" className="btn btn-primary">
              CONFIRM &amp; PROCEED TO INSTRUCTIONS →
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

const COLOR_STYLES: Record<string, string> = {
  RED: '#e53e3e', BLUE: '#3182ce', GREEN: '#38a169', YELLOW: '#d69e2e',
};

const SummaryItem: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div className="summary-item">
    <span className="summary-label">{label}</span>
    <span className="summary-value">{value}</span>
  </div>
);
