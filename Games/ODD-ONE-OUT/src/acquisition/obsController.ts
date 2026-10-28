/**
 * OBS WebSocket Controller
 *
 * Controls OBS Studio recording via its WebSocket API (OBS-WebSocket v5).
 *
 * STATUS: STUB — No OBS WebSocket code existed in the original NO-GO project.
 * This adapter provides the full interface. Real OBS WebSocket integration
 * requires:
 *   1. OBS Studio installed with the obs-websocket plugin (v5+).
 *   2. The browser to connect via a WebSocket to ws://localhost:4455
 *      (or configured host/port).
 *   3. Pilot testing to verify recording start/stop timing.
 *
 * VALIDATION STATUS: NOT HARDWARE TESTED
 * The browser-side WebSocket code is implemented here.
 * Actual device round-trip latency has not been measured.
 *
 * Integration note:
 * This controller emits events via eventLogger so that all OBS lifecycle
 * events are time-stamped and included in the session export.
 */

import { eventLogger } from '../experiment/eventLogger';
import { nowWallclock, perfNow } from '../utils/timestamps';

export interface OBSConnectionConfig {
  /** WebSocket URL. Default: ws://localhost:4455 */
  url: string;
  /** OBS WebSocket password (if set in OBS settings) */
  password?: string;
  /** Connection timeout in ms */
  timeoutMs: number;
}

export interface OBSRecordingStatus {
  isRecording: boolean;
  outputPath: string | null;
  error: string | null;
  lastChecked: string | null;
}

export type OBSStatus =
  | 'DISCONNECTED'
  | 'CONNECTING'
  | 'CONNECTED'
  | 'RECORDING'
  | 'STOPPED'
  | 'ERROR';

class OBSController {
  private ws: WebSocket | null = null;
  private status: OBSStatus = 'DISCONNECTED';
  private config: OBSConnectionConfig = {
    url: 'ws://localhost:4455',
    timeoutMs: 5000,
  };
  private messageId = 0;
  private pendingRequests: Map<string, {
    resolve: (value: unknown) => void;
    reject: (reason: unknown) => void;
  }> = new Map();

  /**
   * Configure the OBS WebSocket connection.
   * Call before connect().
   */
  configure(cfg: Partial<OBSConnectionConfig>): void {
    this.config = { ...this.config, ...cfg };
  }

  getStatus(): OBSStatus {
    return this.status;
  }

  /**
   * Attempt to connect to OBS WebSocket.
   *
   * Returns true if connected successfully, false otherwise.
   * Emits CAMERA_START_REQUESTED event.
   *
   * NOTE: OBS WebSocket v5 uses a different handshake than v4.
   * This implementation targets v5 (OBS 28+).
   * Full authentication is required if password is set.
   */
  async connect(): Promise<boolean> {
    if (this.status === 'CONNECTED' || this.status === 'RECORDING') {
      console.warn('[OBSController] Already connected');
      return true;
    }

    eventLogger.emit('CAMERA_CONNECTION_REQUESTED', {
      obs_url: this.config.url,
      request_timestamp: nowWallclock(),
    });

    return new Promise((resolve) => {
      try {
        this.ws = new WebSocket(this.config.url);
        this.status = 'CONNECTING';

        const timeout = setTimeout(() => {
          if (this.status === 'CONNECTING') {
            this.status = 'ERROR';
            this.ws?.close();
            eventLogger.emit('DEVICE_ERROR', {
              device: 'OBS',
              error: 'Connection timeout',
              url: this.config.url,
            });
            resolve(false);
          }
        }, this.config.timeoutMs);

        this.ws.onopen = () => {
          clearTimeout(timeout);
          // OBS WS v5 sends a Hello message on connect; we handle it in onmessage
        };

        this.ws.onmessage = (event) => {
          try {
            const msg = JSON.parse(event.data as string) as Record<string, unknown>;
            void this.handleMessage(msg, resolve);
          } catch (err) {
            console.error('[OBSController] Failed to parse message:', err);
          }
        };

        this.ws.onerror = () => {
          clearTimeout(timeout);
          this.status = 'ERROR';
          eventLogger.emit('DEVICE_ERROR', {
            device: 'OBS',
            error: 'WebSocket error',
            url: this.config.url,
          });
          resolve(false);
        };

        this.ws.onclose = () => {
          if (this.status !== 'ERROR') this.status = 'DISCONNECTED';
        };
      } catch (err) {
        eventLogger.emit('DEVICE_ERROR', {
          device: 'OBS',
          error: String(err),
        });
        resolve(false);
      }
    });
  }

