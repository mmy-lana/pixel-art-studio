/**
 * Midpoint circle rasterisation (plan.md §3.3).
 *
 * Produces pixel-perfect hollow or filled circles/rounded discs centred on a
 * grid coordinate. Coordinates are de-duplicated through a packed integer key so
 * the octant symmetry never emits the same pixel twice.
 */

import type { Point } from '../../types';

/**
 * Rasterises a circle.
 *
 * @param center Centre in grid coordinates (rounded).
 * @param radius Radius in pixels (rounded). `0` yields just the centre pixel.
 * @param filled When true the disc is filled with horizontal spans.
 * @returns De-duplicated points; order is not significant for painting.
 */
export function getRasterCircle(center: Point, radius: number, filled: boolean): Point[] {
  const points = new Map<number, Point>();
  const cx = Math.round(center.x);
  const cy = Math.round(center.y);
  const r = Math.round(radius);

  const key = (x: number, y: number): number => (x + 32768) * 65536 + (y + 32768);

  const addPoint = (x: number, y: number): void => {
    const packed = key(x, y);

    if (!points.has(packed)) {
      points.set(packed, { x, y });
    }
  };

  const addSpan = (x1: number, x2: number, y: number): void => {
    const minX = Math.min(x1, x2);
    const maxX = Math.max(x1, x2);

    for (let x = minX; x <= maxX; x += 1) {
      addPoint(x, y);
    }
  };

  if (r <= 0) {
    return [{ x: cx, y: cy }];
  }

  let x = 0;
  let y = r;
  let d = 3 - 2 * r;

  while (y >= x) {
    if (filled) {
      addSpan(cx - x, cx + x, cy + y);
      addSpan(cx - x, cx + x, cy - y);
      addSpan(cx - y, cx + y, cy + x);
      addSpan(cx - y, cx + y, cy - x);
    } else {
      addPoint(cx + x, cy + y);
      addPoint(cx - x, cy + y);
      addPoint(cx + x, cy - y);
      addPoint(cx - x, cy - y);
      addPoint(cx + y, cy + x);
      addPoint(cx - y, cy + x);
      addPoint(cx + y, cy - x);
      addPoint(cx - y, cy - x);
    }

    x += 1;

    if (d > 0) {
      y -= 1;
      d = d + 4 * (x - y) + 10;
    } else {
      d = d + 4 * x + 6;
    }
  }

  return Array.from(points.values());
}

/**
 * Radius implied by a drag gesture: the integer distance between the centre and
 * the current pointer position.
 */
export function getDragRadius(center: Point, current: Point): number {
  const dx = current.x - center.x;
  const dy = current.y - center.y;

  return Math.max(0, Math.round(Math.sqrt(dx * dx + dy * dy)));
}
