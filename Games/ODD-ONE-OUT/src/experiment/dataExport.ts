/**
 * Data Export Module — Odd-One-Out Task
 *
 * Generates downloadable CSV and JSON files from session data.
 * Also exports events.csv separately.
 * All data stays local — no network requests.
 */

import type { TrialData, ExperimentEvent, SessionExport } from '../types/experiment';
import { trialsToCSV } from '../utils/csv';

/**
 * Trigger a browser download of a text file.
 */
function downloadBlob(content: string, filename: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Generate a filename with participant ID, session ID, task name, and timestamp.
 */
function makeFilename(
  participantId: string,
  sessionId: string,
  suffix: string,
  extension: string
): string {
  const now = new Date();
  const dateStr = now.toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const safe = (s: string) => s.replace(/[^a-zA-Z0-9_-]/g, '_');
  return `OOO_${safe(participantId)}_${safe(sessionId)}_${suffix}_${dateStr}.${extension}`;
}

/** Download trials as CSV (includes practice + main; is_practice column distinguishes them). */
export function downloadTrialsCSV(
  trials: TrialData[],
  participantId: string,
  sessionId: string
): void {
  const csv = trialsToCSV(trials);
  downloadBlob(csv, makeFilename(participantId, sessionId, 'trials', 'csv'), 'text/csv;charset=utf-8;');
}

/** Download events as CSV. */
export function downloadEventsCSV(
  events: ExperimentEvent[],
  participantId: string,
  sessionId: string
): void {
  const csv = eventsToCSV(events);
  downloadBlob(csv, makeFilename(participantId, sessionId, 'events', 'csv'), 'text/csv;charset=utf-8;');
}

/** Download complete session as JSON. */
export function downloadSessionJSON(
  session: SessionExport,
  participantId: string,
  sessionId: string
): void {
  const json = JSON.stringify(session, null, 2);
  downloadBlob(json, makeFilename(participantId, sessionId, 'session', 'json'), 'application/json;charset=utf-8;');
}

/** Return the trials CSV string (for preview/testing). */
export function getTrialsCSVString(trials: TrialData[]): string {
  return trialsToCSV(trials);
}

/** Return the events CSV string (for preview/testing). */
export function getEventsCSVString(events: ExperimentEvent[]): string {
  return eventsToCSV(events);
}

/** Return the session JSON string (for preview/testing). */
export function getSessionJSONString(session: SessionExport): string {
  return JSON.stringify(session, null, 2);
}

// ─── Events CSV ───────────────────────────────────────────────────────────────

function eventsToCSV(events: ExperimentEvent[]): string {
  const header = [
    'event_id',
    'event_sequence',
    'session_id',
    'event_type',
    'monotonic_timestamp_ms',
    'wall_clock_timestamp',
    'trial_number',
    'event_payload',
    'status',
  ].join(',');

  const rows = events.map(evt => [
    escapeCSV(evt.event_id),
    escapeCSV(evt.event_sequence),
    escapeCSV(evt.detail?.['session_id'] ?? ''),
    escapeCSV(evt.event_type),
    escapeCSV(evt.timestamp_perf),
    escapeCSV(evt.timestamp_wallclock),
    escapeCSV(evt.trial_number ?? ''),
    escapeCSV(evt.detail ? JSON.stringify(evt.detail) : ''),
    escapeCSV(evt.acquisition_status ? JSON.stringify(evt.acquisition_status) : ''),
  ].join(','));

  return [header, ...rows].join('\r\n');
}

function escapeCSV(value: unknown): string {
  if (value === null || value === undefined) return '';
  const str = String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}
