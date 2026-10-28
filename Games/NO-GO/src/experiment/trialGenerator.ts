/**
 * Trial Generator
 *
 * Produces the constrained pseudorandom GO/NO-GO trial sequence for both
 * the practice block and the main experiment.
 *
 * Supports both Standard mode (1 NO-GO color) and Advanced mode (2 NO-GO colors).
 *
 * Constraints enforced:
 *   1. Correct GO/NO-GO ratio (within ±1 trial of target).
 *   2. Maximum MAX_CONSECUTIVE_NOGO NO-GO trials in a row.
 *   3. GO colors are distributed uniformly among all non-NO-GO colors.
 *   4. In advanced mode, NO-GO colors are also distributed uniformly between the two.
 *   5. Sequence is deterministic given the seed.
 */

import type { StimulusColor, TrialDefinition, TrialType, ExperimentConfig } from '../types/experiment';
import { createPRNG, shuffle, type PRNG } from './randomization';

/**
 * Build a constrained GO/NO-GO sequence.
 *
 * @param config       Experiment configuration (uses DEFAULT_NO_GO_COLOR or DEFAULT_NO_GO_COLORS)
 * @param seed         PRNG seed for reproducibility
 * @param isPractice   Whether this is a practice block
 * @param noGoColors   Override: explicit array of NO-GO colors (derived from mode at call site)
 */
export function generateTrialSequence(
  config: ExperimentConfig,
  seed: number,
  isPractice: boolean,
  noGoColors?: StimulusColor[]
): TrialDefinition[] {
  const totalTrials = isPractice ? config.PRACTICE_TRIALS : config.NUMBER_OF_TRIALS;
  const goProportion = isPractice ? config.PRACTICE_GO_PROPORTION : config.GO_PROPORTION;

  // Resolve NO-GO colors: use provided override, or fall back to config defaults
  const resolvedNoGoColors: StimulusColor[] = noGoColors && noGoColors.length > 0
    ? noGoColors
    : [config.DEFAULT_NO_GO_COLOR];

  const goColors = config.STIMULUS_COLORS.filter(c => !resolvedNoGoColors.includes(c));

  const nGoTrials = Math.round(totalTrials * goProportion);
  const nNoGoTrials = totalTrials - nGoTrials;

  const prng = createPRNG(seed);

  // Step 1: build a flat array of trial types
  const types: TrialType[] = [
    ...Array(nGoTrials).fill('GO') as TrialType[],
    ...Array(nNoGoTrials).fill('NO_GO') as TrialType[],
  ];

  // Step 2: shuffle
  shuffle(types, prng);

  // Step 3: repair MAX_CONSECUTIVE_NOGO constraint
  repairConsecutiveNogo(types, config.MAX_CONSECUTIVE_NOGO, prng);

  // Step 4: assign colors
  // GO: cycle uniformly through all GO colors
  const goColorPool = buildColorPool(goColors, nGoTrials, prng);
  // NO-GO: cycle uniformly through all NO-GO colors (handles both 1 and 2 colors)
  const noGoColorPool = buildColorPool(resolvedNoGoColors, nNoGoTrials, prng);

  let goColorIdx = 0;
  let noGoColorIdx = 0;

  const trials: TrialDefinition[] = types.map((trialType, idx) => {
    const color: StimulusColor = trialType === 'NO_GO'
      ? noGoColorPool[noGoColorIdx++]
      : goColorPool[goColorIdx++];
    return {
      trial_number: idx + 1,
      stimulus_color: color,
      trial_type: trialType,
      is_practice: isPractice,
    };
  });

  return trials;
}

/**
 * Convenience wrapper — accepts config with desired noGoColors array already set.
 * This is the primary entry point used by App.tsx.
 */
