import type { CSSProperties } from 'react';
import type { Dimensions, ViewportTransform } from '../../types';
import { cx } from '../../utils/classNames';
import { projectCanvasToScreen } from '../../utils/viewport';

export interface GridOverlayProps {
  /** Artboard size in pixels. */
  dimensions: Dimensions;
  /** Current pan/zoom transform. */
  viewport: ViewportTransform;
  /** Bounding box of the canvas box, in client coordinates. */
  containerRect: DOMRect | null;
  /** Grid line colour. */
  color: string;
  /** Minimum zoom at which the grid is drawn (below it lines dominate the art). */
  minZoom?: number;
  /** Extra classes for the overlay element. */
  className?: string;
}

/**
 * Pixel grid overlay.
 *
 * Drawn as two repeating CSS gradients positioned over the artboard rather than
 * on the overlay canvas: the spacing is uniform, so a gradient reproduces the
 * grid exactly, stays a crisp 1px at every zoom level, and costs nothing to
 * redraw while panning or zooming.
 *
 * The overlay is `pointer-events-none` and `aria-hidden` — it is pure decoration.
 */
export function GridOverlay({
  dimensions,
  viewport,
  containerRect,
  color,
  minZoom = 4,
  className,
}: GridOverlayProps) {
  if (containerRect === null || viewport.zoom < minZoom) {
    return null;
  }

  const origin = projectCanvasToScreen({ x: 0, y: 0 }, containerRect, viewport, dimensions);

  // Half-pixel offset keeps the 1px line centred on the cell boundary instead of
  // straddling it, which would blur the line across two device pixels.
  const offsetX = Math.round(origin.x - containerRect.left) + 0.5;
  const offsetY = Math.round(origin.y - containerRect.top) + 0.5;

  const style: CSSProperties = {
    backgroundImage: `linear-gradient(to right, ${color} 0 1px, transparent 1px), linear-gradient(to bottom, ${color} 0 1px, transparent 1px)`,
    backgroundSize: `${viewport.zoom}px ${viewport.zoom}px`,
    backgroundPosition: `${offsetX}px ${offsetY}px`,
    opacity: viewport.zoom >= 8 ? 0.55 : 0.35,
  };

  return (
    <div
      aria-hidden="true"
      className={cx('pointer-events-none absolute inset-0', className)}
      style={style}
    />
  );
}
