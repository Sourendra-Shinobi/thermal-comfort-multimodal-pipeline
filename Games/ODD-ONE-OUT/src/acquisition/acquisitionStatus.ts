/**
 * Acquisition Status Manager
 *
 * Unified tracking of all acquisition device states.
 * Provides a single place to read and update the status of:
 *   - Camera (OBS)
 *   - GSR (Shimmer)
 *   - Thermal camera (external, no direct control)
 */

import type { AcquisitionStatus, AcquisitionMode, DeviceStatus } from '../types/experiment';

function makeDefaultStatus(mode: AcquisitionMode): AcquisitionStatus {
  return {
    mode,
    camera: {
      status: 'UNKNOWN',
      recordingStarted: false,
      recordingStartTimestamp: null,
      recordingStopTimestamp: null,
      outputFile: null,
      error: null,
    },
    gsr: {
      status: 'UNKNOWN',
      recordingStarted: false,
      recordingStartTimestamp: null,
      recordingStopTimestamp: null,
      outputFile: null,
      error: null,
    },
    thermal: {
      status: 'NOT_CONFIGURED',
      note: 'Thermal camera is a separate acquisition stream. Align using logged event timestamps.',
    },
  };
}

class AcquisitionStatusManager {
  private _status: AcquisitionStatus = makeDefaultStatus('GAME_ONLY_TEST');

  get(): AcquisitionStatus {
    return { ...this._status };
  }

  setMode(mode: AcquisitionMode): void {
    this._status.mode = mode;
  }

  updateCamera(updates: Partial<AcquisitionStatus['camera']>): void {
    this._status.camera = { ...this._status.camera, ...updates };
  }

  updateGSR(updates: Partial<AcquisitionStatus['gsr']>): void {
    this._status.gsr = { ...this._status.gsr, ...updates };
  }

  setCameraStatus(status: DeviceStatus): void {
    this._status.camera.status = status;
  }

  setGSRStatus(status: DeviceStatus): void {
    this._status.gsr.status = status;
  }

  reset(mode: AcquisitionMode): void {
    this._status = makeDefaultStatus(mode);
  }

  /**
   * Returns true if the session is genuinely multimodal
   * (camera recording started AND GSR recording started).
   * A session is NOT multimodal if only the game ran.
   */
  isFullyMultimodal(): boolean {
    return (
      this._status.camera.recordingStarted &&
      this._status.gsr.recordingStarted
    );
  }

  /**
   * Returns a summary suitable for export metadata.
   */
  getSummary(): {
    camera_recorded: boolean;
    gsr_recorded: boolean;
    session_complete: boolean;
  } {
    return {
      camera_recorded: this._status.camera.recordingStarted,
      gsr_recorded: this._status.gsr.recordingStarted,
      session_complete:
        this._status.camera.status === 'STOPPED' &&
        (this._status.mode === 'GAME_ONLY_TEST' ||
          this._status.mode === 'CAMERA_GAME_TEST' ||
          this._status.gsr.status === 'STOPPED'),
    };
  }
}

/** Singleton acquisition status manager. */
export const acquisitionStatus = new AcquisitionStatusManager();