  private async handleMessage(
    msg: Record<string, unknown>,
    connectResolve?: (value: boolean) => void
  ): Promise<void> {
    const opCode = msg['op'] as number | undefined;

    // OBS WS v5 Op 0: Hello -> Op 1: Identify (with authentication if OBS asks for it)
    if (opCode === 0) {
      const auth = (msg['d'] as Record<string, unknown> | undefined)?.['authentication'] as
        | { challenge: string; salt: string }
        | undefined;
      const identify: Record<string, unknown> = { rpcVersion: 1 };
      if (auth) {
        identify['authentication'] = await obsAuthString(this.config.password ?? '', auth.salt, auth.challenge);
      }
      this.sendRaw({ op: 1, d: identify });
    }

    // OBS WS v5 Op 2: Identified (connection successful)
    if (opCode === 2) {
      this.status = 'CONNECTED';
      eventLogger.emit('CAMERA_CONNECTED', {
        obs_status: 'CONNECTED',
        note: 'OBS WebSocket identified (not yet recording)',
        timestamp: nowWallclock(),
      });
      if (connectResolve) connectResolve(true);
    }

    // OBS WS v5 Op 7: RequestResponse
    if (opCode === 7) {
      const d = msg['d'] as Record<string, unknown> | undefined;
      const requestId = d?.['requestId'] as string | undefined;
      if (requestId && this.pendingRequests.has(requestId)) {
        const { resolve } = this.pendingRequests.get(requestId)!;
        this.pendingRequests.delete(requestId);
        resolve(d);
      }
    }
  }

  /**
   * Start OBS recording.
   * Returns status including whether recording started and any error.
   */
  async startRecording(): Promise<{ success: boolean; error: string | null }> {
    if (this.status === 'RECORDING') {
      console.warn('[OBSController] Already recording');
      return { success: true, error: null };
    }

    if (this.status !== 'CONNECTED') {
      const msg = `Cannot start recording: OBS status is ${this.status}`;
      eventLogger.emit('DEVICE_ERROR', { device: 'OBS', error: msg });
      return { success: false, error: msg };
    }

    try {
      const response = await this.sendRequest('StartRecord');
      const resp = response as Record<string, unknown>;
      const rc = (resp['requestStatus'] as Record<string, unknown>)?.['code'];

      if (rc === 100) {
        // Success
        this.status = 'RECORDING';
        eventLogger.emit('CAMERA_RECORDING_CONFIRMED', {
          obs_status: 'RECORDING',
          timestamp: nowWallclock(),
          perf: perfNow(),
        });
        return { success: true, error: null };
      } else {
        const errMsg = `OBS recording start failed with code ${rc}`;
        eventLogger.emit('DEVICE_ERROR', { device: 'OBS', error: errMsg });
        return { success: false, error: errMsg };
      }
    } catch (err) {
      const errMsg = String(err);
      eventLogger.emit('DEVICE_ERROR', { device: 'OBS', error: errMsg });
      return { success: false, error: errMsg };
    }
  }

