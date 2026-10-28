/**
 * Session Bridge — connects a game to the experiment controller
 * (`python -m experiment run`, see BTP_2026/docs/ARCHITECTURE.md).
 *
 * IDENTICAL COPY in Games/NO-GO/src/integration and Games/ODD-ONE-OUT/src/integration.
 * Edit one, copy to the other; tests/test_game_integration.py fails if they differ.
 *
 * Active only when the page URL contains `?session=<id>` (the controller opens
 * the game that way). Without it, `bridge` is null and the game behaves exactly
 * as a stand-alone app.
 *
 * What it does when active:
 *   - fetches the session context (participant, condition, sync settings)
 *   - forwards every eventLogger event to the controller in small batches
 *   - sends a heartbeat with the current screen every 2 s
 *   - submits the final trials/events/summary when the task ends
 */

export type SyncPosition = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';

export interface SyncConfig {
  enabled: boolean;
  pattern_ms: number[];
  size_px: number;
  position: SyncPosition;
}

export interface SessionContext {
  session_id: string;
  participant_id: string;
  thermal_condition: string;
  block_id: string;
  task: string;
  mode: string;
  is_mock: boolean;
  is_test_session: boolean;
  notes: string;
  environment: Record<string, unknown>;
  modalities_required: { camera: boolean; shimmer: boolean };
  sync: SyncConfig;
  controller_version: string;
}

export interface ModalityStatus {
  required: boolean;
  state: string;
  confirmed: boolean;
  error?: string | null;
  mock?: boolean;
}

export interface ControllerStatus {
  session_id: string;
  mode: string;
  is_mock: boolean;
  modalities: Record<'camera' | 'shimmer', ModalityStatus>;
  all_required_confirmed: boolean;
}

/** Structural subset of both games' ExperimentEvent types. */
export interface BridgeEvent {
  event_type: string;
  timestamp_perf: number;
  timestamp_wallclock: string;
  trial_number: number | null;
  detail: Record<string, unknown> | null;
  event_sequence?: number;
}

export interface ResultPayload {
  status: 'completed' | 'aborted';
  reason?: string;
  trials: object[];
  trials_csv: string;
  events: object[];
  events_csv?: string;
  summary: unknown;
  metadata: unknown;
  session_export: unknown;
}

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export interface BridgeClock {
  perf: () => number;
  wall: () => number;
}

const defaultClock: BridgeClock = {
  perf: () => performance.now(),
  wall: () => Date.now(),
};

export function getOrchestration(
  search: string = typeof window !== 'undefined' ? window.location.search : '',
  origin: string = typeof window !== 'undefined' ? window.location.origin : '',
): { sessionId: string; apiBase: string } | null {
  const params = new URLSearchParams(search);
  const sessionId = params.get('session');
  if (!sessionId) return null;
  const api = params.get('api') ?? (origin.startsWith('http') ? origin : '');
  if (!api) return null;
  return { sessionId, apiBase: api.replace(/\/+$/, '') };
}

export class SessionBridge {
  readonly sessionId: string;
  readonly apiBase: string;
  context: SessionContext | null = null;
  lastError: string | null = null;
  sentEvents = 0;

  private queue: (BridgeEvent & { bridge_seq: number })[] = [];
  private seq = 0;
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private flushing = false;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private attached = false;
  private clockOrigin: { perf: number; wall_ms: number } | null = null;
  private readonly fetchImpl: FetchLike;
  private readonly clock: BridgeClock;

  static readonly BATCH_SIZE = 25;
  static readonly FLUSH_DELAY_MS = 250;
  static readonly MAX_QUEUE = 20000;

  constructor(sessionId: string, apiBase: string, fetchImpl?: FetchLike, clock: BridgeClock = defaultClock) {
    this.sessionId = sessionId;
    this.apiBase = apiBase;
    this.fetchImpl = fetchImpl ?? ((input, init) => fetch(input, init));
    this.clock = clock;
    this.clockOrigin = { perf: clock.perf(), wall_ms: clock.wall() };
  }

