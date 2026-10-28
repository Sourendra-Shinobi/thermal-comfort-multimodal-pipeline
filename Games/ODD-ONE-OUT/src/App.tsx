/**
 * App.tsx — Odd-One-Out Symbol Selection Task
 *
 * Main application router and state manager.
 * Implements the full experimental screen flow:
 *   WELCOME -> SETUP -> READINESS_CHECK -> INSTRUCTIONS -> PRACTICE ->
 *   PRACTICE_COMPLETE -> MAIN_TASK -> COMPLETION -> EXPORT
 *
 * When opened by the experiment controller (URL has ?session=<id>), the
 * session bridge fixes the acquisition mode, prefills setup, streams events,
 * shows the sync flash and delivers the results; see src/integration/.
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import type {
  AppScreen,
  TrialData,
  SessionMetadata,
  SessionExport,
  ExperimentConfig,
  AcquisitionMode,
  TrialDefinition,
  EventType,
} from './types/experiment';
import { DEFAULT_CONFIG } from './experiment/experimentConfig';
import { generateTrialSequence } from './experiment/trialGenerator';
import { initClock, getExperimentStartTimes, perfNow, toWallclock } from './utils/timestamps';
import { eventLogger } from './experiment/eventLogger';
import { computeSummary } from './utils/statistics';
import { acquisitionStatus } from './acquisition/acquisitionStatus';
import { getTrialsCSVString, getEventsCSVString } from './experiment/dataExport';
import { bridge, type SessionContext } from './integration/sessionBridge';
import { SyncFlash, type SyncEventType } from './integration/SyncFlash';
import { OrchestratorBanner, type ResultDelivery } from './integration/OrchestratorBanner';

import { WelcomeScreen } from './components/WelcomeScreen';
import { AcquisitionSetup, type SetupFormValues } from './components/AcquisitionSetup';
import { ReadinessCheck } from './components/ReadinessCheck';
import { Instructions } from './components/Instructions';
import { PracticeScreen } from './components/PracticeScreen';
import { PracticeFeedback } from './components/PracticeFeedback';
import { ExperimentScreen } from './components/ExperimentScreen';
import { CompletionScreen } from './components/CompletionScreen';
import { ExportScreen } from './components/ExportScreen';

export default function App() {
  const [screen, setScreen] = useState<AppScreen>('WELCOME');
  const [acquisitionMode, setAcquisitionMode] = useState<AcquisitionMode>('FULL_MULTIMODAL');
  const [metadata, setMetadata] = useState<SessionMetadata | null>(null);
  const [config] = useState<ExperimentConfig>(DEFAULT_CONFIG);
  const [practiceTrials, setPracticeTrials] = useState<TrialData[]>([]);
  const [mainTrials, setMainTrials] = useState<TrialData[]>([]);
  const [isAborted, setIsAborted] = useState(false);
  const [practiceTrialDefs, setPracticeTrialDefs] = useState<TrialDefinition[]>([]);
  const [mainTrialDefs, setMainTrialDefs] = useState<TrialDefinition[]>([]);

  // ── Experiment-controller integration (inactive when bridge is null) ───────
  const [controller, setController] = useState<SessionContext | null>(null);
  const [controllerError, setControllerError] = useState<string | null>(null);
  const [syncSequence, setSyncSequence] = useState<string | null>(null);
  const [delivery, setDelivery] = useState<ResultDelivery>('pending');
  const screenRef = useRef<AppScreen>(screen);
  screenRef.current = screen;
  const resultSentRef = useRef(false);

  useEffect(() => {
    if (!bridge) return;
    bridge.attach(sink => eventLogger.addSink(sink));
    bridge.startHeartbeat(() => screenRef.current);
    bridge.loadContext()
      .then(ctx => {
        setController(ctx);
        setAcquisitionMode(ctx.mode as AcquisitionMode);
        eventLogger.emit('ORCHESTRATOR_CONNECTED', { session_id: ctx.session_id, mode: ctx.mode, is_mock: ctx.is_mock });
        if (ctx.sync.enabled) setSyncSequence('session_start');
      })
      .catch(err => setControllerError(String(err)));
  }, []);

  const handleSyncEvent = useCallback((type: SyncEventType, detail: Record<string, unknown>) => {
    eventLogger.emit(type as EventType, detail);
  }, []);
  const handleSyncDone = useCallback(() => setSyncSequence(null), []);

  // ── WELCOME -> SETUP ────────────────────────────────────────────────────────
  const handleWelcomeContinue = useCallback((mode: AcquisitionMode) => {
    setAcquisitionMode(mode);
    acquisitionStatus.setMode(mode);
    eventLogger.emit('EXPERIMENT_LOADED', { mode });
    setScreen('SETUP');
  }, []);

  // ── SETUP -> READINESS_CHECK ────────────────────────────────────────────────
  const handleSetupSubmit = useCallback((values: SetupFormValues & { random_seed_number: number }) => {
    initClock();
    const startTimes = getExperimentStartTimes()!;

    const tempVal = values.temperature_celsius.trim() !== ''
      ? parseFloat(values.temperature_celsius)
      : null;

    const sessionMeta: SessionMetadata = {
      participant_id: values.participant_id.trim(),
      session_id: values.session_id.trim(),
      thermal_condition_id: values.thermal_condition_id,
      temperature_celsius: tempVal,
      block_id: values.block_id.trim(),
      notes: values.notes.trim(),
      acquisition_mode: acquisitionMode,
      random_seed: values.random_seed_number,
      experiment_start_wallclock: startTimes.wallclock,
      experiment_start_perf: startTimes.perfTime,
      experiment_end_wallclock: null,
      experiment_end_perf: null,
      app_version: DEFAULT_CONFIG.APP_VERSION,
      experiment_version: DEFAULT_CONFIG.EXPERIMENT_VERSION,
      is_test_session: controller ? controller.is_test_session : acquisitionMode === 'GAME_ONLY_TEST',
    };
    setMetadata(sessionMeta);

    // Generate trial definitions: practice uses seed + 1, main uses seed
    const practiceDefs = generateTrialSequence(config, values.random_seed_number + 1, true);
    const mainDefs = generateTrialSequence(config, values.random_seed_number, false);
    setPracticeTrialDefs(practiceDefs);
    setMainTrialDefs(mainDefs);

    eventLogger.emit('PARTICIPANT_STARTED', {
      participant_id: sessionMeta.participant_id,
      session_id: sessionMeta.session_id,
      acquisition_mode: acquisitionMode,
    });

    setScreen('READINESS_CHECK');
  }, [acquisitionMode, config, controller]);

  // ── READINESS_CHECK -> INSTRUCTIONS or SETUP ────────────────────────────────
  const handleReadinessReady = useCallback(() => {
    eventLogger.emit('EXPERIMENT_ARMED');
    setScreen('INSTRUCTIONS');
  }, []);

  const handleReadinessBack = useCallback(() => {
    setScreen('SETUP');
  }, []);

  // ── INSTRUCTIONS -> PRACTICE ────────────────────────────────────────────────
  const handleInstructionsContinue = useCallback(() => {
    eventLogger.emit('INSTRUCTIONS_STARTED');
    setScreen('PRACTICE');
  }, []);

  // ── PRACTICE -> PRACTICE_COMPLETE ───────────────────────────────────────────
  const handlePracticeComplete = useCallback((trials: TrialData[]) => {
    setPracticeTrials(trials);
    setScreen('PRACTICE_COMPLETE');
  }, []);

  // ── PRACTICE_COMPLETE -> MAIN or REPEAT ────────────────────────────────────
  const handleProceedToMain = useCallback(() => {
    setScreen('MAIN_TASK');
  }, []);

  const handleRepeatPractice = useCallback(() => {
    if (!metadata) return;
    const newSeed = metadata.random_seed + (Date.now() % 10000) + 1;
    const newDefs = generateTrialSequence(config, newSeed, true);
    setPracticeTrialDefs(newDefs);
    setScreen('PRACTICE');
  }, [metadata, config]);

  // ── MAIN_TASK -> COMPLETION ─────────────────────────────────────────────────
  const handleMainComplete = useCallback((trials: TrialData[]) => {
    const endPerf = perfNow();
    const endWallclock = toWallclock(endPerf);
    setMainTrials(trials);
    setIsAborted(false);

    setMetadata(prev => prev ? {
      ...prev,
      experiment_end_perf: endPerf,
      experiment_end_wallclock: endWallclock,
    } : null);

    eventLogger.emit('EXPERIMENT_COMPLETED', { total_trials: trials.length });
    setScreen('COMPLETION');
  }, []);

  const handleMainAbort = useCallback((partialTrials: TrialData[]) => {
    const endPerf = perfNow();
    const endWallclock = toWallclock(endPerf);
    setMainTrials(partialTrials);
    setIsAborted(true);

    setMetadata(prev => prev ? {
      ...prev,
      experiment_end_perf: endPerf,
      experiment_end_wallclock: endWallclock,
    } : null);

    setScreen('COMPLETION');
  }, []);

  // ── COMPLETION -> EXPORT ───────────────────────────────────────────────────
  const handleExport = useCallback(() => {
    setScreen('EXPORT');
  }, []);

  const handleRestart = useCallback(() => {
    setScreen('WELCOME');
    setMetadata(null);
    setPracticeTrials([]);
    setMainTrials([]);
    setIsAborted(false);
  }, []);

  // ── Build Session Export Bundle ────────────────────────────────────────────
  const buildSession = useCallback((): SessionExport => {
    const allTrials = [...practiceTrials, ...mainTrials];
    const acqSummary = acquisitionStatus.getSummary();
    const summary = computeSummary(allTrials, acqSummary);

    return {
      metadata: metadata!,
      configuration: config,
      randomization: {
        seed: metadata!.random_seed,
        algorithm: 'Mulberry32 (PRNG)',
        note: 'Practice block uses seed+1; main experiment uses seed. Sequences are 100% reproducible.',
      },
      acquisition_status: acquisitionStatus.get(),
      events: eventLogger.getEvents(),
      trials: allTrials,
      summary,
    };
  }, [metadata, config, practiceTrials, mainTrials]);

  // ── Deliver results to the controller once the task has ended ─────────────
  useEffect(() => {
    if (!bridge || screen !== 'COMPLETION' || !metadata || resultSentRef.current) return;
    resultSentRef.current = true;
    const session = buildSession();
    setDelivery('sending');
    bridge.submitResult({
      status: isAborted ? 'aborted' : 'completed',
      reason: isAborted ? 'main task aborted (ESC or fullscreen exit)' : undefined,
      trials: session.trials,
      trials_csv: getTrialsCSVString(session.trials),
      events: session.events,
      events_csv: getEventsCSVString(session.events),
      summary: session.summary,
      metadata: session.metadata,
      session_export: session,
    }).then(ok => setDelivery(ok ? 'sent' : 'failed'));
    if (controller?.sync.enabled) setSyncSequence('session_end');
  }, [screen, metadata, isAborted, buildSession, controller]);

  // ── Render Screens ─────────────────────────────────────────────────────────
  return (
    <div className="app" id="app-root">
      {controller && syncSequence && (
        <SyncFlash config={controller.sync} sequence={syncSequence} onEvent={handleSyncEvent} onDone={handleSyncDone} />
      )}
      {bridge && screen !== 'PRACTICE' && screen !== 'MAIN_TASK' && (
        <OrchestratorBanner context={controller} error={controllerError} delivery={delivery} />
      )}

      {screen === 'WELCOME' && (bridge === null || controller) && (
        <WelcomeScreen
          onContinue={handleWelcomeContinue}
          lockedMode={controller ? (controller.mode as AcquisitionMode) : null}
        />
      )}

      {screen === 'SETUP' && (
        <AcquisitionSetup
          acquisitionMode={acquisitionMode}
          preset={controller && {
            participant_id: controller.participant_id,
            session_id: controller.session_id,
            thermal_condition_id: controller.thermal_condition,
            temperature_celsius: controller.environment['air_temperature_c'] != null
              ? String(controller.environment['air_temperature_c'])
              : '',
            block_id: controller.block_id,
            notes: controller.notes,
            is_test_session: controller.is_test_session,
          }}
          onSubmit={handleSetupSubmit}
        />
      )}

      {screen === 'READINESS_CHECK' && (
        <ReadinessCheck
          mode={acquisitionMode}
          controllerBridge={controller ? bridge : null}
          onReady={handleReadinessReady}
          onAbort={handleReadinessBack}
        />
      )}

      {screen === 'INSTRUCTIONS' && metadata && (
        <Instructions
          responseWindowSeconds={config.RESPONSE_WINDOW_MS / 1000}
          onContinue={handleInstructionsContinue}
        />
      )}

      {screen === 'PRACTICE' && metadata && (
        <PracticeScreen
          key={`practice-${practiceTrialDefs.length}-${practiceTrialDefs[0]?.trial_id}`}
          trials={practiceTrialDefs}
          metadata={metadata}
          config={config}
          onComplete={handlePracticeComplete}
        />
      )}

      {screen === 'PRACTICE_COMPLETE' && metadata && (
        <PracticeFeedback
          practiceTrials={practiceTrials}
          onProceed={handleProceedToMain}
          onRepeat={handleRepeatPractice}
        />
      )}

      {screen === 'MAIN_TASK' && metadata && (
        <ExperimentScreen
          key="main-task"
          trials={mainTrialDefs}
          metadata={metadata}
          config={config}
          onComplete={handleMainComplete}
          onAbort={handleMainAbort}
        />
      )}

      {screen === 'COMPLETION' && metadata && (
        <CompletionScreen
          summary={computeSummary([...practiceTrials, ...mainTrials], acquisitionStatus.getSummary())}
          metadata={metadata}
          isAborted={isAborted}
          onExport={handleExport}
        />
      )}

      {screen === 'EXPORT' && metadata && (
        <ExportScreen session={buildSession()} onRestart={handleRestart} />
      )}
    </div>
  );
}