  /**
   * Stop OBS recording.
   */
  async stopRecording(): Promise<{ success: boolean; outputFile: string | null; error: string | null }> {
    eventLogger.emit('CAMERA_STOP_REQUESTED', {
      obs_status: this.status,
      timestamp: nowWallclock(),
      perf: perfNow(),
    });

    if (this.status !== 'RECORDING') {
      const msg = `Cannot stop recording: OBS status is ${this.status}`;
      return { success: false, outputFile: null, error: msg };
    }

    try {
      const response = await this.sendRequest('StopRecord');
      const resp = response as Record<string, unknown>;
      const rc = (resp['requestStatus'] as Record<string, unknown>)?.['code'];
      const outputPath = (resp['responseData'] as Record<string, unknown>)?.['outputPath'] as string | null ?? null;

      if (rc === 100) {
        this.status = 'STOPPED';
        eventLogger.emit('CAMERA_RECORDING_STOPPED', {
          obs_status: 'STOPPED',
          output_file: outputPath,
          timestamp: nowWallclock(),
          perf: perfNow(),
        });
        return { success: true, outputFile: outputPath, error: null };
      } else {
        const errMsg = `OBS recording stop failed with code ${rc}`;
        eventLogger.emit('DEVICE_ERROR', { device: 'OBS', error: errMsg });
        return { success: false, outputFile: null, error: errMsg };
      }
    } catch (err) {
      const errMsg = String(err);
      eventLogger.emit('DEVICE_ERROR', { device: 'OBS', error: errMsg });
      return { success: false, outputFile: null, error: errMsg };
    }
  }

  /**
   * Get current recording status from OBS.
   */
  async getRecordingStatus(): Promise<OBSRecordingStatus> {
    if (this.status !== 'CONNECTED' && this.status !== 'RECORDING') {
      return {
        isRecording: false,
        outputPath: null,
        error: `Not connected (status: ${this.status})`,
        lastChecked: nowWallclock(),
      };
    }

    try {
      const response = await this.sendRequest('GetRecordStatus');
      const resp = response as Record<string, unknown>;
      const d = resp['responseData'] as Record<string, unknown> | undefined;
      return {
        isRecording: (d?.['outputActive'] as boolean) ?? false,
        outputPath: (d?.['outputPath'] as string | null) ?? null,
        error: null,
        lastChecked: nowWallclock(),
      };
    } catch (err) {
      return {
        isRecording: false,
        outputPath: null,
        error: String(err),
        lastChecked: nowWallclock(),
      };
    }
  }

  disconnect(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.status = 'DISCONNECTED';
  }

  // ─── Internal helpers ───────────────────────────────────────────────────

  private sendRaw(data: unknown): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
    }
  }

  private sendRequest(requestType: string, requestData?: unknown): Promise<unknown> {
    const id = `req-${++this.messageId}`;
    return new Promise((resolve, reject) => {
      this.pendingRequests.set(id, { resolve, reject });
      this.sendRaw({
        op: 6,
        d: {
          requestType,
          requestId: id,
          ...(requestData ? { requestData } : {}),
        },
      });
      // Timeout for individual requests
      setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id);
          reject(new Error(`Request ${requestType} timed out`));
        }
      }, 5000);
    });
  }
}

/**
 * OBS WebSocket v5 authentication string:
 *   secret = base64(sha256(password + salt)); auth = base64(sha256(secret + challenge))
 * Same algorithm as BTP_2026/experiment/adapters/obs_camera.py.
 */
export async function obsAuthString(password: string, salt: string, challenge: string): Promise<string> {
  const sha256b64 = async (text: string) => {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
    return btoa(String.fromCharCode(...new Uint8Array(digest)));
  };
  return sha256b64((await sha256b64(password + salt)) + challenge);
}

/**
 * Singleton OBS controller instance.
 *
 * ⚠ VALIDATION STATUS: NOT HARDWARE TESTED
 * The OBS WebSocket protocol is implemented per the v5 spec.
 * Round-trip latency between software event and actual recording frame
 * has not been measured. Do not assume zero latency.
 */
export const obsController = new OBSController();
