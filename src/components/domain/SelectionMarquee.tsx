import type { Dimensions, ViewportTransform } from '../../types';
import { cx } from '../../utils/classNames';
import { projectCanvasToScreen } from '../../utils/viewport';

export interface SelectionMarqueeProps {
  /** Artboard size in pixels. */
  dimensions: Dimensions;
  /** Current pan/zoom transform. */
  viewport: ViewportTransform;
  /** Bounding box of the canvas box, in client coordinates. */
  containerRect: DOMRect | null;
  /** Selection rectangle in grid space, or `null` when nothing is selected. */
  rect: { minX: number; minY: number; maxX: number; maxY: number } | null;
  /** True while the selection contents are being dragged. */
  floating: boolean;
  /** Extra classes for the marquee element. */
  className?: string;
}

/**
 * Marching-ants selection frame.
 *
 * Rendered in the canvas box (screen space) rather than inside the transformed
 * artboard, so the 2px dashed border keeps a constant screen thickness at every
 * zoom level instead of ballooning to `2 * zoom` pixels.
 */
export function SelectionMarquee({
  dimensions,
  viewport,
  containerRect,
  rect,
  floating,
  className,
}: SelectionMarqueeProps) {
  if (containerRect === null || rect === null) {
    return null;
  }

  const topLeft = projectCanvasToScreen(
    { x: rect.minX, y: rect.minY },
    containerRect,
    viewport,
    dimensions,
  );

  const width = (rect.maxX - rect.minX + 1) * viewport.zoom;
  const height = (rect.maxY - rect.minY + 1) * viewport.zoom;

  return (
    <div
      aria-hidden="true"
      className={cx(
        'pointer-events-none absolute border-2 border-dashed',
        floating ? 'border-arcade-hot-pink' : 'border-arcade-cyan',
        className,
      )}
      style={{
        left: Math.round(topLeft.x - containerRect.left),
        top: Math.round(topLeft.y - containerRect.top),
        width: Math.round(width),
        height: Math.round(height),
        // A drop shadow keeps the ants readable over both light and dark pixels.
        boxShadow: '0 0 0 1px rgba(0, 0, 0, 0.65)',
      }}
    />
  );
}
