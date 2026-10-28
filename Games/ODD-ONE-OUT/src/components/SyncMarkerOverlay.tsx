/**
 * SyncMarkerOverlay Component
 *
 * Displays a configurable visual synchronization marker on top of the task.
 *
 * PURPOSE:
 * Provides a visual landmark that can be identified in camera recordings,
 * allowing offline alignment of software events with video/physiological data.
 *
 * IMPORTANT CAVEATS (read before using in experiments):
 * - The software logs the marker onset/offset timestamp.
 * - The actual pixel change reaching the camera depends on:
 *   (a) browser rendering and compositing pipeline
 *   (b) display refresh rate and VSync
 *   (c) camera frame rate and capture latency
 *   (d) video encoding delay
 * - Estimated capture-to-software offset must be measured during pilot testing.
 * - Do NOT assume perfect synchronization based on software timestamps alone.
 * - This marker is NOT visible in thermal camera footage unless it covers a
 *   thermal-emissive area. Test separately.
 *
 * The marker is rendered in the corner of the screen, away from the stimulus,
 * to minimize cognitive interference.
 */

import React, { useEffect, useRef } from 'react';
import { eventLogger } from '../experiment/eventLogger';

export type MarkerType = 'WHITE' | 'BLACK' | 'RED' | 'GREEN' | 'BLUE' | 'YELLOW';

const MARKER_COLORS: Record<MarkerType, string> = {
  WHITE: '#ffffff',
  BLACK: '#000000',
  RED: '#cc0000',
  GREEN: '#00aa00',
  BLUE: '#0055cc',
  YELLOW: '#ccaa00',
};

interface SyncMarkerOverlayProps {
  visible: boolean;
  markerType: MarkerType;
  durationMs: number;
  onMarkerComplete?: () => void;
  /** Size in pixels */
  sizePx?: number;
  /** Corner position */
  position?: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
}

export const SyncMarkerOverlay: React.FC<SyncMarkerOverlayProps> = ({
  visible,
  markerType,
  durationMs,
  onMarkerComplete,
  sizePx = 60,
  position = 'top-right',
}) => {
  const hasLoggedOnset = useRef(false);
  const onsetPerfRef = useRef<number | null>(null);

  useEffect(() => {
    if (visible && !hasLoggedOnset.current) {
      hasLoggedOnset.current = true;
      onsetPerfRef.current = performance.now();

      eventLogger.emit('SYNC_MARKER_ONSET', {
        marker_type: markerType,
        duration_ms: durationMs,
        position,
        size_px: sizePx,
        note: 'Software timestamp only. Camera capture delay not measured.',
      });

      const timer = setTimeout(() => {
        eventLogger.emit('SYNC_MARKER_OFFSET', {
          marker_type: markerType,
          onset_perf: onsetPerfRef.current,
          offset_perf: performance.now(),
        });
        if (onMarkerComplete) onMarkerComplete();
        hasLoggedOnset.current = false;
      }, durationMs);

      return () => clearTimeout(timer);
    }
  }, [visible, markerType, durationMs, position, sizePx, onMarkerComplete]);

  if (!visible) return null;

  const positionStyles: React.CSSProperties = {
    position: 'fixed',
    zIndex: 9999,
    width: `${sizePx}px`,
    height: `${sizePx}px`,
    backgroundColor: MARKER_COLORS[markerType],
    ...(position === 'top-left' ? { top: 0, left: 0 } : {}),
    ...(position === 'top-right' ? { top: 0, right: 0 } : {}),
    ...(position === 'bottom-left' ? { bottom: 0, left: 0 } : {}),
    ...(position === 'bottom-right' ? { bottom: 0, right: 0 } : {}),
  };

  return (
    <div
      className="sync-marker-overlay"
      aria-hidden="true"
      data-marker-type={markerType}
      style={positionStyles}
    />
  );
};
