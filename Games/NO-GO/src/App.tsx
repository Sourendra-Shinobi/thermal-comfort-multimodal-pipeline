/**
 * App.tsx — Main Screen Router
 *
 * Manages the top-level application state:
 *   - Current screen
 *   - Experiment mode (standard | advanced)
 *   - Session metadata (including no_go_colors array)
 *   - Trial data (practice + main)
 *   - Event log
 *
 * When opened by the experiment controller (URL has ?session=<id>), the
 * session bridge prefills setup, streams events, shows the sync flash and
 * delivers the results; see src/integration/sessionBridge.ts.
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import type {
  AppScreen,
  TrialData,
  SessionMetadata,
  StimulusColor,
  SessionExport,
  ExperimentConfig,
  ExperimentMode,
  EventType,
} from './types/experiment';
import { DEFAULT_CONFIG } from './experiment/experimentConfig';
import { generateTrialSequenceWithConfig } from './experiment/trialGenerator';
import { initClock, getExperimentStartTimes } from './utils/timestamps';
import { eventLogger } from './experiment/eventLogger';
import { computeSummary } from './utils/statistics';
import { getCSVString } from './experiment/dataExport';
import { bridge, type SessionContext } from './integration/sessionBridge';
import { SyncFlash, type SyncEventType } from './integration/SyncFlash';
import { OrchestratorBanner, type ResultDelivery } from './integration/OrchestratorBanner';

import { WelcomeScreen }      from './components/WelcomeScreen';
import { ParticipantSetup }   from './components/ParticipantSetup';
import { Instructions }       from './components/Instructions';
import { PracticeScreen }     from './components/PracticeScreen';
import { PracticeFeedback }   from './components/PracticeFeedback';
import { ExperimentScreen }   from './components/ExperimentScreen';
import { CompletionScreen }   from './components/CompletionScreen';
import { ExportScreen }       from './components/ExportScreen';

export default function App() {
  const [screen, setScreen]               = useState<AppScreen>('WELCOME');
  const [experimentMode, setExperimentMode] = useState<ExperimentMode>('standard');
  const [metadata, setMetadata]           = useState<SessionMetadata | null>(null);
  const [config, setConfig]               = useState<ExperimentConfig>(DEFAULT_CONFIG);
  const [practiceTrials, setPracticeTrials] = useState<TrialData[]>([]);
  const [mainTrials, setMainTrials]       = useState<TrialData[]>([]);
  const [isAborted, setIsAborted]         = useState(false);
  const [practiceTrialDefs, setPracticeTrialDefs] = useState<ReturnType<typeof generateTrialSequenceWithConfig>>([]);
  const [mainTrialDefs, setMainTrialDefs] = useState<ReturnType<typeof generateTrialSequenceWithConfig>>([]);

  // ── Experiment-controller integration (inactive when bridge is null) ────────
  const [controller, setController]       = useState<SessionContext | null>(null);
  const [controllerError, setControllerError] = useState<string | null>(null);
  const [syncSequence, setSyncSequence]   = useState<string | null>(null);
  const [delivery, setDelivery]           = useState<ResultDelivery>('pending');
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
        eventLogger.emit('ORCHESTRATOR_CONNECTED', { session_id: ctx.session_id, mode: ctx.mode, is_mock: ctx.is_mock });
        if (ctx.sync.enabled) setSyncSequence('session_start');
      })
      .catch(err => setControllerError(String(err)));
  }, []);

  const handleSyncEvent = useCallback((type: SyncEventType, detail: Record<string, unknown>) => {
    eventLogger.emit(type as EventType, detail);
  }, []);
  const handleSyncDone = useCallback(() => setSyncSequence(null), []);

  // ── WELCOME → SETUP ─────────────────────────────────────────────────────────
  const handleWelcomeContinue = useCallback((mode: ExperimentMode) => {
    setExperimentMode(mode);
    eventLogger.emit('EXPERIMENT_LOADED', { mode });
    setScreen('SETUP');
  }, []);

  // ── SETUP → INSTRUCTIONS ─────────────────────────────────────────────────────
  const handleSetupSubmit = useCallback((values: {
    participant_id:    string;
    session_id:        string;
    thermal_condition: string;
    block_id:          string;
    no_go_colors:      StimulusColor[];
    random_seed:       number;
    notes:             string;
  }) => {
    initClock();
    const startTimes = getExperimentStartTimes()!;

    const runtimeConfig: ExperimentConfig = {
      ...DEFAULT_CONFIG,
      // Keep DEFAULT_NO_GO_COLOR pointing to the first NO-GO color for backward compat
      DEFAULT_NO_GO_COLOR: values.no_go_colors[0],
      EXPERIMENT_MODE: experimentMode,
    };
    setConfig(runtimeConfig);

    const goColors = runtimeConfig.STIMULUS_COLORS.filter(
      c => !values.no_go_colors.includes(c)
    );

    const sessionMeta: SessionMetadata = {
      participant_id:    values.participant_id,
      session_id:        values.session_id,
      thermal_condition: values.thermal_condition,
      block_id:          values.block_id,
      notes:             values.notes,
      experiment_mode:   experimentMode,
      no_go_colors:      values.no_go_colors,
      go_colors:         goColors,
      random_seed:       values.random_seed,
      experiment_start_wallclock: startTimes.wallclock,
      experiment_start_perf:      startTimes.perfTime,
      app_version:       DEFAULT_CONFIG.APP_VERSION,
      experiment_version: DEFAULT_CONFIG.EXPERIMENT_VERSION,
    };
    setMetadata(sessionMeta);

    // Generate sequences — practice seed = seed + 1
    const practiceDefs = generateTrialSequenceWithConfig(
      runtimeConfig, values.random_seed + 1, true, values.no_go_colors
    );
    const mainDefs = generateTrialSequenceWithConfig(
      runtimeConfig, values.random_seed, false, values.no_go_colors
    );
    setPracticeTrialDefs(practiceDefs);
    setMainTrialDefs(mainDefs);

    eventLogger.emit('PARTICIPANT_STARTED', {
      participant_id: values.participant_id,
      session_id:     values.session_id,
      experiment_mode: experimentMode,
    });

    setScreen('INSTRUCTIONS');
  }, [experimentMode]);

  // ── INSTRUCTIONS → PRACTICE ──────────────────────────────────────────────────
  const handleInstructionsContinue = useCallback(() => {
    eventLogger.emit('INSTRUCTIONS_STARTED');
    setScreen('PRACTICE');
  }, []);

  // ── PRACTICE → PRACTICE_COMPLETE ─────────────────────────────────────────────
  const handlePracticeComplete = useCallback((trials: TrialData[]) => {
    setPracticeTrials(trials);
    setScreen('PRACTICE_COMPLETE');
  }, []);

  // ── PRACTICE_COMPLETE → MAIN or REPEAT ──────────────────────────────────────
  const handleProceedToMain = useCallback(() => setScreen('MAIN_TASK'), []);

  const handleRepeatPractice = useCallback(() => {
    if (!metadata) return;
    const newDefs = generateTrialSequenceWithConfig(
      config,
      metadata.random_seed + Date.now() % 10000,
      true,
      metadata.no_go_colors
    );
    setPracticeTrialDefs(newDefs);
    setScreen('PRACTICE');
  }, [metadata, config]);

  // ── MAIN_TASK → COMPLETION ────────────────────────────────────────────────────
  const handleMainComplete = useCallback((trials: TrialData[]) => {
    setMainTrials(trials);
    setIsAborted(false);
    eventLogger.emit('EXPERIMENT_COMPLETED');
    setScreen('COMPLETION');
  }, []);

  const handleMainAbort = useCallback((partialTrials: TrialData[]) => {
    setMainTrials(partialTrials);
    setIsAborted(true);
    setScreen('COMPLETION');
  }, []);

  // ── COMPLETION → EXPORT ───────────────────────────────────────────────────────
  const handleExport = useCallback(() => setScreen('EXPORT'), []);

  // ── Build session export ──────────────────────────────────────────────────────
  const buildSession = useCallback((): SessionExport => {
    const allTrials = [...practiceTrials, ...mainTrials];
    const summary   = computeSummary(allTrials);
    return {
      metadata: metadata!,
      configuration: config,
      randomization: {
        seed: metadata!.random_seed,
        algorithm: 'Mulberry32',
        note: 'Practice uses seed+1; main uses seed. Same seed always reproduces same sequence.',
      },
      events: eventLogger.getEvents(),
      trials: allTrials,
      summary,
    };
  }, [metadata, config, practiceTrials, mainTrials]);

  // ── Deliver results to the controller once the task has ended ──────────────────
  useEffect(() => {
    if (!bridge || screen !== 'COMPLETION' || !metadata || resultSentRef.current) return;
    resultSentRef.current = true;
    const session = buildSession();
    setDelivery('sending');
    bridge.submitResult({
      status: isAborted ? 'aborted' : 'completed',
      reason: isAborted ? 'main task aborted (ESC or fullscreen exit)' : undefined,
      trials: session.trials,
      trials_csv: getCSVString(session.trials),
      events: session.events,
      summary: session.summary,
      metadata: session.metadata,
      session_export: session,
    }).then(ok => setDelivery(ok ? 'sent' : 'failed'));
    if (controller?.sync.enabled) setSyncSequence('session_end');
  }, [screen, metadata, isAborted, buildSession, controller]);

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <div className="app" id="app-root">
      {controller && syncSequence && (
        <SyncFlash config={controller.sync} sequence={syncSequence} onEvent={handleSyncEvent} onDone={handleSyncDone} />
      )}
      {bridge && screen !== 'PRACTICE' && screen !== 'MAIN_TASK' && (
        <OrchestratorBanner context={controller} error={controllerError} delivery={delivery} />
      )}
      {screen === 'WELCOME' && (
        <WelcomeScreen onContinue={handleWelcomeContinue} />
      )}

      {screen === 'SETUP' && (bridge === null || controller) && (
        <ParticipantSetup
          mode={experimentMode}
          preset={controller && {
            participant_id: controller.participant_id,
            session_id: controller.session_id,
            thermal_condition: controller.thermal_condition,
            block_id: controller.block_id,
            notes: controller.notes,
          }}
          onSubmit={handleSetupSubmit}
        />
      )}

      {screen === 'INSTRUCTIONS' && metadata && (
        <Instructions
          mode={metadata.experiment_mode}
          noGoColors={metadata.no_go_colors}
          goColors={metadata.go_colors}
          onContinue={handleInstructionsContinue}
        />
      )}

      {screen === 'PRACTICE' && metadata && (
        <PracticeScreen
          key={`practice-${practiceTrialDefs.length}-${practiceTrialDefs[0]?.trial_number}`}
          trials={practiceTrialDefs}
          metadata={metadata}
          config={config}
          onComplete={handlePracticeComplete}
        />
      )}

      {screen === 'PRACTICE_COMPLETE' && metadata && (
        <PracticeFeedback
          practiceTrials={practiceTrials}
          noGoColors={metadata.no_go_colors}
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
          summary={computeSummary(mainTrials)}
          metadata={metadata}
          isAborted={isAborted}
          onExport={handleExport}
        />
      )}

      {screen === 'EXPORT' && metadata && (
        <ExportScreen session={buildSession()} />
      )}
    </div>
  );
}
