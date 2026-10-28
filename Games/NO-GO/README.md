<div align="center">

```
███╗   ██╗ ██████╗       ██████╗  ██████╗
████╗  ██║██╔═══██╗     ██╔════╝ ██╔═══██╗
██╔██╗ ██║██║   ██║     ██║  ███╗██║   ██║
██║╚██╗██║██║   ██║     ██║   ██║██║   ██║
██║ ╚████║╚██████╔╝     ╚██████╔╝╚██████╔╝
╚═╝  ╚═══╝ ╚═════╝       ╚═════╝  ╚═════╝
```

# NO-GO Color Inhibition Task

**A research-grade, browser-based Go/No-Go response inhibition paradigm**  
*Built for human-subject cognitive research under thermal comfort conditions*

---

[![Version](https://img.shields.io/badge/version-1.0.0-2d3748?style=flat-square)](./package.json)
[![React](https://img.shields.io/badge/React-18.3-61dafb?style=flat-square&logo=react)](https://react.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.5-3178c6?style=flat-square&logo=typescript)](https://typescriptlang.org)
[![Vite](https://img.shields.io/badge/Vite-5.4-646cff?style=flat-square&logo=vite)](https://vitejs.dev)
[![Vitest](https://img.shields.io/badge/Tested-Vitest-6e9f18?style=flat-square)](https://vitest.dev)
[![License](https://img.shields.io/badge/license-Research--Use-orange?style=flat-square)](#)

</div>

---

## Table of Contents

1. [Research Context](#1-research-context)
2. [Paradigm Design](#2-paradigm-design)
3. [Experimental Flow](#3-experimental-flow)
4. [Task Parameters](#4-task-parameters)
5. [Timing Architecture](#5-timing-architecture)
6. [Randomization](#6-randomization)
7. [Experiment Modes](#7-experiment-modes)
8. [Project Structure](#8-project-structure)
9. [Data Schema — CSV](#9-data-schema--csv)
10. [Data Schema — JSON](#10-data-schema--json)
11. [Event Log & Physiological Synchronization](#11-event-log--physiological-synchronization)
12. [Summary Statistics](#12-summary-statistics)
13. [Technology Stack — Rationale](#13-technology-stack--rationale)
14. [Quick Start](#14-quick-start)
15. [Replicating on Another Device](#15-replicating-on-another-device)
16. [Tweakable Parameters](#16-tweakable-parameters)
17. [Reproducibility Guarantee](#17-reproducibility-guarantee)
18. [Known Timing Considerations](#18-known-timing-considerations)
19. [Future Extensions](#19-future-extensions)

---

## 1. Research Context

This application is **one of three standardized cognitive tasks** in a human-subject experimental battery studying the effect of **thermal comfort** on physiological and cognitive responses. The broader study uses:

- Physiological sensors (GSR/EDA, PPG, skin temperature, IMU)
- Thermal and RGB cameras
- Standardized indoor thermal conditions

The cognitive battery assesses mental load and inhibitory control as mediators between thermal environment and autonomic response. This specific task — the **Go/No-Go paradigm** — measures **response inhibition**: the participant's ability to suppress a prepotent motor response when faced with an inhibitory stimulus.

> **Why response inhibition?** The executive function network (prefrontal cortex, anterior cingulate) is metabolically demanding and thermally sensitive. Commission error rates and RT variance are expected to degrade under thermal stress, providing a sensitive behavioral index of cognitive impairment.

---

## 2. Paradigm Design

### 2.1 Classic Go/No-Go

The Go/No-Go paradigm is one of the most well-validated inhibitory control measures in cognitive neuroscience (Donders, 1868; Kok, 1999; Simmonds et al., 2008). Participants develop a prepotent response tendency to a frequent stimulus (GO), then must suppress that response for an infrequent signal (NO-GO).

```
┌─────────────────────────────────────────────────────────────┐
│                   TRIAL SEQUENCE (one trial)                │
│                                                             │
│  ┌──────────┐   ┌────────────────┐   ┌──────────────────┐  │
│  │    +     │   │   ●  (color)   │   │   (blank ITI)    │  │
│  │ fixation │──▶│  stimulus      │──▶│  inter-trial     │  │
│  │  400 ms  │   │  1000 ms       │   │  interval 400 ms │  │
│  └──────────┘   └────────────────┘   └──────────────────┘  │
│                        ▲                                    │
│               Participant presses SPACE                     │
│               if circle is a GO color                       │
│               (RT measured from onset)                      │
└─────────────────────────────────────────────────────────────┘
```

### 2.2 Color as Stimulus Dimension

Color was chosen as the discriminating dimension because:

- **Low perceptual demand** — color is processed pre-attentively (Treisman, 1982), ensuring the task isolates inhibitory control rather than perceptual processing
- **No literacy requirement** — valid cross-culturally
- **No hand-dominance confound** — single-key response (SPACEBAR) with either hand
- **Controllable** — all four colors (Red, Blue, Green, Yellow) are perceptually discriminable at the chosen luminance levels

### 2.3 GO:NO-GO Ratio (75:25)

A **75% GO / 25% NO-GO** ratio is used, matching the most common convention in the literature (Simmonds et al., 2008; Verbruggen & Logan, 2008). This ratio:

- Builds a strong prepotent response tendency to GO stimuli
- Makes NO-GO trials genuinely demanding (not trivially easy)
- Produces approximately 37–38 NO-GO trials per session — sufficient for reliable inhibition metrics
- Keeps total session duration under 5 minutes

An alternative 50:50 ratio would reduce response prepotency, making the task a simpler discrimination rather than true inhibition. Ratios above 80% GO reduce statistical power for NO-GO metrics.

---

## 3. Experimental Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                    SCREEN FLOW                                  │
│                                                                 │
│  ┌──────────┐    ┌──────────┐    ┌──────────────┐              │
│  │ WELCOME  │───▶│  SETUP   │───▶│ INSTRUCTIONS │              │
│  │  + mode  │    │ (experi- │    │  (to parti-  │              │
│  │ selection│    │  menter) │    │   cipant)    │              │
│  └──────────┘    └──────────┘    └──────┬───────┘              │
│                                         │                       │
│                                         ▼                       │
│  ┌──────────────┐    ┌──────────────────────┐                   │
│  │  PRACTICE    │◀───│  PRACTICE FEEDBACK   │                   │
│  │ (10 trials   │───▶│  (accuracy summary + │                   │
│  │  with        │    │   repeat/proceed)    │                   │
│  │  feedback)   │    └──────────────────────┘                   │
│  └──────┬───────┘                                               │
│         │                                                       │
│         ▼                                                       │
│  ┌─────────────┐    ┌────────────┐    ┌────────────┐           │
│  │  MAIN TASK  │───▶│ COMPLETION │───▶│   EXPORT   │           │
│  │ (150 trials │    │ (summary + │    │ CSV + JSON  │           │
│  │  no fdbk)   │    │  metadata) │    │  download) │           │
│  └─────────────┘    └────────────┘    └────────────┘           │
└─────────────────────────────────────────────────────────────────┘
```

**Screen-by-screen breakdown:**

| Screen | Who interacts | Purpose |
|--------|---------------|---------|
| Welcome | Experimenter | Mode selection (Standard / Advanced) |
| Setup | Experimenter | Participant ID, session ID, thermal condition, NO-GO color(s), seed |
| Instructions | Participant | Task explanation — color rules, response key |
| Practice | Participant | 10 trials with immediate feedback; can repeat |
| Practice Review | Both | GO/NO-GO accuracy summary; proceed or retry |
| Main Task | Participant | 150 trials, no feedback, full recording |
| Completion | Experimenter | Live summary statistics, session context |
| Export | Experimenter | Download CSV and JSON |

---

## 4. Task Parameters

All parameters live in a **single source of truth**: [`src/experiment/experimentConfig.ts`](./src/experiment/experimentConfig.ts)

| Parameter | Default Value | Rationale |
|-----------|---------------|-----------|
| `NUMBER_OF_TRIALS` | 150 | Sufficient for RT statistics (≥30 valid GO trials needed) |
| `GO_PROPORTION` | 0.75 | Standard inhibition ratio in the literature |
| `FIXATION_DURATION_MS` | 400 ms | Allows attention re-orienting; too short increases RT, too long allows prediction |
| `STIMULUS_DURATION_MS` | 1000 ms | Response window; chosen to include slow-RT participants while excluding guessing |
| `ITI_DURATION_MS` | 400 ms | Prevents RT contamination from previous trial; 400ms is below temporal integration window |
| `PRACTICE_TRIALS` | 10 | Enough to learn rule; minimizes practice-effect contamination of main data |
| `MAX_CONSECUTIVE_NOGO` | 2 | Prevents attentional tunneling; based on Nuechterlein et al. sequencing guidelines |
| `RT_MIN_VALID_MS` | 150 ms | Below this = anticipatory (sub-perceptual); raw RT preserved |
| `RT_MAX_VALID_MS` | 950 ms | Near window boundary — ambiguous whether intentional; raw RT preserved |
| `STIMULUS_SIZE_PX` | 160 px | Subtends ~5–8° visual angle at typical viewing distance; enough for reliable color perception |
| `RESPONSE_KEY` | `Space` | `KeyboardEvent.code` — layout-independent (works on all keyboard types) |
| `PRE_TASK_DELAY_MS` | 2000 ms | Buffer for physiological signal stabilization after START press |

> **Important:** Raw RT is **always preserved** regardless of validity flags. The `rt_valid` and `rt_exclusion_reason` columns are analytical hints, not deletions.

---

## 5. Timing Architecture

This is the most critical design decision in the entire application. Browser-based timing has several failure modes that are explicitly addressed.

### 5.1 Why `performance.now()` and Not `Date.now()`

```
┌─────────────────────────────────────────────────────────────────┐
│ Date.now()                                                      │
│   ● Resolution: ~1 ms (operating system clock tick)            │
│   ● Risk: subject to NTP corrections, clock skew               │
│   ● Risk: not monotonic (can go backwards)                      │
│                                                                 │
│ performance.now()                ← USED IN THIS APPLICATION     │
│   ● Resolution: ~100 µs (Chromium) after Spectre mitigations   │
│   ● Monotonic: never goes backwards                             │
│   ● Origin: page load time (stable reference)                   │
│   ● Sub-millisecond differences are meaningful                  │
└─────────────────────────────────────────────────────────────────┘
```

### 5.2 Why `requestAnimationFrame` and Not `setTimeout`

```
The problem with setTimeout:

  setTimeout(() => showStimulus(), 400);
  // ↑ Schedules callback AFTER 400ms but...
  //   actual execution may be delayed by event loop congestion
  //   AND the timestamp captured inside is AFTER the call
  //   AND the visual update happens on the NEXT paint frame anyway

The solution — rAF gating:

  const waitForStimulus = () => {
    if (performance.now() < fixationEnd) {
      requestAnimationFrame(waitForStimulus);  // check again next frame
      return;
    }
    requestAnimationFrame(() => {
      ts.stimulusOnsetPerf = performance.now();  // ← actual onset frame
      setState(... STIMULUS ...);               // ← triggers paint this frame
    });
  };
```

By using rAF for phase transitions, the **recorded timestamp is the actual animation frame when the stimulus first appeared on screen** — not an estimated future time. This is the industry standard approach for web-based psychophysics (de Leeuw, 2015 — jsPsych).

### 5.3 Wall-Clock Bridge

`performance.now()` values cannot directly be read as human-readable datetimes. The bridge:

```
At experiment start:
  wallclock_epoch  = Date.now()              [ms since Unix epoch]
  perf_epoch       = performance.now()       [ms since page load]

At any later event:
  event_wallclock  = wallclock_epoch + (event_perf - perf_epoch)
```

This ensures all timestamps are mappable to wall-clock time **without** using the imprecise `Date.now()` for RT measurement.

### 5.4 RT Calculation

```
RT = response_timestamp_perf − stimulus_onset_perf

Where:
  stimulus_onset_perf   = performance.now() captured inside the rAF callback
                          that rendered the stimulus frame
  response_timestamp_perf = performance.now() captured inside the keydown
                            event handler on first Space keypress
```

This gives the true perceptual-to-motor RT. No interpolation, no estimated offsets.

---

## 6. Randomization

### 6.1 Why a Custom PRNG?

JavaScript's built-in `Math.random()` cannot be seeded. This means:
- Every session produces a different, unrecoverable sequence
- Cross-browser behavior is implementation-defined (V8 ≠ SpiderMonkey)
- Reproducibility is impossible

A **custom seeded PRNG** solves all of this.

### 6.2 Mulberry32 — Algorithm Choice

**Mulberry32** (Tommy Ettinger, 2017) was selected from several candidates:

| Algorithm | State | Period | BigCrush | Speed | Seedable | Implementation |
|-----------|-------|--------|----------|-------|----------|----------------|
| **Mulberry32** ✓ | 32-bit | 2³² | Passes | ★★★★★ | ✅ | 4 lines |
| xoshiro128++ | 128-bit | 2¹²⁸−1 | Passes | ★★★★★ | ✅ | 10 lines |
| PCG32 | 64-bit | 2⁶⁴ | Passes | ★★★★★ | ✅ | 8 lines |
| Mersenne Twister | 19937-bit | 2¹⁹⁹³⁷−1 | Passes | ★★★☆☆ | ✅ | 100+ lines |
| `Math.random()` | — | — | — | ★★★★★ | ❌ | built-in |

Mulberry32 was chosen because:
- **Period 2³²** = ~4.3 billion values — orders of magnitude more than needed for 150 trials
- **Passes BigCrush** statistical battery (empirically verified by Ettinger)
- **4-line implementation** — minimal surface area for bugs
- **No external dependency**
- **32-bit output** maps cleanly to JavaScript's number type

Upgrading to xoshiro128++ would provide a longer period and marginally better spectral properties, but is completely unnecessary at this scale. Any reviewer concerns can be addressed by noting the BigCrush pass.

### 6.3 Sequence Constraints

The raw shuffled sequence is post-processed to enforce:

```
Constraint 1: Maximum 2 consecutive NO-GO trials
  → Implemented via a repair algorithm that swaps excess
    NO-GO positions with downstream GO positions

Constraint 2: Uniform color distribution
  → Built by cycling through all GO colors in batches,
    each batch shuffled with the same PRNG
  → Same for NO-GO colors in Advanced mode

Constraint 3: Determinism
  → Same seed → same sequence, always, on any browser
```

### 6.4 Seed Strategy

```
Main task seed:     S        (entered by experimenter)
Practice seed:      S + 1    (independent sequence)

Both stored in exported JSON for complete reproducibility.
```

---

## 7. Experiment Modes

### Standard Mode (Default)

```
Colors: RED ●  BLUE ●  GREEN ●  YELLOW ●
         ╰──╯    ╰────────────────────╯
        NO-GO           GO
     (1 color)       (3 colors)

→ 75% GO trials distributed across 3 GO colors
→ 25% NO-GO trials = RED (configurable)
```

### Advanced Mode

```
Colors: RED ●  BLUE ●  GREEN ●  YELLOW ●
         ╰─────────╯    ╰────────────────╯
            NO-GO              GO
          (2 colors)        (2 colors)

→ 75% GO trials distributed equally across 2 GO colors
→ 25% NO-GO trials distributed equally across 2 NO-GO colors
→ Higher inhibitory demand (participant must track 2 stop signals)
```

The mode selection affects:
1. The number of NO-GO color selectors shown in Setup
2. The `no_go_colors[]` array written to both CSV and JSON
3. The `experiment_mode` column in every trial row

Both modes export **identically structured data** — the schema does not change between modes.

---

## 8. Project Structure

```
NO-GO/
│
├── src/
│   │
│   ├── components/                     ← UI layer (React)
│   │   ├── WelcomeScreen.tsx           Screen 1: intro + mode selection
│   │   ├── ParticipantSetup.tsx        Screen 2: session parameters
│   │   ├── Instructions.tsx            Screen 3: task rules (adapts to mode)
│   │   ├── PracticeScreen.tsx          Screen 4: trials + live feedback
│   │   ├── PracticeFeedback.tsx        Screen 5: accuracy review
│   │   ├── ExperimentScreen.tsx        Screen 6: main 150 trials
│   │   ├── CompletionScreen.tsx        Screen 7: stats + session context
│   │   └── ExportScreen.tsx            Screen 8: CSV/JSON download
│   │
│   ├── experiment/                     ← Core experimental logic
│   │   ├── experimentConfig.ts         ★ ALL parameters (single source of truth)
│   │   ├── trialGenerator.ts           Constrained pseudorandom sequence builder
│   │   ├── trialEngine.ts              rAF-driven fixation/stimulus/ITI loop
│   │   ├── eventLogger.ts              Typed event emission with pluggable sinks
│   │   ├── randomization.ts            Mulberry32 seeded PRNG + Fisher-Yates shuffle
│   │   └── dataExport.ts               CSV + JSON download triggers
│   │
│   ├── types/
│   │   └── experiment.ts               All shared TypeScript interfaces
│   │
│   ├── utils/
│   │   ├── timestamps.ts               performance.now() + wall-clock bridge
│   │   ├── statistics.ts               15 descriptive summary statistics
│   │   └── csv.ts                      CSV serializer (RFC 4180 compliant)
│   │
│   ├── test/
│   │   ├── dataExport.test.ts          CSV/JSON export correctness
│   │   ├── statistics.test.ts          All 15 statistics
│   │   └── trialGenerator.test.ts      Sequence constraints
│   │
│   ├── App.tsx                         Top-level screen router + state
│   ├── App.css                         All styles
│   └── main.tsx                        React entry point
│
├── index.html
├── vite.config.ts
├── tsconfig.json
└── package.json
```

---

## 9. Data Schema — CSV

Every trial (practice + main) is one row. **30 columns, fixed order.** Column order must not be changed — downstream analysis scripts may rely on positional parsing.

| # | Column | Type | Description |
|---|--------|------|-------------|
| 1 | `participant_id` | string | Experimenter-assigned participant identifier |
| 2 | `session_id` | string | Session identifier (e.g. S01, S02) |
| 3 | `thermal_condition` | string | Thermal condition label (metadata only — does not affect task) |
| 4 | `block_id` | string | Block number within session |
| 5 | `is_practice` | boolean | `true` for practice trials — always filter these for analysis |
| 6 | `random_seed` | integer | PRNG seed used for this session |
| 7 | `experiment_mode` | string | `standard` or `advanced` |
| 8 | `no_go_color_1` | string | Primary NO-GO color (always populated) |
| 9 | `no_go_color_2` | string\|null | Second NO-GO color — `null` in Standard mode |
| 10 | `trial_number` | integer | 1-indexed trial number within block |
| 11 | `stimulus_color` | string | `RED` / `BLUE` / `GREEN` / `YELLOW` |
| 12 | `trial_type` | string | `GO` or `NO_GO` |
| 13 | `fixation_onset_perf` | float | `performance.now()` at fixation cross onset (ms) |
| 14 | `fixation_onset_wallclock` | ISO 8601 | Wall-clock equivalent |
| 15 | `stimulus_onset_perf` | float | `performance.now()` at stimulus circle onset ← **use for RT verification** |
| 16 | `stimulus_onset_wallclock` | ISO 8601 | Wall-clock equivalent |
| 17 | `stimulus_offset_perf` | float | `performance.now()` at stimulus disappearance |
| 18 | `stimulus_offset_wallclock` | ISO 8601 | Wall-clock equivalent |
| 19 | `response_timestamp_perf` | float\|null | `performance.now()` at keypress (`null` if no response) |
| 20 | `response_timestamp_wallclock` | ISO 8601\|null | Wall-clock equivalent |
| 21 | `early_response_timestamp_perf` | float\|null | `performance.now()` of premature keypress during fixation |
| 22 | `responded` | boolean | Whether participant pressed SPACE during stimulus window |
| 23 | `reaction_time_ms` | float\|null | RT in ms (`response_timestamp_perf − stimulus_onset_perf`) |
| 24 | `correct` | boolean | GO→responded, NO_GO→not responded |
| 25 | `error_type` | string\|null | `omission` (GO, no response) / `commission` (NO-GO, responded) / `null` |
| 26 | `early_response` | boolean | Whether premature keypress occurred during fixation |
| 27 | `rt_valid` | boolean\|null | `false` if RT < 150ms or RT > 950ms; `null` for NO-GO trials |
| 28 | `rt_exclusion_reason` | string\|null | Human-readable reason if `rt_valid = false` |
| 29 | `trial_start_timestamp_perf` | float | `performance.now()` at trial start (before fixation) |
| 30 | `trial_end_timestamp_perf` | float | Theoretical trial end (`stimulus_offset_perf + ITI_DURATION_MS`) |

### Analysis Tips

```python
import pandas as pd

df = pd.read_csv('NOGO_P001_S01_2026-09-04.csv')

# Always filter practice trials first
df_main = df[df['is_practice'] == False]

# Valid GO RTs only
go_rts = df_main[
    (df_main['trial_type'] == 'GO') &
    (df_main['rt_valid'] == True)
]['reaction_time_ms']

mean_rt      = go_rts.mean()
commission_rate = df_main[df_main['trial_type'] == 'NO_GO']['responded'].mean()
```

---

## 10. Data Schema — JSON

The JSON file contains the **complete session** in a single structured object:

```json
{
  "metadata": {
    "participant_id": "P001",
    "session_id": "S01",
    "thermal_condition": "Neutral",
    "block_id": "1",
    "notes": "",
    "experiment_mode": "standard",
    "no_go_colors": ["RED"],
    "go_colors": ["BLUE", "GREEN", "YELLOW"],
    "random_seed": 3141592653,
    "experiment_start_wallclock": "2026-09-04T12:30:15.123Z",
    "experiment_start_perf": 1234.567,
    "app_version": "1.0.0",
    "experiment_version": "1.0.0"
  },

  "configuration": {
    "NUMBER_OF_TRIALS": 150,
    "GO_PROPORTION": 0.75,
    "FIXATION_DURATION_MS": 400,
    "STIMULUS_DURATION_MS": 1000,
    "ITI_DURATION_MS": 400,
    "RT_MIN_VALID_MS": 150,
    "RT_MAX_VALID_MS": 950
    // ... all parameters from experimentConfig.ts
  },

  "randomization": {
    "seed": 3141592653,
    "algorithm": "Mulberry32",
    "note": "Practice uses seed+1; main uses seed. Same seed always reproduces same sequence."
  },

  "events": [
    {
      "event_type": "STIMULUS_ONSET",
      "timestamp_perf": 12847.23,
      "timestamp_wallclock": "2026-09-04T12:30:27.490Z",
      "trial_number": 5,
      "detail": { "color": "BLUE" }
    }
    // ... all logged events
  ],

  "trials": [
    // ... same fields as CSV, one object per trial
  ],

  "summary": {
    "total_trials": 150,
    "go_accuracy": 0.9735,
    "no_go_accuracy": 0.8649,
    "mean_go_rt_ms": 342.17,
    "median_go_rt_ms": 327.50,
    "std_go_rt_ms": 68.43,
    "rt_coefficient_of_variation": 0.1999,
    // ... 15 statistics total
  }
}
```

> **Why JSON in addition to CSV?**  
> CSV is optimized for per-trial analysis (R, Python, MATLAB). JSON preserves the complete experimental session as a self-contained audit trail — including the configuration snapshot and event log — which cannot be represented in flat CSV without redundancy. Both files are downloaded simultaneously.

---

## 11. Event Log & Physiological Synchronization

### 11.1 Event Types

Every meaningful experimental moment is logged as a typed event:

| Event | When | Notes |
|-------|------|-------|
| `EXPERIMENT_LOADED` | App startup | |
| `PARTICIPANT_STARTED` | Setup submitted | |
| `INSTRUCTIONS_STARTED` | Instructions shown | |
| `PRACTICE_STARTED` | Practice begins | |
| `PRACTICE_COMPLETED` | All practice trials done | |
| `MAIN_TASK_START` | START button pressed | **Use as physiological epoch marker** |
| `TRIAL_START` | Each trial begins | |
| `FIXATION_START` | Fixation cross appears | |
| `STIMULUS_ONSET` | ★ Color circle appears | **Primary alignment event** |
| `EARLY_RESPONSE` | Keypress during fixation | |
| `RESPONSE_RECEIVED` | Keypress during stimulus | |
| `STIMULUS_OFFSET` | Stimulus disappears | |
| `TRIAL_END` | Trial complete | |
| `MAIN_TASK_END` | All trials done | |
| `EXPERIMENT_COMPLETED` | Session finalized | |
| `EXPERIMENT_ABORTED` | ESC pressed | |
| `FULLSCREEN_ENTERED` / `FULLSCREEN_EXITED` | Fullscreen state change | |
| `VISIBILITY_CHANGE` | Tab hidden/shown | **Critical — tag contaminated trials** |

### 11.2 Future Hardware Synchronization Architecture

The event logger uses a **pluggable sink pattern** — external sync systems (LSL, Shimmer, WebSocket) can be added without modifying any existing code:

```typescript
import { eventLogger } from './src/experiment/eventLogger';

// Example: Lab Streaming Layer (LSL) integration
eventLogger.addSink((event) => {
  lslOutlet.pushSample([
    event.event_type,
    event.timestamp_perf,
    event.trial_number ?? -1,
  ]);
});

// Example: Shimmer/Consensys WebSocket sync
eventLogger.addSink(async (event) => {
  ws.send(JSON.stringify({
    marker: event.event_type,
    t_perf: event.timestamp_perf,
    t_wall: event.timestamp_wallclock,
    trial: event.trial_number,
  }));
});
```

Multiple sinks can coexist. Sink errors are caught and logged but do not interrupt the trial.

---

## 12. Summary Statistics

Computed at session end from **main trials only** (practice excluded):

| Statistic | Formula | Purpose |
|-----------|---------|---------|
| `total_trials` | count of main trials | Data completeness check |
| `total_go_trials` | count of GO trials | Balance verification |
| `total_no_go_trials` | count of NO-GO trials | Balance verification |
| `go_accuracy` | correct GO / total GO | Primary GO performance |
| `no_go_accuracy` | correct rejections / total NO-GO | Primary inhibition measure |
| `overall_accuracy` | total correct / total trials | Overall performance |
| `go_omission_rate` | omissions / total GO | Attention/motivation index |
| `no_go_commission_rate` | commissions / total NO-GO | **Core inhibition failure rate** |
| `mean_go_rt_ms` | mean of valid GO RTs | Central tendency of RT |
| `median_go_rt_ms` | median of valid GO RTs | Robust RT measure (skew-insensitive) |
| `std_go_rt_ms` | sample SD of valid GO RTs | RT variability |
| `rt_coefficient_of_variation` | SD / mean | Normalized variability (compare across conditions) |
| `fastest_go_rt_ms` | min valid GO RT | Lower bound / floor detection |
| `slowest_go_rt_ms` | max valid GO RT | Upper bound / fatigue detection |
| `valid_go_rt_count` | count of RTs where `rt_valid = true` | Effective sample size for RT stats |

> All statistics are computed only from `rt_valid = true` trials. Raw RT data is always preserved in the CSV for secondary analysis with different exclusion criteria.

---

## 13. Technology Stack — Rationale

### 13.1 Why Browser-Based (Not E-Prime / PsychoPy)?

| Criterion | E-Prime | PsychoPy | This App |
|-----------|---------|----------|----------|
| OS dependency | Windows only | Any | Any |
| Installation | Required | Required | None (open URL) |
| Deployment | Per-machine | Per-machine | URL link |
| Timing precision | ★★★★★ | ★★★★★ | ★★★★☆ |
| Stimulus control | ★★★★★ | ★★★★★ | ★★★☆☆ |
| Data export | Proprietary | CSV | CSV + JSON |
| Free | No ($$$) | Yes | Yes |
| Modifiable | Proprietary | Yes | Yes |

Browser-based was chosen for **deployment flexibility** — participants can be tested on any machine without installation, and the app can be hosted on a lab server for multi-room studies. Timing precision is sufficient for RT tasks (not sub-ms EEG synchronization).

### 13.2 React 18 + TypeScript

**React** was chosen over vanilla JS for component isolation (each screen is a self-contained unit) and state management (trial data flows predictably through the component tree).

**TypeScript** is non-negotiable for research software:
- Every data field has an explicit type — prevents silent `null`/`undefined` bugs in exported data
- The `TrialData` interface serves as machine-readable documentation of the data schema
- Type errors at compile time, not runtime — no corrupted data files

**Why not Next.js / a larger framework?** This is a single-page task with deterministic navigation flow, no server, no routing, no API calls. React + Vite is the minimum viable complexity.

### 13.3 Vite

Chosen over Create React App (deprecated) and Webpack for:
- Sub-second hot module replacement during development
- Native ES module support
- TypeScript compilation via esbuild (fast)
- No configuration required

### 13.4 Vitest

Unit tests run against the core logic modules (`statistics.ts`, `csv.ts`, `trialGenerator.ts`, `dataExport.ts`). Tests verify:
- All 15 statistics compute correctly
- CSV column order matches schema
- `null` values serialize as empty strings
- CSV values with commas are quoted per RFC 4180
- Trial generator produces correct GO/NO-GO ratios

---

## 14. Quick Start

### Requirements

- Node.js ≥ 18
- A modern browser (Chrome 90+, Firefox 90+, Edge 90+)

```bash
# 1. Clone the repository
git clone https://github.com/Sourendra-Shinobi/NO-GO-color-inhibition-task.git
cd NO-GO-color-inhibition-task

# 2. Install dependencies (~30 seconds)
npm install

# 3. Start development server
npm run dev
# → Open http://localhost:5173

# 4. Run unit tests
npm test

# 5. Build for production
npm run build
# → Output in dist/
```

### Deploying for a Study

The `dist/` folder is a static site — copy it to any web server:

```bash
npm run build
# Copy dist/ to your server, e.g.:
# scp -r dist/ user@labserver:/var/www/nogo/
# → Accessible at http://labserver/nogo/
```

No backend required. All data is local to the participant's browser.

---

## 15. Replicating on Another Device

To run an identical copy of the task on another computer, install **Node.js ≥ 18** on that computer, then obtain the same source version and install its dependencies.

```bash
# Option A — clone the repository (recommended)
git clone https://github.com/Sourendra-Shinobi/NO-GO-color-inhibition-task.git
cd NO-GO-color-inhibition-task
npm install
npm run dev
# → Open the local URL shown in the terminal (usually http://localhost:5173)
```

If Git is not available, download the repository ZIP from `https://github.com/Sourendra-Shinobi/NO-GO-color-inhibition-task`, extract it on the new device, then run:

```bash
cd NO-GO-color-inhibition-task
npm install
npm run dev
```

For a fixed study deployment, run `npm run build` on the source device and copy the resulting `dist/` folder to a web server or the target device's static web server. Use the same source commit and do not change [`src/experiment/experimentConfig.ts`](./src/experiment/experimentConfig.ts) mid-study; this preserves identical task behaviour and parameters across devices.

---

## 16. Tweakable Parameters

All in [`src/experiment/experimentConfig.ts`](./src/experiment/experimentConfig.ts):

```typescript
export const DEFAULT_CONFIG: ExperimentConfig = {
  // ─── Number of trials ─────────────────────────────────────────
  NUMBER_OF_TRIALS: 150,        // Change for longer/shorter sessions
  GO_PROPORTION: 0.75,          // 0.6–0.85 is the empirical range

  // ─── Timing ───────────────────────────────────────────────────
  FIXATION_DURATION_MS: 400,    // 200–800ms is reasonable
  STIMULUS_DURATION_MS: 1000,   // Shorten for harder task; lengthen for slower populations
  ITI_DURATION_MS: 400,         // 200–600ms typical

  // ─── RT quality thresholds ────────────────────────────────────
  RT_MIN_VALID_MS: 150,         // Lower for expert populations
  RT_MAX_VALID_MS: 950,         // Must be < STIMULUS_DURATION_MS

  // ─── Practice ─────────────────────────────────────────────────
  PRACTICE_TRIALS: 10,          // 10–20 typical

  // ─── Stimulus ─────────────────────────────────────────────────
  STIMULUS_SIZE_PX: 160,        // Scale with monitor size; aim for 5–8° visual angle
  DEFAULT_NO_GO_COLOR: 'RED',   // Overridden by experimenter at setup
};
```

> **Never change parameters mid-study.** The `experiment_version` field should be incremented whenever any parameter changes, to maintain data integrity across cohorts.

---

## 17. Reproducibility Guarantee

Every exported session contains enough information to **perfectly reproduce the trial sequence**:

```typescript
import { createPRNG } from './src/experiment/randomization';
import { generateTrialSequenceWithConfig } from './src/experiment/trialGenerator';
import sessionData from './NOGO_P001_S01_2026-09-04.json';

// Reconstruct the exact main trial sequence
const mainTrials = generateTrialSequenceWithConfig(
  sessionData.configuration,
  sessionData.randomization.seed,   // stored seed
  false,                             // isPractice = false
  sessionData.metadata.no_go_colors  // stored NO-GO colors
);

// mainTrials[i].stimulus_color === sessionData.trials[i+10].stimulus_color
// (offset by 10 practice trials)
```

**Reproducibility checklist stored in JSON:**
- `metadata.random_seed` — exact seed
- `metadata.experiment_mode` — Standard or Advanced
- `metadata.no_go_colors` — exact color assignment
- `configuration.*` — all 16 parameters at time of experiment
- `randomization.algorithm` — `"Mulberry32"`
- `metadata.app_version` + `metadata.experiment_version`

---

## 18. Known Timing Considerations

### 18.1 Browser `performance.now()` Precision

Post-Spectre (2018), browsers reduced timer precision:
- **Chromium (Chrome, Edge):** ~100 µs when cross-origin isolated; otherwise ~1ms
- **Firefox:** ~1ms by default; ~100µs with `privacy.reduceTimerPrecision` disabled
- **Safari:** ~1ms

For this task, 1ms precision is **sufficient**. RT values are reported to 3 decimal places but the meaningful precision is ~1ms on standard setups.

### 18.2 Frame Rate Dependency

Phase transitions are synchronized to display frames (requestAnimationFrame). Stimulus onset jitter relative to the scheduled time is at most one frame:

| Display | Frame duration | Max onset jitter |
|---------|---------------|-----------------|
| 60 Hz | 16.67 ms | ~16.67 ms |
| 120 Hz | 8.33 ms | ~8.33 ms |
| 144 Hz | 6.94 ms | ~6.94 ms |

The recorded `stimulus_onset_perf` is the **actual frame time** — not the scheduled time — so this jitter does not corrupt RT measurements. It only means the nominal 400ms fixation might be 407ms or 416ms. To verify, compute `stimulus_onset_perf − fixation_onset_perf` per trial.

### 18.3 Tab Visibility

If the participant switches tabs or the browser window loses focus:
- `requestAnimationFrame` pauses immediately
- A `VISIBILITY_CHANGE` event is logged with the timestamp
- The trial sequence resumes when focus returns — but the current trial's timing is corrupted

**Recommendation:** Flag any trial that overlaps a `VISIBILITY_CHANGE` event in post-processing.

### 18.4 Keyboard Auto-Repeat

Holding SPACEBAR triggers repeated `keydown` events. Only the **first** `keydown` per trial is accepted (tracked via `keyProcessed` flag in the trial state). Auto-repeat presses are silently ignored.

---

## 19. Future Extensions

### Hardware Synchronization

The event logger sink system (see §11.2) is designed for:

```
Shimmer GSR/PPG  ──▶ Consensys API ──▶ WebSocket ──▶ eventLogger.addSink()
LSL outlet       ──────────────────────────────────▶ eventLogger.addSink()
EEG trigger box  ──▶ Serial/HID API ───────────────▶ eventLogger.addSink()
```

No modifications to trial logic or data structures are needed.

### Eye Tracking

Fixation quality during the fixation cross could be validated via WebGazer.js or Tobii IS4 Web API. A fixation quality column (`fixation_valid: boolean`) can be added to `TrialData` without breaking existing exports.

### Multi-Session Longitudinal Design

Current design supports single-block sessions. For repeated-measures designs:
- `block_id` field already captures block identity
- `session_id` differentiates within-participant sessions
- The PRNG seed strategy ensures independent sequences per block without manual seed management

### Adaptive Timing

`STIMULUS_DURATION_MS` could be dynamically adjusted based on rolling RT mean to maintain a target difficulty. This would require flagging `is_adaptive: true` in the configuration export.

---

<div align="center">

---

*Developed at IIT Kharagpur · BTP 2026*  
*Research application — not for clinical use*

</div>
