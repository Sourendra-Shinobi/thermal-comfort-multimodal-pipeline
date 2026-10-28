/**
 * Tests for src/integration/SyncFlash.tsx.
 * IDENTICAL COPY in Games/NO-GO and Games/ODD-ONE-OUT.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, act } from '@testing-library/react';
import { SyncFlash } from '../integration/SyncFlash';

afterEach(() => vi.useRealTimers());

describe('SyncFlash', () => {
  it('logs one onset/offset pair per ON phase of the pattern and completes', async () => {
    vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame', 'performance', 'setTimeout', 'Date'] });
    const events: { type: string; detail: Record<string, unknown> }[] = [];
    const onDone = vi.fn();
    const config = { enabled: true, pattern_ms: [100, 100, 100, 100, 300], size_px: 50, position: 'top-left' as const };
    render(
      <SyncFlash config={config} sequence="session_start" onEvent={(type, detail) => events.push({ type, detail })} onDone={onDone} />,
    );
    await act(async () => {
      vi.advanceTimersByTime(2000);
    });
    const types = events.map(e => e.type);
    expect(types[0]).toBe('SYNC_SEQUENCE_STARTED');
    expect(types.filter(t => t === 'SYNC_MARKER_ONSET')).toHaveLength(3);
    expect(types.filter(t => t === 'SYNC_MARKER_OFFSET')).toHaveLength(3);
    expect(types[types.length - 1]).toBe('SYNC_SEQUENCE_COMPLETED');
    const onsets = events.filter(e => e.type === 'SYNC_MARKER_ONSET');
    expect(onsets.map(e => e.detail.duration_ms)).toEqual([100, 100, 300]);
    expect(onsets.map(e => e.detail.pulse_index)).toEqual([0, 1, 2]);
    expect(onsets.every(e => e.detail.marker_source === 'session_sync_sequence' && e.detail.sequence === 'session_start')).toBe(true);
    expect(onDone).toHaveBeenCalledTimes(1);
  });
});
