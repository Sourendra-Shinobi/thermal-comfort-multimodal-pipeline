/**
 * Shimmer GSR Controller
 *
 * Interface between the browser-based ODD-ONE-OUT task and the Shimmer GSR
 * device acquisition, mediated through a local Python HTTP bridge.
 *
 * STATUS: STUB — No Shimmer Python bridge existed in the original NO-GO project.
 * The Shimmer Python API is developed separately. This adapter connects to it
 * via a local HTTP server running on the same machine.
 *
 * REQUIRED SETUP:
 *   1. Run the Shimmer Python bridge server (shimmer_bridge.py) on localhost.
 *   2. Default port: 8765
 *   3. The bridge must expose the endpoints defined below.
 *   4. Verify device connection before starting the experiment.
 *
 * VALIDATION STATUS: NOT HARDWARE TESTED
 * The HTTP API contract is defined here. Actual Shimmer hardware round-trip
 * timing has not been measured or validated.
 *
 * ARCHITECTURE NOTE:
 * The browser cannot directly import or execute Python code.
 * This controller communicates with the Python process via HTTP,
 * keeping the bridge separate from the task logic.
 */

import { eventLogger } from '../experiment/eventLogger';
import { nowWallclock, perfNow } from '../utils/timestamps';

export interface ShimmerBridgeConfig {
  /** URL of the local Python bridge server */
  baseUrl: string;
  /** Request timeout in ms */
  timeoutMs: number;
}

export type ShimmerStatus =
  | 'UNKNOWN'
  | 'BRIDGE_UNREACHABLE'
  | 'DEVICE_DISCONNECTED'
  | 'IDLE'
  | 'RECORDING'
  | 'ERROR';

export interface ShimmerStatusResponse {
  status: ShimmerStatus;
  device_connected: boolean;
  sensor_config: Record<string, unknown> | null;
  output_file: string | null;
  error: string | null;
  bridge_version: string | null;
}

class ShimmerController {
  private config: ShimmerBridgeConfig = {
    baseUrl: 'http://localhost:8765',
    timeoutMs: 5000,
  };
  private currentStatus: ShimmerStatus = 'UNKNOWN';

  configure(cfg: Partial<ShimmerBridgeConfig>): void {
    this.config = { ...this.config, ...cfg };
  }

  getStatus(): ShimmerStatus {
    return this.currentStatus;
  }

  /**
   * Check if the Python bridge is reachable and get device status.
   *
   * Expected Python bridge endpoint: GET /status
   * Expected response: ShimmerStatusResponse JSON
   */
  async checkStatus(): Promise<ShimmerStatusResponse> {
    try {
      const response = await fetchWithTimeout(
        `${this.config.baseUrl}/status`,
        { method: 'GET' },
        this.config.timeoutMs
      );

      if (!response.ok) {
        this.currentStatus = 'ERROR';
        return {
          status: 'ERROR',
          device_connected: false,
          sensor_config: null,
          output_file: null,
          error: `Bridge returned HTTP ${response.status}`,
          bridge_version: null,
        };
      }

      const data = await response.json() as ShimmerStatusResponse;
      this.currentStatus = data.status;
      return data;
    } catch (err) {
      this.currentStatus = 'BRIDGE_UNREACHABLE';
      return {
        status: 'BRIDGE_UNREACHABLE',
        device_connected: false,
        sensor_config: null,
        output_file: null,
        error: String(err),
        bridge_version: null,
      };
    }
  }

