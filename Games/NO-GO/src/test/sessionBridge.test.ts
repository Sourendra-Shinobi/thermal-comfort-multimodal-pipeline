/**
 * Tests for src/integration/sessionBridge.ts.
 * IDENTICAL COPY in Games/NO-GO and Games/ODD-ONE-OUT.
 */

import { describe, it, expect, vi } from 'vitest';
import { getOrchestration, SessionBridge, type BridgeEvent } from '../integration/sessionBridge';

type Call = { url: string; init?: RequestInit };

function fakeFetch(responder: (call: Call) => { status: number; body?: unknown }) {
  const calls: Call[] = [];
  const impl = async (url: string, init?: RequestInit) => {
    const call = { url, init };
    calls.push(call);
    const { status, body } = responder(call);
    return new Response(JSON.stringify(body ?? {}), { status });
  };
  return { calls, impl };
}

const clock = { perf: () => 1000, wall: () => 1_700_000_000_000 };

function ev(type: string, trial: number | null = null): BridgeEvent {
  return { event_type: type, timestamp_perf: 12.5, timestamp_wallclock: '2026-10-28T10:00:00.000Z', trial_number: trial, detail: { a: 1 } };
}

describe('getOrchestration', () => {
  it('is null without ?session (stand-alone game)', () => {
    expect(getOrchestration('', 'http://localhost:5173')).toBeNull();
    expect(getOrchestration('?foo=1', 'http://127.0.0.1:8765')).toBeNull();
  });

  it('uses the page origin as API base', () => {
    expect(getOrchestration('?session=S1', 'http://127.0.0.1:8765')).toEqual({ sessionId: 'S1', apiBase: 'http://127.0.0.1:8765' });
  });

  it('accepts an explicit api parameter (vite dev server)', () => {
    expect(getOrchestration('?session=S1&api=http://127.0.0.1:8765/', 'http://localhost:5173'))
      .toEqual({ sessionId: 'S1', apiBase: 'http://127.0.0.1:8765' });
  });

  it('is null for file:// pages without api parameter', () => {
    expect(getOrchestration('?session=S1', 'null')).toBeNull();
  });
});

describe('SessionBridge', () => {
  it('rejects a controller running a different session', async () => {
    const { impl } = fakeFetch(() => ({ status: 200, body: { session_id: 'OTHER' } }));
    const b = new SessionBridge('S1', 'http://x', impl, clock);
    await expect(b.loadContext()).rejects.toThrow(/OTHER/);
  });

  it('batches events with session id, sequence numbers and client clock', async () => {
    const { calls, impl } = fakeFetch(() => ({ status: 200, body: { ok: true } }));
    const b = new SessionBridge('S1', 'http://x', impl, clock);
    b.forward(ev('TRIAL_START', 1));
    b.forward(ev('STIMULUS_ONSET', 1));
    expect(await b.flush()).toBe(true);
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe('http://x/api/events');
    const body = JSON.parse(calls[0].init!.body as string);
    expect(body.session_id).toBe('S1');
    expect(body.client.sent_wall_ms).toBe(1_700_000_000_000);
    expect(body.events.map((e: { bridge_seq: number }) => e.bridge_seq)).toEqual([1, 2]);
    expect(body.events[1].event_type).toBe('STIMULUS_ONSET');
    expect(b.sentEvents).toBe(2);
  });

  it('keeps events in order and retries after a failed upload', async () => {
    vi.useFakeTimers();
    let fail = true;
    const { calls, impl } = fakeFetch(() => ({ status: fail ? 500 : 200 }));
    const b = new SessionBridge('S1', 'http://x', impl, clock);
    b.forward(ev('A'));
    expect(await b.flush()).toBe(false);
    expect(b.lastError).toMatch(/500/);
    b.forward(ev('B'));
    fail = false;
    expect(await b.flush()).toBe(true);
    const body = JSON.parse(calls[calls.length - 1].init!.body as string);
    expect(body.events.map((e: BridgeEvent) => e.event_type)).toEqual(['A', 'B']);
    vi.useRealTimers();
  });

  it('flushes automatically when a batch is full', async () => {
    const { calls, impl } = fakeFetch(() => ({ status: 200 }));
    const b = new SessionBridge('S1', 'http://x', impl, clock);
    for (let i = 0; i < SessionBridge.BATCH_SIZE; i++) b.forward(ev('E', i));
    await Promise.resolve();
    expect(calls.length).toBeGreaterThanOrEqual(1);
  });

  it('attach registers the sink only once', () => {
    const { impl } = fakeFetch(() => ({ status: 200 }));
    const b = new SessionBridge('S1', 'http://x', impl, clock);
    const addSink = vi.fn();
    b.attach(addSink);
    b.attach(addSink);
    expect(addSink).toHaveBeenCalledTimes(1);
  });

  it('submits the result after flushing pending events', async () => {
    const { calls, impl } = fakeFetch(() => ({ status: 200 }));
    const b = new SessionBridge('S1', 'http://x', impl, clock);
    b.forward(ev('MAIN_TASK_END'));
    const ok = await b.submitResult({
      status: 'completed', trials: [{ trial_number: 1 }], trials_csv: 'a\r\n1', events: [], summary: {}, metadata: {}, session_export: {},
    });
    expect(ok).toBe(true);
    expect(calls.map(c => c.url)).toEqual(['http://x/api/events', 'http://x/api/result']);
    const body = JSON.parse(calls[1].init!.body as string);
    expect(body.session_id).toBe('S1');
    expect(body.status).toBe('completed');
    expect(body.trials_csv).toBe('a\r\n1');
  });

  it('does not retry a result the controller refused (409)', async () => {
    const { calls, impl } = fakeFetch(c => ({ status: c.url.endsWith('/api/result') ? 409 : 200 }));
    const b = new SessionBridge('S1', 'http://x', impl, clock);
    const ok = await b.submitResult({
      status: 'aborted', trials: [], trials_csv: '', events: [], summary: {}, metadata: {}, session_export: {},
    });
    expect(ok).toBe(false);
    expect(calls.filter(c => c.url.endsWith('/api/result'))).toHaveLength(1);
    expect(b.lastError).toMatch(/refused/);
  });
});