  async loadContext(): Promise<SessionContext> {
    const res = await this.fetchImpl(`${this.apiBase}/api/session`);
    if (!res.ok) throw new Error(`controller returned HTTP ${res.status}`);
    const ctx = (await res.json()) as SessionContext;
    if (ctx.session_id !== this.sessionId) {
      throw new Error(`controller is running session ${ctx.session_id}, this tab belongs to ${this.sessionId}`);
    }
    this.context = ctx;
    return ctx;
  }

  /** Register the forwarding sink once (safe under React StrictMode double effects). */
  attach(addSink: (sink: (e: BridgeEvent) => void) => void): void {
    if (this.attached) return;
    this.attached = true;
    addSink(e => this.forward(e));
    if (typeof window !== 'undefined') {
      window.addEventListener('pagehide', () => this.flushOnUnload());
    }
  }

  forward(event: BridgeEvent): void {
    this.queue.push({ ...event, bridge_seq: ++this.seq });
    if (this.queue.length > SessionBridge.MAX_QUEUE) this.queue.shift();
    if (this.queue.length >= SessionBridge.BATCH_SIZE) {
      void this.flush();
    } else if (!this.flushTimer) {
      this.flushTimer = setTimeout(() => void this.flush(), SessionBridge.FLUSH_DELAY_MS);
    }
  }

  private body(events: object[]): string {
    return JSON.stringify({
      session_id: this.sessionId,
      client: { sent_perf_ms: this.clock.perf(), sent_wall_ms: this.clock.wall(), clock_origin: this.clockOrigin },
      events,
    });
  }

  async flush(): Promise<boolean> {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    if (this.flushing || this.queue.length === 0) return this.queue.length === 0;
    this.flushing = true;
    const batch = this.queue.splice(0, this.queue.length);
    try {
      const res = await this.fetchImpl(`${this.apiBase}/api/events`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: this.body(batch),
        keepalive: true,
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      this.sentEvents += batch.length;
      this.lastError = null;
      return true;
    } catch (err) {
      this.queue.unshift(...batch); // keep order, retry later
      this.lastError = `event upload failed: ${String(err)}`;
      if (!this.flushTimer) this.flushTimer = setTimeout(() => void this.flush(), 2000);
      return false;
    } finally {
      this.flushing = false;
      if (this.queue.length >= SessionBridge.BATCH_SIZE) void this.flush();
    }
  }

  flushOnUnload(): void {
    if (this.queue.length === 0 || typeof navigator === 'undefined' || !navigator.sendBeacon) return;
    const blob = new Blob([this.body(this.queue.splice(0, this.queue.length))], { type: 'application/json' });
    navigator.sendBeacon(`${this.apiBase}/api/events`, blob);
  }

  startHeartbeat(getScreen: () => string, intervalMs = 2000): void {
    if (this.heartbeatTimer) return;
    const beat = () => {
      void this.fetchImpl(`${this.apiBase}/api/heartbeat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: this.sessionId, screen: getScreen() }),
      }).catch(() => { /* controller gone: surfaced via submitResult/lastError */ });
    };
    beat();
    this.heartbeatTimer = setInterval(beat, intervalMs);
  }

  async fetchStatus(): Promise<ControllerStatus | null> {
    try {
      const res = await this.fetchImpl(`${this.apiBase}/api/status`);
      return res.ok ? ((await res.json()) as ControllerStatus) : null;
    } catch {
      return null;
    }
  }

  /** Flush pending events, then deliver the result. Retries 3 times. */
  async submitResult(payload: ResultPayload): Promise<boolean> {
    for (let attempt = 0; attempt < 3; attempt++) {
      await this.flush();
      try {
        const res = await this.fetchImpl(`${this.apiBase}/api/result`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ session_id: this.sessionId, ...payload }),
        });
        if (res.ok) return true;
        if (res.status === 409) {
          this.lastError = 'controller refused result (already stored or session mismatch)';
          return false;
        }
        this.lastError = `result upload failed: HTTP ${res.status}`;
      } catch (err) {
        this.lastError = `result upload failed: ${String(err)}`;
      }
      await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
    }
    return false;
  }

  stop(): void {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    this.heartbeatTimer = null;
  }
}

const orchestration = getOrchestration();

/** The page's bridge, or null when the game runs stand-alone. */
export const bridge: SessionBridge | null = orchestration
  ? new SessionBridge(orchestration.sessionId, orchestration.apiBase)
  : null;