  /**
   * Start GSR recording.
   *
   * Expected Python bridge endpoint: POST /start
   * Expected response: { success: boolean, error: string | null, output_file: string | null }
   *
   * IMPORTANT: This method verifies device connectivity before starting.
   * It will NOT silently continue if the device is not ready.
   */
  async startRecording(sessionId: string): Promise<{
    success: boolean;
    error: string | null;
    outputFile: string | null;
  }> {
    const requestTimestamp = nowWallclock();
    const requestPerf = perfNow();

    eventLogger.emit('GSR_START_REQUESTED', {
      session_id: sessionId,
      request_timestamp: requestTimestamp,
      request_perf: requestPerf,
      bridge_url: this.config.baseUrl,
    });

    // First verify device status
    const status = await this.checkStatus();
    if (!status.device_connected) {
      const errMsg = `Shimmer device not connected: ${status.error ?? status.status}`;
      eventLogger.emit('DEVICE_ERROR', {
        device: 'Shimmer',
        error: errMsg,
        status: status.status,
      });
      return { success: false, error: errMsg, outputFile: null };
    }

    try {
      const response = await fetchWithTimeout(
        `${this.config.baseUrl}/start`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ session_id: sessionId }),
        },
        this.config.timeoutMs
      );

      const data = await response.json() as {
        success: boolean;
        error: string | null;
        output_file: string | null;
      };

      if (data.success) {
        this.currentStatus = 'RECORDING';
        eventLogger.emit('GSR_RECORDING_CONFIRMED', {
          session_id: sessionId,
          confirmation_timestamp: nowWallclock(),
          confirmation_perf: perfNow(),
          output_file: data.output_file,
          note: 'VALIDATION PENDING: hardware acquisition not yet tested',
        });
      } else {
        eventLogger.emit('DEVICE_ERROR', {
          device: 'Shimmer',
          error: data.error ?? 'Unknown error',
        });
      }

      return {
        success: data.success,
        error: data.error,
        outputFile: data.output_file,
      };
    } catch (err) {
      const errMsg = String(err);
      this.currentStatus = 'ERROR';
      eventLogger.emit('DEVICE_ERROR', { device: 'Shimmer', error: errMsg });
      return { success: false, error: errMsg, outputFile: null };
    }
  }

  /**
   * Stop GSR recording.
   *
   * Expected Python bridge endpoint: POST /stop
   */
  async stopRecording(): Promise<{
    success: boolean;
    error: string | null;
    outputFile: string | null;
  }> {
    const requestTimestamp = nowWallclock();
    const requestPerf = perfNow();

    eventLogger.emit('GSR_STOP_REQUESTED', {
      request_timestamp: requestTimestamp,
      request_perf: requestPerf,
    });

    if (this.currentStatus !== 'RECORDING') {
      const msg = `Cannot stop: Shimmer status is ${this.currentStatus}`;
      return { success: false, error: msg, outputFile: null };
    }

    try {
      const response = await fetchWithTimeout(
        `${this.config.baseUrl}/stop`,
        { method: 'POST' },
        this.config.timeoutMs
      );

      const data = await response.json() as {
        success: boolean;
        error: string | null;
        output_file: string | null;
      };

      if (data.success) {
        this.currentStatus = 'IDLE';
        eventLogger.emit('GSR_RECORDING_STOPPED', {
          confirmation_timestamp: nowWallclock(),
          confirmation_perf: perfNow(),
          output_file: data.output_file,
        });
      } else {
        eventLogger.emit('DEVICE_ERROR', {
          device: 'Shimmer',
          error: data.error ?? 'Stop failed',
        });
      }

      return {
        success: data.success,
        error: data.error,
        outputFile: data.output_file,
      };
    } catch (err) {
      const errMsg = String(err);
      eventLogger.emit('DEVICE_ERROR', { device: 'Shimmer', error: errMsg });
      return { success: false, error: errMsg, outputFile: null };
    }
  }
}

/**
 * Fetch with timeout helper.
 */
async function fetchWithTimeout(
  url: string,
  options: RequestInit,
  timeoutMs: number
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    return response;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Singleton Shimmer GSR controller.
 *
 * ⚠ VALIDATION STATUS: NOT HARDWARE TESTED
 * The HTTP bridge API contract is defined here.
 * Actual Shimmer device round-trip timing has not been measured.
 * Do not report GSR recording as confirmed until the Python bridge
 * returns a success response.
 */
export const shimmerController = new ShimmerController();
