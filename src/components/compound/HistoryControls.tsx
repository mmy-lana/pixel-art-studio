import { Redo2, Undo2 } from 'lucide-react';
import { cx } from '../../utils/classNames';
import { ArcadeButton } from '../primitives/ArcadeButton';
import { ArcadeTooltip } from '../primitives/ArcadeTooltip';

export interface HistoryControlsProps {
  canUndo: boolean;
  canRedo: boolean;
  /**
   * Action name of the step that undo would revert, e.g. `"Pencil"`. Rendered in
   * the tooltip and in the step readout; `null` when the buffer is empty.
   */
  undoActionName: string | null;
  /** Action name of the step that redo would reapply. */
  redoActionName: string | null;
  onUndo: () => void;
  onRedo: () => void;
  /** Steps currently retained in the buffer. */
  historyDepth: number;
  /** Capacity of the circular buffer. Defaults to `50`. */
  historyLimit?: number;
  /** `bar` adds the depth readout, `compact` is caps only. */
  variant?: 'bar' | 'compact';
  className?: string;
}

/**
 * Undo / redo controls.
 *
 * Both caps carry the pending action name so the user knows what a press will
 * do before pressing it, and the depth readout shows how much of the 50-step
 * buffer is in use.
 */
export function HistoryControls({
  canUndo,
  canRedo,
  undoActionName,
  redoActionName,
  onUndo,
  onRedo,
  historyDepth,
  historyLimit = 50,
  variant = 'bar',
  className,
}: HistoryControlsProps) {
  const undoLabel =
    canUndo && undoActionName !== null ? `Undo ${undoActionName} (Ctrl+Z)` : 'Nothing to undo';

  const redoLabel =
    canRedo && redoActionName !== null ? `Redo ${redoActionName} (Ctrl+Y)` : 'Nothing to redo';

  return (
    <div className={cx('flex items-center gap-1.5', className)} role="group" aria-label="History">
      <ArcadeTooltip label={undoLabel}>
        <ArcadeButton
          size="icon"
          aria-label={undoLabel}
          disabled={!canUndo}
          onClick={onUndo}
        >
          <Undo2 aria-hidden="true" className="h-4 w-4" strokeWidth={2.5} />
        </ArcadeButton>
      </ArcadeTooltip>

      <ArcadeTooltip label={redoLabel}>
        <ArcadeButton
          size="icon"
          aria-label={redoLabel}
          disabled={!canRedo}
          onClick={onRedo}
        >
          <Redo2 aria-hidden="true" className="h-4 w-4" strokeWidth={2.5} />
        </ArcadeButton>
      </ArcadeTooltip>

      {variant === 'bar' && (
        <span className="arcade-badge px-2 py-1 text-pixel-xs tabular-nums">
          {historyDepth}/{historyLimit}
        </span>
      )}
    </div>
  );
}
