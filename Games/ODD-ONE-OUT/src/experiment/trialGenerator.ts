/**
 * Trial Generator — Odd-One-Out Symbol Selection Task
 *
 * Produces a constrained pseudorandom trial sequence for both practice
 * and main experiment blocks.
 *
 * Constraints enforced:
 *   1. Exactly one odd symbol per trial (ODD_SYMBOL_COUNT = 1).
 *   2. All other symbols are the distractor.
 *   3. Target position is balanced across the grid (no quadrant dominance).
 *   4. Symbol families are balanced across trials.
 *   5. No more than MAX_CONSECUTIVE_SAME_FAMILY consecutive same-family trials.
 *   6. Deterministic given the same seed.
 *
 * Validation:
 *   validateTrialSequence() checks all constraints and should be called before
 *   starting the experiment.
 */

import type {
  TrialDefinition,
  SymbolFamilyName,
  ExperimentConfig,
} from '../types/experiment';
import { createPRNG, shuffle, randInt, type PRNG } from './randomization';
import { getSymbolPair } from './symbolFamilies';

/**
 * Generate a trial sequence.
 *
 * @param config      Experiment configuration
 * @param seed        Reproducibility seed
 * @param isPractice  Whether this is a practice block
 */
export function generateTrialSequence(
  config: ExperimentConfig,
  seed: number,
  isPractice: boolean
): TrialDefinition[] {
  const totalTrials = isPractice ? config.PRACTICE_TRIALS : config.NUMBER_OF_TRIALS;
  const families = config.ENABLED_SYMBOL_FAMILIES;
  const rows = config.GRID_ROWS;
  const cols = config.GRID_COLS;
  const totalCells = rows * cols;

  const prng = createPRNG(seed);

  // Step 1: Build a balanced family pool
  const familyPool = buildBalancedPool(families, totalTrials, prng);

  // Step 2: Repair consecutive-same-family constraint
  repairConsecutiveSameFamily(familyPool, config.MAX_CONSECUTIVE_SAME_FAMILY, prng);

  // Step 3: Build a balanced position pool (flat cell index)
  const positionPool = buildBalancedPool(
    Array.from({ length: totalCells }, (_, i) => i),
    totalTrials,
    prng
  );

  // Step 4: Assemble trial definitions
  const trials: TrialDefinition[] = familyPool.slice(0, totalTrials).map((family, idx) => {
    const pair = getSymbolPair(family);
    const flatPos = positionPool[idx];
    const targetRow = Math.floor(flatPos / cols);
    const targetCol = flatPos % cols;

    return {
      trial_id: `trial-${isPractice ? 'P' : 'M'}-${(seed >>> 0).toString(16).padStart(8, '0')}-${(idx + 1).toString().padStart(4, '0')}`,
      trial_number: idx + 1,
      symbol_family: family,
      distractor_symbol: pair.distractor,
      odd_symbol: pair.oddSymbol,
      grid_rows: rows,
      grid_cols: cols,
      target_row: targetRow,
      target_col: targetCol,
      difficulty_condition: 'standard',
      random_seed: seed,
      is_practice: isPractice,
    };
  });

  return trials;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Build a balanced pool by cycling through items with internal shuffling,
 * ensuring no item dominates over any other.
 */
function buildBalancedPool<T>(items: T[], count: number, prng: PRNG): T[] {
  const pool: T[] = [];
  while (pool.length < count) {
    const batch = [...items];
    shuffle(batch, prng);
    pool.push(...batch);
  }
  return pool.slice(0, count);
}

/**
 * Repair runs of the same symbol family exceeding maxConsecutive by swapping
 * with the nearest downstream trial of a different family.
 */
function repairConsecutiveSameFamily(
  families: SymbolFamilyName[],
  maxConsecutive: number,
  _prng: PRNG
): void {
  const maxIterations = families.length * 2;
  let iterations = 0;

  while (iterations < maxIterations) {
    let repaired = true;
    for (let i = 0; i < families.length; i++) {
      let runLength = 0;
      while (i + runLength < families.length && families[i + runLength] === families[i]) {
        runLength++;
      }
      if (runLength > maxConsecutive) {
        const excessIdx = i + maxConsecutive;
        // Find the nearest downstream position with a different family
        const swapTarget = findNextDifferent(families, i + runLength, families[i]);
        if (swapTarget !== -1) {
          [families[excessIdx], families[swapTarget]] = [families[swapTarget], families[excessIdx]];
          repaired = false;
          break;
        }
      }
    }
    if (repaired) break;
    iterations++;
  }
}

function findNextDifferent<T>(arr: T[], startIdx: number, excludeValue: T): number {
  for (let i = startIdx; i < arr.length; i++) {
    if (arr[i] !== excludeValue) return i;
  }
  return -1;
}

// ─── Validation ───────────────────────────────────────────────────────────────

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Validate a generated trial sequence.
 * Must be called before starting the experiment.
 */
export function validateTrialSequence(
  trials: TrialDefinition[],
  config: ExperimentConfig,
  isPractice: boolean
): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const expectedCount = isPractice ? config.PRACTICE_TRIALS : config.NUMBER_OF_TRIALS;

  // 1. Count
  if (trials.length !== expectedCount) {
    errors.push(`Expected ${expectedCount} trials, got ${trials.length}`);
  }

  // 2. Exactly one odd symbol (structural — always true by construction, but verify)
  if (config.ODD_SYMBOL_COUNT !== 1) {
    errors.push(`ODD_SYMBOL_COUNT must be 1, got ${config.ODD_SYMBOL_COUNT}`);
  }

  // 3. All required fields present and within bounds
  const seenIds = new Set<string>();
  for (const trial of trials) {
    if (seenIds.has(trial.trial_id)) {
      errors.push(`Duplicate trial_id: ${trial.trial_id}`);
    }
    seenIds.add(trial.trial_id);

    if (trial.target_row < 0 || trial.target_row >= config.GRID_ROWS) {
      errors.push(`Trial ${trial.trial_number}: target_row ${trial.target_row} out of bounds`);
    }
    if (trial.target_col < 0 || trial.target_col >= config.GRID_COLS) {
      errors.push(`Trial ${trial.trial_number}: target_col ${trial.target_col} out of bounds`);
    }
    if (trial.distractor_symbol === trial.odd_symbol) {
      errors.push(`Trial ${trial.trial_number}: distractor equals oddSymbol`);
    }
    if (!config.ENABLED_SYMBOL_FAMILIES.includes(trial.symbol_family)) {
      errors.push(`Trial ${trial.trial_number}: symbol_family ${trial.symbol_family} not in enabled families`);
    }
  }

  // 4. Sequential trial numbers
  trials.forEach((t, i) => {
    if (t.trial_number !== i + 1) {
      errors.push(`Trial ${i}: trial_number is ${t.trial_number}, expected ${i + 1}`);
    }
  });

  // 5. is_practice flag consistency
  const wrongPractice = trials.filter(t => t.is_practice !== isPractice);
  if (wrongPractice.length > 0) {
    errors.push(`${wrongPractice.length} trials have wrong is_practice flag`);
  }

  // 6. Max consecutive same family
  let maxRun = 0;
  let currentRun = 0;
  let prevFamily: SymbolFamilyName | null = null;
  for (const t of trials) {
    if (t.symbol_family === prevFamily) {
      currentRun++;
      maxRun = Math.max(maxRun, currentRun);
    } else {
      currentRun = 1;
      prevFamily = t.symbol_family;
    }
  }
  if (maxRun > config.MAX_CONSECUTIVE_SAME_FAMILY) {
    warnings.push(
      `Max consecutive same-family run is ${maxRun}, ` +
      `exceeds target of ${config.MAX_CONSECUTIVE_SAME_FAMILY}`
    );
  }

  // 7. Position balance — warn if any position appears more than 2× expected
  if (trials.length > 0) {
    const posCounts: Record<string, number> = {};
    for (const t of trials) {
      const key = `${t.target_row},${t.target_col}`;
      posCounts[key] = (posCounts[key] ?? 0) + 1;
    }
    const totalCells = config.GRID_ROWS * config.GRID_COLS;
    const expectedPerCell = trials.length / totalCells;
    for (const [pos, count] of Object.entries(posCounts)) {
      if (count > expectedPerCell * 2.5) {
        warnings.push(`Position ${pos} appears ${count} times (expected ~${expectedPerCell.toFixed(1)})`);
      }
    }
  }

  // 8. Family balance — warn if any family appears more than 2× expected
  if (trials.length > 0 && config.ENABLED_SYMBOL_FAMILIES.length > 0) {
    const familyCounts: Partial<Record<SymbolFamilyName, number>> = {};
    for (const t of trials) {
      familyCounts[t.symbol_family] = (familyCounts[t.symbol_family] ?? 0) + 1;
    }
    const expectedPerFamily = trials.length / config.ENABLED_SYMBOL_FAMILIES.length;
    for (const [family, count] of Object.entries(familyCounts)) {
      if ((count ?? 0) > expectedPerFamily * 2) {
        warnings.push(`Family ${family} appears ${count} times (expected ~${expectedPerFamily.toFixed(1)})`);
      }
    }
  }

  // 9. Reproducibility check: regenerate with same seed and compare
  const regenerated = generateTrialSequence(config, trials[0]?.random_seed ?? 0, isPractice);
  if (regenerated.length === trials.length) {
    const mismatch = trials.findIndex(
      (t, i) =>
        t.symbol_family !== regenerated[i].symbol_family ||
        t.target_row !== regenerated[i].target_row ||
        t.target_col !== regenerated[i].target_col
    );
    if (mismatch !== -1) {
      errors.push(`Reproducibility failure at trial ${mismatch + 1}: regenerated sequence differs`);
    }
  }

  return { valid: errors.length === 0, errors, warnings };
}

