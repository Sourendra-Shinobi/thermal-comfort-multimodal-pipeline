/**
 * Test Suite: Timestamps Utility
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { initClock, perfNow, toWallclock, getExperimentStartTimes, resetClock } from '../utils/timestamps';

describe('timestamps', () => {
  beforeEach(() => {
    resetClock();
  });

  it('perfNow returns a positive number', () => {
    expect(perfNow()).toBeGreaterThan(0);
  });

  it('initClock returns start times', () => {
    const result = initClock();
    expect(result.perfTime).toBeGreaterThan(0);
    expect(result.wallclock).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('toWallclock returns ISO string', () => {
    initClock();
    const wc = toWallclock(perfNow());
    expect(wc).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });

  it('getExperimentStartTimes returns null before initClock', () => {
    expect(getExperimentStartTimes()).toBeNull();
  });

  it('getExperimentStartTimes returns times after initClock', () => {
    initClock();
    const times = getExperimentStartTimes();
    expect(times).not.toBeNull();
    expect(times!.perfTime).toBeGreaterThan(0);
    expect(times!.wallclock).toMatch(/Z$/);
  });

  it('toWallclock with +100ms offset produces later time', () => {
    initClock();
    const t0 = perfNow();
    const wc0 = new Date(toWallclock(t0)).getTime();
    const wc100 = new Date(toWallclock(t0 + 100)).getTime();
    expect(wc100 - wc0).toBeCloseTo(100, -1); // within 1ms
  });
});
