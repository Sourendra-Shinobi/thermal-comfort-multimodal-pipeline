/**
 * ReadinessCheck Component
 *
 * Pre-experiment operator checklist for verifying all acquisition devices
 * are ready before a participant session begins.
 *
 * For GAME_ONLY_TEST mode: minimal checks (software only).
 * For CAMERA_GAME_TEST mode: verifies OBS is reachable.
 * For FULL_MULTIMODAL: verifies OBS + Shimmer bridge.
 *
 * The operator must explicitly acknowledge each device status.
 * A real participant session cannot begin until all required devices pass.
 *
 * When launched by the experiment controller, the controller owns OBS and
 * Shimmer; this screen then asks the controller (GET /api/status) whether
 * each required recording is confirmed, instead of contacting the devices.
 */

import React, { useState, useCallback, useEffect } from 'react';
import type { SessionBridge, ModalityStatus } from '../integration/sessionBridge';
import type { AcquisitionMode } from '../types/experiment';
import { obsController } from '../acquisition/obsController';
import { shimmerController } from '../acquisition/shimmerController';
import { acquisitionStatus } from '../acquisition/acquisitionStatus';
import { nowWallclock } from '../utils/timestamps';

interface ReadinessCheckProps {
  mode: AcquisitionMode;
  /** Present when orchestrated by the experiment controller. */
  controllerBridge?: SessionBridge | null;
  onReady: () => void;
  onAbort: () => void;
}

type CheckStatus = 'PENDING' | 'CHECKING' | 'PASS' | 'FAIL' | 'SKIPPED';

interface DeviceCheck {
  id: string;
  label: string;
  status: CheckStatus;
  message: string;
  required: boolean;
}

