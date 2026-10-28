/**
 * Test Suite: Data Export (CSV and JSON)
 */

import { describe, it, expect } from 'vitest';
import { getJSONString } from '../experiment/dataExport';
import { trialsToCSV, CSV_COLUMNS } from '../utils/csv';
import type { TrialData, SessionExport } from '../types/experiment';
import { DEFAULT_CONFIG } from '../experiment/experimentConfig';
import { generateTrialSequenceWithConfig } from '../experiment/trialGenerator';
import { computeSummary } from '../utils/statistics';

function makeTrialData(overrides: Partial<TrialData> = {}): TrialData {
  return {
    participant_id: 'P001',
    session_id: 'S01',
    thermal_condition: 'Neutral',
    block_id: '1',
    is_practice: false,
    random_seed: 42,
    experiment_mode: 'standard',
    no_go_color_1: 'RED',
    no_go_color_2: null,
    trial_number: 1,
    stimulus_color: 'BLUE',
    trial_type: 'GO',
    fixation_onset_perf: 100.0,
    stimulus_onset_perf: 500.0,
    stimulus_offset_perf: 1500.0,
    response_timestamp_perf: 847.0,
    early_response_timestamp_perf: null,
    fixation_onset_wallclock: '2026-09-04T12:00:00.100Z',
    stimulus_onset_wallclock: '2026-09-04T12:00:00.500Z',
    stimulus_offset_wallclock: '2026-09-04T12:00:01.500Z',
    response_timestamp_wallclock: '2026-09-04T12:00:00.847Z',
    responded: true,
    reaction_time_ms: 347.0,
    correct: true,
    error_type: null,
    early_response: false,
    rt_valid: true,
    rt_exclusion_reason: null,
    trial_start_timestamp_perf: 100.0,
    trial_end_timestamp_perf: 1900.0,
    ...overrides,
  };
}

describe('CSV Export', () => {
  it('generates a header row', () => {
    const csv = trialsToCSV([makeTrialData()]);
    const lines = csv.split('\r\n');
    expect(lines[0]).toBe(CSV_COLUMNS.join(','));
  });

  it('generates correct number of data rows', () => {
    const trials = [makeTrialData(), makeTrialData({ trial_number: 2 })];
    const csv = trialsToCSV(trials);
    const lines = csv.split('\r\n').filter(l => l.length > 0);
    expect(lines.length).toBe(3); // header + 2 rows
  });

  it('exports null as empty string', () => {
    const trial = makeTrialData({ reaction_time_ms: null, error_type: null });
    const csv = trialsToCSV([trial]);
    const lines = csv.split('\r\n');
    const dataRow = lines[1];
    expect(dataRow).toBeDefined();
    // error_type column should be empty
    const values = dataRow.split(',');
    const errorTypeIdx = CSV_COLUMNS.indexOf('error_type');
    expect(values[errorTypeIdx]).toBe('');
  });

  it('exports boolean correctly', () => {
    const trial = makeTrialData({ responded: true, correct: false });
    const csv = trialsToCSV([trial]);
    const dataRow = csv.split('\r\n')[1];
    const values = dataRow.split(',');
    expect(values[CSV_COLUMNS.indexOf('responded')]).toBe('true');
    expect(values[CSV_COLUMNS.indexOf('correct')]).toBe('false');
  });

  it('escapes commas in values', () => {
    const trial = makeTrialData({ participant_id: 'P,001' });
    const csv = trialsToCSV([trial]);
    expect(csv).toContain('"P,001"');
  });

  it('has exactly the right number of columns per row', () => {
    const trial = makeTrialData();
    const csv = trialsToCSV([trial]);
    const dataRow = csv.split('\r\n')[1];
    // Count columns by parsing (simple split since no embedded commas in test data)
    const colCount = dataRow.split(',').length;
    expect(colCount).toBe(CSV_COLUMNS.length);
  });
});

describe('JSON Export', () => {
  const seed = 42;
  const config = { ...DEFAULT_CONFIG, DEFAULT_NO_GO_COLOR: 'RED' as const };
  const trialDefs = generateTrialSequenceWithConfig(config, seed, false);
  const trials: TrialData[] = trialDefs.map((def, i) => makeTrialData({
    trial_number: def.trial_number,
    stimulus_color: def.stimulus_color,
    trial_type: def.trial_type,
    responded: def.trial_type === 'GO',
    correct: true,
    reaction_time_ms: def.trial_type === 'GO' ? 300 + i : null,
    rt_valid: def.trial_type === 'GO' ? true : null,
  }));

  const session: SessionExport = {
    metadata: {
      participant_id: 'P001',
      session_id: 'S01',
      thermal_condition: 'Neutral',
      block_id: '1',
      notes: '',
      experiment_mode: 'standard',
      no_go_colors: ['RED'],
      go_colors: ['BLUE', 'GREEN', 'YELLOW'],
      random_seed: seed,
      experiment_start_wallclock: '2026-09-04T12:00:00.000Z',
      experiment_start_perf: 0,
      app_version: '1.0.0',
      experiment_version: '1.0.0',
    },
    configuration: config,
    randomization: { seed, algorithm: 'Mulberry32', note: 'test' },
    events: [],
    trials,
    summary: computeSummary(trials),
  };

  it('produces valid JSON', () => {
    const json = getJSONString(session);
    expect(() => JSON.parse(json)).not.toThrow();
  });

  it('contains metadata.random_seed', () => {
    const json = getJSONString(session);
    const parsed = JSON.parse(json) as SessionExport;
    expect(parsed.metadata.random_seed).toBe(seed);
  });

  it('contains all top-level keys', () => {
    const json = getJSONString(session);
    const parsed = JSON.parse(json) as SessionExport;
    expect(parsed).toHaveProperty('metadata');
    expect(parsed).toHaveProperty('configuration');
    expect(parsed).toHaveProperty('randomization');
    expect(parsed).toHaveProperty('events');
    expect(parsed).toHaveProperty('trials');
    expect(parsed).toHaveProperty('summary');
  });

  it('trials array has correct length', () => {
    const json = getJSONString(session);
    const parsed = JSON.parse(json) as SessionExport;
    expect(parsed.trials.length).toBe(trials.length);
  });

  it('summary statistics are calculated', () => {
    const json = getJSONString(session);
    const parsed = JSON.parse(json) as SessionExport;
    expect(parsed.summary.total_trials).toBe(trials.length);
    expect(parsed.summary.mean_go_rt_ms).not.toBeNull();
  });
});
