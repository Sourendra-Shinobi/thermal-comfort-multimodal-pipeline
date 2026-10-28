/**
 * SyncFlash — coded corner flash for aligning the RGB video with event logs.
 *
 * IDENTICAL COPY in Games/NO-GO and Games/ODD-ONE-OUT (see sessionBridge.ts).
 *
 * Shows a white square that alternates ON/OFF according to `pattern_ms`
 * (starting with ON). Each change is applied by writing the element's style
 * inside a requestAnimationFrame callback and reported through `onEvent`
 * from that same callback, so the logged time is the start of the frame in
 * which the change was committed. The photons appear later by the display
 * latency (≥ 1 refresh); the camera samples them at its own frame rate.
 * See docs/SYNCHRONIZATION.md for how the offset is measured from the video.
 */

import React, { useEffect, useRef } from 'react';
import type { SyncConfig } from './sessionBridge';

export type SyncEventType =
  | 'SYNC_SEQUENCE_STARTED'
  | 'SYNC_MARKER_ONSET'
  | 'SYNC_MARKER_OFFSET'
  | 'SYNC_SEQUENCE_COMPLETED';

interface SyncFlashProps {
  config: SyncConfig;
  /** e.g. 'session_start' / 'session_end'; logged as detail.sequence */
  sequence: string;
  onEvent: (type: SyncEventType, detail: Record<string, unknown>) => void;
  onDone: () => void;
}

const POSITIONS: Record<SyncConfig['position'], React.CSSProperties> = {
  'top-left': { top: 0, left: 0 },
  'top-right': { top: 0, right: 0 },
  'bottom-left': { bottom: 0, left: 0 },
  'bottom-right': { bottom: 0, right: 0 },
};

export const SyncFlash: React.FC<SyncFlashProps> = ({ config, sequence, onEvent, onDone }) => {
  const ref = useRef<HTMLDivElement>(null);
  const onEventRef = useRef(onEvent);
  const onDoneRef = useRef(onDone);
  onEventRef.current = onEvent;
  onDoneRef.current = onDone;

  useEffect(() => {
    const el = ref.current;
    const pattern = config.pattern_ms;
    if (!el || pattern.length === 0) {
      onDoneRef.current();
      return;
    }
    const base = { marker_source: 'session_sync_sequence', sequence, position: config.position, size_px: config.size_px };
    let phase = 0;
    let phaseStart = 0;
    let raf = 0;
    let pulse = 0;

    const apply = (on: boolean) => {
      el.style.opacity = on ? '1' : '0';
      onEventRef.current(on ? 'SYNC_MARKER_ONSET' : 'SYNC_MARKER_OFFSET', {
        ...base,
        pulse_index: on ? pulse : pulse - 1,
        duration_ms: on ? pattern[phase] : undefined,
      });
      if (on) pulse++;
    };

    const tick = () => {
      const now = performance.now();
      if (now - phaseStart >= pattern[phase]) {
        phase++;
        if (phase >= pattern.length) {
          if (phase % 2 === 1) apply(false); // last phase was ON
          onEventRef.current('SYNC_SEQUENCE_COMPLETED', { ...base, pulses: pulse });
          onDoneRef.current();
          return;
        }
        apply(phase % 2 === 0);
        phaseStart = now;
      }
      raf = requestAnimationFrame(tick);
    };

    onEventRef.current('SYNC_SEQUENCE_STARTED', { ...base, pattern_ms: pattern });
    raf = requestAnimationFrame(() => {
      apply(true);
      phaseStart = performance.now();
      raf = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(raf);
  }, [config, sequence]);

  return (
    <div
      ref={ref}
      className="sync-flash"
      aria-hidden="true"
      data-sequence={sequence}
      style={{
        position: 'fixed',
        zIndex: 10000,
        width: `${config.size_px}px`,
        height: `${config.size_px}px`,
        backgroundColor: '#ffffff',
        opacity: 0,
        pointerEvents: 'none',
        ...POSITIONS[config.position],
      }}
    />
  );
};