export const ReadinessCheck: React.FC<ReadinessCheckProps> = ({ mode, controllerBridge, onReady, onAbort }) => {
  const orchestrated = Boolean(controllerBridge?.context);
  const required = controllerBridge?.context?.modalities_required;
  const requiresCamera = required ? required.camera : mode === 'FULL_MULTIMODAL' || mode === 'CAMERA_GAME_TEST';
  const requiresGSR = required ? required.shimmer : mode === 'FULL_MULTIMODAL' || mode === 'SHIMMER_GAME_TEST';

  const [checks, setChecks] = useState<DeviceCheck[]>([
    {
      id: 'obs',
      label: orchestrated ? 'Camera recording (experiment controller)' : 'OBS Studio WebSocket',
      status: requiresCamera ? 'PENDING' : 'SKIPPED',
      message: requiresCamera ? 'Not yet checked' : 'Skipped (mode does not require camera)',
      required: requiresCamera,
    },
    {
      id: 'shimmer',
      label: orchestrated ? 'Shimmer recording (experiment controller)' : 'Shimmer GSR Bridge',
      status: requiresGSR ? 'PENDING' : 'SKIPPED',
      message: requiresGSR ? 'Not yet checked' : 'Skipped (mode does not require GSR)',
      required: requiresGSR,
    },
    {
      id: 'thermal',
      label: 'Thermal Camera (external)',
      status: 'SKIPPED',
      message: 'External device — verify manually that recording is started. No software control.',
      required: false,
    },
  ]);

  const [isCheckingAll, setIsCheckingAll] = useState(false);

  const updateCheck = useCallback((id: string, updates: Partial<DeviceCheck>) => {
    setChecks(prev =>
      prev.map(c => (c.id === id ? { ...c, ...updates } : c))
    );
  }, []);

  const checkViaController = useCallback(async (id: 'obs' | 'shimmer') => {
    updateCheck(id, { status: 'CHECKING', message: 'Asking experiment controller...' });
    const status = await controllerBridge!.fetchStatus();
    const m: ModalityStatus | undefined = status?.modalities[id === 'obs' ? 'camera' : 'shimmer'];
    if (!status || !m) {
      updateCheck(id, { status: 'FAIL', message: '✗ Experiment controller not reachable.' });
      return;
    }
    const mock = m.mock ? ' (MOCK/SIMULATED)' : '';
    updateCheck(id, m.confirmed
      ? { status: 'PASS', message: `✓ Recording confirmed by controller: ${m.state}${mock}` }
      : { status: 'FAIL', message: `✗ Controller reports ${m.state}${m.error ? `: ${m.error}` : ''}` });
    if (m.confirmed) {
      const update = { status: 'RECORDING' as const, recordingStarted: true };
      if (id === 'obs') acquisitionStatus.updateCamera(update); else acquisitionStatus.updateGSR(update);
    }
  }, [controllerBridge, updateCheck]);

  const checkOBS = useCallback(async () => {
    if (!requiresCamera) return;
    if (orchestrated) return checkViaController('obs');
    updateCheck('obs', { status: 'CHECKING', message: 'Connecting to OBS WebSocket...' });
    const connected = await obsController.connect();
    if (connected) {
      const recStatus = await obsController.getRecordingStatus();
      const msg = recStatus.isRecording
        ? '⚠ OBS is already recording. Stop existing recording before starting a new session.'
        : '✓ Connected. Not currently recording.';
      updateCheck('obs', {
        status: recStatus.isRecording ? 'FAIL' : 'PASS',
        message: msg,
      });
      acquisitionStatus.setCameraStatus(recStatus.isRecording ? 'RECORDING' : 'CONNECTED');
    } else {
      updateCheck('obs', {
        status: 'FAIL',
        message: '✗ Cannot reach OBS WebSocket. Ensure OBS is running with WebSocket server enabled.',
      });
    }
  }, [requiresCamera, orchestrated, checkViaController, updateCheck]);

  const checkShimmer = useCallback(async () => {
    if (!requiresGSR) return;
    if (orchestrated) return checkViaController('shimmer');
    updateCheck('shimmer', { status: 'CHECKING', message: 'Checking Shimmer bridge...' });
    const status = await shimmerController.checkStatus();
    if (status.status === 'BRIDGE_UNREACHABLE') {
      updateCheck('shimmer', {
        status: 'FAIL',
        message: `✗ Shimmer bridge not reachable at localhost:8765. Start shimmer_bridge.py first.`,
      });
    } else if (!status.device_connected) {
      updateCheck('shimmer', {
        status: 'FAIL',
        message: `✗ Bridge reachable but Shimmer device not connected. Check USB/BT connection.`,
      });
    } else {
      updateCheck('shimmer', {
        status: 'PASS',
        message: `✓ Bridge reachable. Shimmer device connected. Config: ${JSON.stringify(status.sensor_config)}`,
      });
      acquisitionStatus.setGSRStatus('CONNECTED');
    }
  }, [requiresGSR, orchestrated, checkViaController, updateCheck]);

  const runAllChecks = useCallback(async () => {
    setIsCheckingAll(true);
    if (requiresCamera) await checkOBS();
    if (requiresGSR) await checkShimmer();
    setIsCheckingAll(false);
  }, [requiresCamera, requiresGSR, checkOBS, checkShimmer]);

  useEffect(() => {
    if (orchestrated) void runAllChecks();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const allRequiredPassed = checks
    .filter(c => c.required)
    .every(c => c.status === 'PASS');

  const canProceed = mode === 'GAME_ONLY_TEST' || allRequiredPassed;

  return (
    <div className="screen readiness-screen">
      <div className="screen-content">
        <div className="study-badge">PRE-EXPERIMENT READINESS CHECK</div>
        <h1 className="screen-title">Device Readiness</h1>
        <p className="screen-subtitle">
          Verify all required acquisition devices are ready before the participant begins.
          {mode === 'GAME_ONLY_TEST' && (
            <strong> SOFTWARE TEST MODE — no hardware required.</strong>
          )}
        </p>

        <div className="readiness-checklist">
          {checks.map(check => (
            <div key={check.id} className={`readiness-item readiness-item--${check.status.toLowerCase()}`}>
              <div className="readiness-item-header">
                <span className="readiness-item-label">{check.label}</span>
                <span className={`readiness-badge readiness-badge--${check.status.toLowerCase()}`}>
                  {check.status}
                </span>
              </div>
              <p className="readiness-item-message">{check.message}</p>
            </div>
          ))}
        </div>

        {mode !== 'GAME_ONLY_TEST' && (
          <div className="readiness-thermal-note">
            <strong>Thermal camera:</strong> External device. Confirm recording is started manually
            before proceeding. Event timestamps will be exported for post-hoc alignment.
            Timestamp: <code>{nowWallclock()}</code>
          </div>
        )}

        <div className="button-group">
          <button
            id="btn-abort-readiness"
            className="btn btn-secondary"
            onClick={onAbort}
            type="button"
          >
            ← BACK
          </button>

          {mode !== 'GAME_ONLY_TEST' && (
            <button
              id="btn-run-checks"
              className="btn btn-secondary"
              onClick={runAllChecks}
              disabled={isCheckingAll}
              type="button"
            >
              {isCheckingAll ? 'CHECKING...' : 'RUN DEVICE CHECKS'}
            </button>
          )}

          <button
            id="btn-proceed-readiness"
            className="btn btn-primary"
            onClick={onReady}
            disabled={!canProceed}
            type="button"
          >
            {canProceed ? 'PROCEED TO TASK →' : 'WAITING FOR CHECKS'}
          </button>
        </div>

        {!canProceed && (
          <p className="readiness-fail-note">
            All required devices must pass checks before proceeding.
            Run checks above or switch to GAME_ONLY_TEST mode.
          </p>
        )}
      </div>
    </div>
  );
};