export function generateTrialSequenceWithConfig(
  config: ExperimentConfig,
  seed: number,
  isPractice: boolean,
  noGoColors?: StimulusColor[]
): TrialDefinition[] {
  return generateTrialSequence(config, seed, isPractice, noGoColors);
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Repair any run of consecutive NO-GO trials exceeding maxConsecutive
 * by swapping the excess NO-GO with the nearest downstream GO trial.
 */
function repairConsecutiveNogo(
  types: TrialType[],
  maxConsecutive: number,
  _prng: PRNG
): void {
  const maxIterations = types.length * 2;
  let iterations = 0;

  while (iterations < maxIterations) {
    let repaired = true;
    for (let i = 0; i < types.length; i++) {
      if (types[i] === 'NO_GO') {
        let runLength = 0;
        while (i + runLength < types.length && types[i + runLength] === 'NO_GO') {
          runLength++;
        }
        if (runLength > maxConsecutive) {
          const excessIdx = i + maxConsecutive;
          const swapTarget = findNextGO(types, i + runLength);
          if (swapTarget !== -1) {
            types[excessIdx] = 'GO';
            types[swapTarget] = 'NO_GO';
            repaired = false;
            break;
          }
          const upstreamGO = findPrevGO(types, i - 1);
          if (upstreamGO !== -1) {
            types[excessIdx] = 'GO';
            types[upstreamGO] = 'NO_GO';
            repaired = false;
            break;
          }
        }
      }
    }
    if (repaired) break;
    iterations++;
  }
}

function findNextGO(types: TrialType[], startIdx: number): number {
  for (let i = startIdx; i < types.length; i++) {
    if (types[i] === 'GO') return i;
  }
  return -1;
}

function findPrevGO(types: TrialType[], startIdx: number): number {
  for (let i = startIdx; i >= 0; i--) {
    if (types[i] === 'GO') return i;
  }
  return -1;
}

/**
 * Build a color pool for a set of trials by cycling through the available
 * colors with internal shuffling, so no single color dominates.
 */
function buildColorPool(
  colors: StimulusColor[],
  count: number,
  prng: PRNG
): StimulusColor[] {
  const pool: StimulusColor[] = [];
  while (pool.length < count) {
    const batch = [...colors];
    shuffle(batch, prng);
    pool.push(...batch);
  }
  return pool.slice(0, count);
}

/**
 * Validate a generated sequence — useful in tests.
 */
export function validateSequence(
  trials: TrialDefinition[],
  config: ExperimentConfig,
  isPractice: boolean
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  const totalTrials = isPractice ? config.PRACTICE_TRIALS : config.NUMBER_OF_TRIALS;

  if (trials.length !== totalTrials) {
    errors.push(`Expected ${totalTrials} trials, got ${trials.length}`);
  }

  const nGoTrials = trials.filter(t => t.trial_type === 'GO').length;
  const nNoGoTrials = trials.filter(t => t.trial_type === 'NO_GO').length;
  const targetGo = Math.round(totalTrials * (isPractice ? config.PRACTICE_GO_PROPORTION : config.GO_PROPORTION));
  const targetNogo = totalTrials - targetGo;

  if (Math.abs(nGoTrials - targetGo) > 2) {
    errors.push(`GO count ${nGoTrials} deviates too far from target ${targetGo}`);
  }
  if (Math.abs(nNoGoTrials - targetNogo) > 2) {
    errors.push(`NO-GO count ${nNoGoTrials} deviates too far from target ${targetNogo}`);
  }

  // Check max consecutive NO-GO
  let maxRun = 0;
  let currentRun = 0;
  for (const t of trials) {
    if (t.trial_type === 'NO_GO') {
      currentRun++;
      maxRun = Math.max(maxRun, currentRun);
    } else {
      currentRun = 0;
    }
  }
  if (maxRun > config.MAX_CONSECUTIVE_NOGO) {
    errors.push(`Max consecutive NO-GO is ${maxRun}, exceeds limit of ${config.MAX_CONSECUTIVE_NOGO}`);
  }

  return { valid: errors.length === 0, errors };
}