/**
 * Build the full symbol grid layout for a trial.
 * Returns a 2D array of symbols (rows × cols).
 * The target position contains the odd symbol; all others contain the distractor.
 *
 * @param trial  The trial definition.
 * @returns      2D array of symbol strings, [row][col].
 */
export function buildGridLayout(trial: TrialDefinition): string[][] {
  const grid: string[][] = [];
  for (let r = 0; r < trial.grid_rows; r++) {
    const row: string[] = [];
    for (let c = 0; c < trial.grid_cols; c++) {
      if (r === trial.target_row && c === trial.target_col) {
        row.push(trial.odd_symbol);
      } else {
        row.push(trial.distractor_symbol);
      }
    }
    grid.push(row);
  }
  return grid;
}

/**
 * Verify the answer for a given selection.
 */
export function checkAnswer(
  trial: TrialDefinition,
  selectedRow: number,
  selectedCol: number
): boolean {
  return selectedRow === trial.target_row && selectedCol === trial.target_col;
}

/**
 * Convenience wrapper — generates and validates in one call.
 * Throws if validation fails. Use this in App.tsx.
 */
export function generateAndValidateTrials(
  config: ExperimentConfig,
  seed: number,
  isPractice: boolean
): TrialDefinition[] {
  const trials = generateTrialSequence(config, seed, isPractice);
  const result = validateTrialSequence(trials, config, isPractice);
  if (!result.valid) {
    throw new Error(`[TrialGenerator] Validation failed:\n${result.errors.join('\n')}`);
  }
  if (result.warnings.length > 0) {
    console.warn('[TrialGenerator] Warnings:', result.warnings);
  }
  return trials;
}

/**
 * Generate a random integer in a range using crypto (for seed generation only).
 * Not to be confused with trial-level randomization, which uses the seeded PRNG.
 */
export function generateRandomSeed(): number {
  const arr = new Uint32Array(1);
  crypto.getRandomValues(arr);
  return arr[0];
}

// Re-export randInt for use in position building
export { randInt };
