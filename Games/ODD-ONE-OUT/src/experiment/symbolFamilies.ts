/**
 * Symbol Families
 *
 * Defines all symbol pairs used in the Odd-One-Out task.
 * Each family provides a distractor (majority) and odd (minority) symbol.
 *
 * Design constraints:
 *   - Symbols must be distinguishable at a glance but require attention
 *   - Shape-based distinction (not colour-only) — accessible + avoids confounds
 *   - High-contrast Unicode symbols suitable for experimental display
 *   - Symbol pair must be clearly different but within the same semantic family
 *
 * IMPORTANT: If you change symbol pairs, update the description field and
 * re-run validation tests. Do not use colour as the sole distinguishing feature.
 */

import type { SymbolPair, SymbolFamilyName } from '../types/experiment';

export const SYMBOL_FAMILIES: Record<SymbolFamilyName, SymbolPair> = {
  CIRCLE_FILL: {
    family: 'CIRCLE_FILL',
    distractor: '○',   // U+25CB WHITE CIRCLE
    oddSymbol:  '●',   // U+25CF BLACK CIRCLE
    description: 'Open circle (distractor) vs filled circle (odd)',
  },
  ARROW_VERTICAL: {
    family: 'ARROW_VERTICAL',
    distractor: '↑',   // U+2191 UPWARDS ARROW
    oddSymbol:  '↓',   // U+2193 DOWNWARDS ARROW
    description: 'Up arrow (distractor) vs down arrow (odd)',
  },
  TRIANGLE: {
    family: 'TRIANGLE',
    distractor: '△',   // U+25B3 WHITE UP-POINTING TRIANGLE
    oddSymbol:  '▽',   // U+25BD WHITE DOWN-POINTING TRIANGLE
    description: 'Up-pointing triangle (distractor) vs down-pointing triangle (odd)',
  },
  SQUARE_DIAMOND: {
    family: 'SQUARE_DIAMOND',
    distractor: '□',   // U+25A1 WHITE SQUARE
    oddSymbol:  '◇',   // U+25C7 WHITE DIAMOND
    description: 'Square (distractor) vs diamond (odd)',
  },
  ARROW_HORIZONTAL: {
    family: 'ARROW_HORIZONTAL',
    distractor: '←',   // U+2190 LEFTWARDS ARROW
    oddSymbol:  '→',   // U+2192 RIGHTWARDS ARROW
    description: 'Left arrow (distractor) vs right arrow (odd)',
  },
  LINE_ORIENTATION: {
    family: 'LINE_ORIENTATION',
    distractor: '─',   // U+2500 BOX DRAWINGS LIGHT HORIZONTAL
    oddSymbol:  '│',   // U+2502 BOX DRAWINGS LIGHT VERTICAL
    description: 'Horizontal line (distractor) vs vertical line (odd)',
  },
  CROSS_PLUS: {
    family: 'CROSS_PLUS',
    distractor: '+',   // U+002B PLUS SIGN
    oddSymbol:  '×',   // U+00D7 MULTIPLICATION SIGN
    description: 'Plus sign (distractor) vs cross/times sign (odd)',
  },
  STAR_VARIANTS: {
    family: 'STAR_VARIANTS',
    distractor: '☆',   // U+2606 WHITE STAR
    oddSymbol:  '★',   // U+2605 BLACK STAR
    description: 'Open star (distractor) vs filled star (odd)',
  },
};

/**
 * Get the symbol pair definition for a given family.
 */
export function getSymbolPair(family: SymbolFamilyName): SymbolPair {
  return SYMBOL_FAMILIES[family];
}

/**
 * Get all enabled symbol family names.
 */
export function getEnabledFamilies(enabled: SymbolFamilyName[]): SymbolPair[] {
  return enabled.map(f => SYMBOL_FAMILIES[f]);
}

/**
 * Validate that all symbol pairs are well-formed (distractor ≠ oddSymbol).
 * Called at module initialisation — throws if misconfigured.
 */
export function validateSymbolFamilies(): void {
  for (const [name, pair] of Object.entries(SYMBOL_FAMILIES)) {
    if (pair.distractor === pair.oddSymbol) {
      throw new Error(`[SymbolFamilies] ${name}: distractor and oddSymbol must differ`);
    }
    if (!pair.distractor || !pair.oddSymbol) {
      throw new Error(`[SymbolFamilies] ${name}: empty distractor or oddSymbol`);
    }
  }
}

// Run validation at import time
validateSymbolFamilies();
