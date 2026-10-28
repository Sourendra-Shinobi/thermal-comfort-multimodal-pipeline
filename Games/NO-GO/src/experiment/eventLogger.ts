/**
 * Event Logger
 * 
 * Central event emission system for the NO-GO task.
 * 
 * All experiment events are typed and stored in memory.
 * The current implementation logs locally only.
 * 
 * FUTURE EXTENSION POINT:
 * To add hardware synchronization (Shimmer/Consensys, LSL, WebSocket server),
 * replace the contents of the `sinks` array or call addSink() with a function
 * that forwards the event to the external system.
 * 
 * Example future usage:
 *   eventLogger.addSink(async (evt) => {
 *     await lslOutlet.pushSample([evt.event_type, evt.timestamp_perf]);
 *   });
 */

import type { ExperimentEvent, EventType } from '../types/experiment';
import { perfNow, toWallclock } from '../utils/timestamps';

export type EventSink = (event: ExperimentEvent) => void;

class EventLogger {
  private events: ExperimentEvent[] = [];
  private sinks: EventSink[] = [];

  /**
   * Register an additional event sink (e.g., WebSocket, LSL outlet).
   * The sink will be called synchronously on every emit().
   */
  addSink(sink: EventSink): void {
    this.sinks.push(sink);
  }

  /**
   * Remove all registered sinks (useful for testing).
   */
  clearSinks(): void {
    this.sinks = [];
  }

  /**
   * Emit a typed experiment event.
   * This is the primary API for recording experimental events.
   * 
   * @example
   * eventLogger.emit('STIMULUS_ONSET', { trialNumber: 17 });
   */
  emit(
    eventType: EventType,
    detail: Record<string, unknown> | null = null,
    trialNumber: number | null = null
  ): ExperimentEvent {
    const perfTime = perfNow();
    const event: ExperimentEvent = {
      event_type: eventType,
      timestamp_perf: perfTime,
      timestamp_wallclock: toWallclock(perfTime),
      trial_number: trialNumber,
      detail,
    };

    this.events.push(event);

    // Forward to external sinks (future: hardware sync)
    for (const sink of this.sinks) {
      try {
        sink(event);
      } catch (err) {
        console.error('[EventLogger] Sink error:', err);
      }
    }

    // Local debug logging — remove or conditionalize for production
    if ((import.meta as unknown as { env?: { DEV?: boolean } }).env?.DEV) {
      console.debug(`[EVT] ${event.event_type} | perf=${event.timestamp_perf.toFixed(3)}ms | trial=${event.trial_number ?? '-'}`);
    }

    return event;
  }

  /**
   * Get all recorded events (read-only snapshot).
   */
  getEvents(): ExperimentEvent[] {
    return [...this.events];
  }

  /**
   * Clear all recorded events (use with caution — for testing only).
   */
  clear(): void {
    this.events = [];
  }

  /**
   * Get event count.
   */
  get count(): number {
    return this.events.length;
  }
}

// Singleton instance — import this everywhere
export const eventLogger = new EventLogger();

/**
 * Convenience function matching the future API described in the spec:
 * 
 *   emitExperimentEvent({ type: "STIMULUS_ONSET", trialNumber: 17, timestamp: ... })
 * 
 * This wrapper ensures forward-compatibility with future hardware integration.
 */
export function emitExperimentEvent(params: {
  type: EventType;
  trialNumber?: number;
  detail?: Record<string, unknown>;
}): ExperimentEvent {
  return eventLogger.emit(params.type, params.detail ?? null, params.trialNumber ?? null);
}
