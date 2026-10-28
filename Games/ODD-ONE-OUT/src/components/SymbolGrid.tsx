/**
 * SymbolGrid Component
 *
 * Renders the NxM grid of symbols for the Odd-One-Out task.
 *
 * DESIGN CONSTRAINTS:
 * - Fixed geometry — does not move or resize between trials.
 * - High-contrast symbols, no colour-only distinction.
 * - Mouse click selects a cell.
 * - Keyboard cursor (arrow keys + Enter/Space) is handled in trialEngine.
 * - After selection, the selected cell is highlighted (not revealed as correct/incorrect
 *   during main task).
 * - Cells outside the grid are not interactive.
 * - No animations on the grid elements themselves (only cursor outline).
 */

import React from 'react';
import type { TrialDefinition } from '../types/experiment';
import { buildGridLayout } from '../experiment/trialGenerator';

interface SymbolGridProps {
  trial: TrialDefinition;
  cellSizePx: number;
  cellGapPx: number;
  /** Currently keyboard-navigated cell (shown to assist keyboard users) */
  keyboardCursorRow: number;
  keyboardCursorCol: number;
  /** The cell the participant selected (null if no selection yet) */
  selectedRow: number | null;
  selectedCol: number | null;
  /** Whether to show correct/incorrect indication (practice only) */
  showCorrectness: boolean;
  /** Whether selection is still allowed (false during ITI or after response) */
  selectionEnabled: boolean;
  /** Called when participant clicks a cell */
  onCellClick: (row: number, col: number) => void;
  /** True if this is the main task (no feedback overlay) */
  isMainTask: boolean;
}

export const SymbolGrid: React.FC<SymbolGridProps> = ({
  trial,
  cellSizePx,
  cellGapPx,
  keyboardCursorRow,
  keyboardCursorCol,
  selectedRow,
  selectedCol,
  showCorrectness,
  selectionEnabled,
  onCellClick,
  isMainTask,
}) => {
  const grid = buildGridLayout(trial);

  return (
    <div
      className="symbol-grid"
      id="symbol-grid"
      role="grid"
      aria-label="Symbol selection grid"
      style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${trial.grid_cols}, ${cellSizePx}px)`,
        gridTemplateRows: `repeat(${trial.grid_rows}, ${cellSizePx}px)`,
        gap: `${cellGapPx}px`,
        userSelect: 'none',
      }}
    >
      {grid.map((row, rIdx) =>
        row.map((symbol, cIdx) => {
          const isSelected = selectedRow === rIdx && selectedCol === cIdx;
          const isKeyboardFocused = keyboardCursorRow === rIdx && keyboardCursorCol === cIdx;
          const isTarget = rIdx === trial.target_row && cIdx === trial.target_col;

          // Determine cell state classes
          let cellClass = 'symbol-cell';
          if (isSelected) {
            if (showCorrectness && !isMainTask) {
              cellClass += isTarget ? ' symbol-cell--correct' : ' symbol-cell--incorrect';
            } else {
              cellClass += ' symbol-cell--selected';
            }
          } else if (isKeyboardFocused && !isSelected) {
            cellClass += ' symbol-cell--keyboard-focus';
          }

          return (
            <button
              key={`${rIdx}-${cIdx}`}
              id={`cell-r${rIdx}-c${cIdx}`}
              type="button"
              className={cellClass}
              role="gridcell"
              aria-label={`Row ${rIdx + 1}, Column ${cIdx + 1}`}
              aria-selected={isSelected}
              aria-current={isKeyboardFocused ? 'true' : undefined}
              tabIndex={isKeyboardFocused ? 0 : -1}
              disabled={!selectionEnabled}
              onClick={() => {
                if (selectionEnabled) onCellClick(rIdx, cIdx);
              }}
              style={{
                width: `${cellSizePx}px`,
                height: `${cellSizePx}px`,
                fontSize: `${Math.round(cellSizePx * 0.55)}px`,
              }}
            >
              {symbol}
            </button>
          );
        })
      )}
    </div>
  );
};
