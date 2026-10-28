/**
 * Event Logger — Odd-One-Out Task
 *
 * Central event emission system for the OOO task and all integrated modalities.
 * Extended from the NO-GO task's design with:
 *   - Sequential event IDs (no duplicates)
 *   - OBS/Shimmer/Thermal event types
 *   - Acquisition status tracking
 *   - Pluggable sink pattern for hardware integration
 *
 * FUTURE EXTENSION POINTS:
 *   - OBS WebSocket: add an obsController.ts sink
 *   - Shimmer GSR: add a shimmerController.ts sink
 *   - LSL: add an LSL outlet sink
 *
 * Example future usage:
 *   eventLogger.addSink(async (evt) => {
 *     await obsWebSocket.call('SetCurrentScene', { ... });
 *   });
 */

import type { ExperimentEvent, EventType, AcquisitionStatus } from '../types/experiment';
import { perfNow, toWallclock } from '../utils/timestamps';

export type EventSink = (event: ExperimentEvent) => void | Promise<void>;

class EventLogger {
  private events: ExperimentEvent[] = [];
  private sinks: EventSink[] = [];
  private sequenceCounter = 0;

  /**
   * Register an additional event sink (e.g., OBS WebSocket, Shimmer bridge, LSL outlet).
   * Sinks are called synchronously for non-async sinks; errors are caught and logged.
   */
  addSink(sink: EventSink): void {
    this.sinks.push(sink);
  }

  /** Remove all registered sinks (useful for testing). */
  clearSinks(): void {
    this.sinks = [];
  }

  /**
   * Emit a typed experiment event.
   * This is the primary API for recording experimental events.
   *
   * @example
   * eventLogger.emit('TRIAL_STIMULUS_ONSET', { trialNumber: 17 });
   */
  emit(
    eventType: EventType,
    detail: Record<string, unknown> | null = null,
    trialNumber: number | null = null,
    acquisitionStatus?: Partial<AcquisitionStatus>
  ): ExperimentEvent {
    const perfTime = perfNow();
    const seq = ++this.sequenceCounter;

    const event: ExperimentEvent = {
      event_id: `evt-${seq.toString().padStart(6, '0')}`,
      event_sequence: seq,
      event_type: eventType,
      timestamp_perf: perfTime,
      timestamp_wallclock: toWallclock(perfTime),
      trial_number: trialNumber,
      detail,
      ...(acquisitionStatus ? { acquisition_status: acquisitionStatus } : {}),
    };

    this.events.push(event);

    // Forward to external sinks (future hardware sync)
    for (const sink of this.sinks) {
      try {
        const result = sink(event);
        if (result instanceof Promise) {
          result.catch(err => {
            console.error('[EventLogger] Async sink error:', err);
          });
        }
      } catch (err) {
        console.error('[EventLogger] Sink error:', err);
      }
    }

    // Debug logging
    if ((import.meta as unknown as { env?: { DEV?: boolean } }).env?.DEV) {
      console.debug(
        `[EVT] ${event.event_id} | ${event.event_type} | ` +
        `perf=${event.timestamp_perf.toFixed(3)}ms | trial=${event.trial_number ?? '-'}`
      );
    }

    return event;
  }

  /** Get all recorded events (read-only snapshot). */
  getEvents(): ExperimentEvent[] {
    return [...this.events];
  }

  /** Clear all recorded events (for testing only). */
  clear(): void {
    this.events = [];
    this.sequenceCounter = 0;
  }

  /** Total event count. */
  get count(): number {
    return this.events.length;
  }

  /**
   * Validate event ordering — asserts all events have strictly
   * increasing timestamps and unique IDs.
   * Returns list of violations (empty if valid).
   */
  validateOrdering(): string[] {
    const violations: string[] = [];
    const seen = new Set<string>();
    let prevPerf = -Infinity;

    for (const evt of this.events) {
      if (seen.has(evt.event_id)) {
        violations.push(`Duplicate event ID: ${evt.event_id}`);
      }
      seen.add(evt.event_id);

      if (evt.timestamp_perf < prevPerf) {
        violations.push(
          `Non-monotonic timestamp at event ${evt.event_id}: ` +
          `${evt.timestamp_perf} < ${prevPerf}`
        );
      }
      prevPerf = evt.timestamp_perf;
    }

    return violations;
  }
}

// Singleton instance — import this everywhere
export const eventLogger = new EventLogger();

/**
 * Convenience wrapper for emitting events.
 */
export function emitExperimentEvent(params: {
  type: EventType;
  trialNumber?: number;
  detail?: Record<string, unknown>;
  acquisitionStatus?: Partial<AcquisitionStatus>;
}): ExperimentEvent {
  return eventLogger.emit(
    params.type,
    params.detail ?? null,
    params.trialNumber ?? null,
    params.acquisitionStatus
  );
}
