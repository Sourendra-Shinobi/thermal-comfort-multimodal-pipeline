/**
 * Data Export Module
 * 
 * Generates downloadable CSV and JSON files from session data.
 * All data stays local — no network requests.
 */

import type { TrialData, SessionExport } from '../types/experiment';
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
 * Generate a filename with participant ID, session ID, and timestamp.
 */
function makeFilename(
  participantId: string,
  sessionId: string,
  extension: string
): string {
  const now = new Date();
  const dateStr = now.toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const safe = (s: string) => s.replace(/[^a-zA-Z0-9_-]/g, '_');
  return `NOGO_${safe(participantId)}_${safe(sessionId)}_${dateStr}.${extension}`;
}

/**
 * Download all trials as a CSV file.
 * Includes both practice and main trials; is_practice column distinguishes them.
 */
export function downloadCSV(trials: TrialData[], participantId: string, sessionId: string): void {
  const csv = trialsToCSV(trials);
  const filename = makeFilename(participantId, sessionId, 'csv');
  downloadBlob(csv, filename, 'text/csv;charset=utf-8;');
}

/**
 * Download the complete session as a structured JSON file.
 */
export function downloadJSON(session: SessionExport, participantId: string, sessionId: string): void {
  const json = JSON.stringify(session, null, 2);
  const filename = makeFilename(participantId, sessionId, 'json');
  downloadBlob(json, filename, 'application/json;charset=utf-8;');
}

/**
 * Return the CSV string without triggering a download (useful for preview/testing).
 */
export function getCSVString(trials: TrialData[]): string {
  return trialsToCSV(trials);
}

/**
 * Return the JSON string without triggering a download.
 */
export function getJSONString(session: SessionExport): string {
  return JSON.stringify(session, null, 2);
}
