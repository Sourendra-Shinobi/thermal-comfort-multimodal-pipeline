/**
 * Timestamps Utility
 * 
 * Provides a unified clock that records experiment start in both:
 *   - performance.now() — high-resolution monotonic clock (sub-millisecond)
 *   - Date.now() / ISO string — wall-clock time for external synchronization
 * 
 * Usage:
 *   initClock()                      — call once at experiment start
 *   perfNow()                        — returns performance.now()
 *   toWallclock(perfTime)            — converts a performance.now() value to ISO
 *   nowWallclock()                   — ISO string of current wall-clock time
 */

let _experimentStartPerf: number | null = null;
let _experimentStartWallclock: number | null = null;

/**
 * Initialize the experiment clock.
 * Must be called exactly once at experiment start.
 */
export function initClock(): { perfTime: number; wallclock: string } {
  _experimentStartPerf = performance.now();
  _experimentStartWallclock = Date.now();
  return {
    perfTime: _experimentStartPerf,
    wallclock: new Date(_experimentStartWallclock).toISOString(),
  };
}

/**
 * High-resolution performance timestamp.
 * This is what should be used for all RT calculations.
 */
export function perfNow(): number {
  return performance.now();
}

/**
 * Convert a performance.now() timestamp to an ISO 8601 wall-clock string.
 * 
 * This is important for cross-stream synchronization with physiological data.
 * The relationship is: wallclock_ms = experimentStartWallclock + (perf - experimentStartPerf)
 */
export function toWallclock(perfTime: number): string {
  if (_experimentStartPerf === null || _experimentStartWallclock === null) {
    // Clock not initialized — return current wall-clock time as fallback
    return new Date().toISOString();
  }
  const offsetMs = perfTime - _experimentStartPerf;
  return new Date(_experimentStartWallclock + offsetMs).toISOString();
}

/**
 * Current wall-clock time as ISO 8601 string.
 */
export function nowWallclock(): string {
  return new Date().toISOString();
}

/**
 * Get the experiment start timestamps (for session metadata).
 */
export function getExperimentStartTimes(): { perfTime: number; wallclock: string } | null {
  if (_experimentStartPerf === null || _experimentStartWallclock === null) return null;
  return {
    perfTime: _experimentStartPerf,
    wallclock: new Date(_experimentStartWallclock).toISOString(),
  };
}

/**
 * Reset the clock (for testing purposes).
 */
export function resetClock(): void {
  _experimentStartPerf = null;
  _experimentStartWallclock = null;
}
