import { Maximize, RotateCcw, ZoomIn, ZoomOut } from 'lucide-react';
import { cx } from '../../utils/classNames';
import { ArcadeButton } from '../primitives/ArcadeButton';
import { ArcadeTooltip } from '../primitives/ArcadeTooltip';

export interface ZoomControlsProps {
  /** Current scale, where `1` is 100% (1 screen pixel per art pixel). */
  zoom: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  /** Scales the document to fill the available viewport. */
  onFitToScreen: () => void;
  /** Returns to exactly 100%. */
  onResetZoom: () => void;
  /** Lower clamp for the zoom ladder. Defaults to `0.5`. */
  minZoom?: number;
  /** Upper clamp for the zoom ladder. Defaults to `64`. */
  maxZoom?: number;
  /**
   * `bar` shows icon caps plus a percentage readout (desktop status bar).
   * `compact` shows a single row of icon caps (mobile drawer, plan §4.1).
   */
  variant?: 'bar' | 'compact';
  className?: string;
}

/**
 * Viewport zoom controls.
 *
 * Renders the zoom ladder, fit-to-screen and reset-100% actions. The percentage
 * readout is `aria-live="polite"` so keyboard zooming is announced.
 */
export function ZoomControls({
  zoom,
  onZoomIn,
  onZoomOut,
  onFitToScreen,
  onResetZoom,
  minZoom = 0.5,
  maxZoom = 64,
  variant = 'bar',
  className,
}: ZoomControlsProps) {
  const percent = Math.round(zoom * 100);
  const atMin = zoom <= minZoom;
  const atMax = zoom >= maxZoom;
  const isDefault = Math.abs(zoom - 1) < 0.0001;

  const caps = (
    <>
      <ArcadeTooltip label="Zoom out (-)">
        <ArcadeButton
          size="icon"
          aria-label="Zoom out"
          disabled={atMin}
          onClick={onZoomOut}
        >
          <ZoomOut aria-hidden="true" className="h-4 w-4" strokeWidth={2.5} />
        </ArcadeButton>
      </ArcadeTooltip>

      <ArcadeTooltip label="Zoom in (+)">
        <ArcadeButton
          size="icon"
          aria-label="Zoom in"
          disabled={atMax}
          onClick={onZoomIn}
        >
          <ZoomIn aria-hidden="true" className="h-4 w-4" strokeWidth={2.5} />
        </ArcadeButton>
      </ArcadeTooltip>

      <ArcadeTooltip label="Fit the artboard to the viewport (F)">
        <ArcadeButton
          size="icon"
          aria-label="Fit artboard to viewport"
          onClick={onFitToScreen}
        >
          <Maximize aria-hidden="true" className="h-4 w-4" strokeWidth={2.5} />
        </ArcadeButton>
      </ArcadeTooltip>

      <ArcadeTooltip label="Reset to 100% (0)">
        <ArcadeButton
          size="icon"
          aria-label="Reset zoom to one hundred percent"
          disabled={isDefault}
          onClick={onResetZoom}
        >
          <RotateCcw aria-hidden="true" className="h-4 w-4" strokeWidth={2.5} />
        </ArcadeButton>
      </ArcadeTooltip>
    </>
  );

  if (variant === 'compact') {
    return (
      <div className={cx('flex items-center gap-1.5', className)} role="group" aria-label="Zoom">
        {caps}
        <span
          aria-live="polite"
          className="arcade-badge ml-1 px-1.5 py-1 text-pixel-xs tabular-nums text-arcade-cyan"
        >
          {percent}%
        </span>
      </div>
    );
  }

  return (
    <div className={cx('flex items-center gap-2', className)} role="group" aria-label="Zoom">
      <span className="text-pixel-xs uppercase text-arcade-muted">Zoom</span>
      {caps}
      <span
        aria-live="polite"
        className="arcade-badge px-2 py-1 text-pixel-xs tabular-nums text-arcade-cyan"
      >
        {percent}%
      </span>
    </div>
  );
}
