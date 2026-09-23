/**
 * Bresenham line rasterisation and brush stamping.
 *
 * All functions are pure: they return new point arrays and never touch a pixel
 * buffer, which keeps them trivially testable and safe to call during a drag
 * gesture (the caller decides when to commit the result).
 */

import type { Dimensions, Point } from '../../types';

/** Rounds to an integer, mapping NaN/Infinity to 0. */
export function safeRound(value: number): number {
  return Number.isFinite(value) ? Math.round(value) : 0;
}

/**
 * Rasterises a 1px-wide line between two grid coordinates using the integer
 * Bresenham algorithm, so continuous strokes never leave gaps.
 *
 * Both endpoints are inclusive. The result always contains at least one point.
 */
export function getBresenhamLine(p0: Point, p1: Point): Point[] {
  const points: Point[] = [];

  // Coerce non-finite input to 0 up front. A NaN endpoint would otherwise make
  // the step budget NaN and silently return an empty array, which callers read as
  // "nothing to paint" — a corrupted coordinate must never produce a no-op.
  let x0 = safeRound(p0.x);
  let y0 = safeRound(p0.y);

  const x1 = safeRound(p1.x);
  const y1 = safeRound(p1.y);

  const dx = Math.abs(x1 - x0);
  const dy = Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;

  let err = dx - dy;

  // Bounded loop guard: the segment can never be longer than |dx| + |dy| + 1
  // steps, so a malformed input (NaN) cannot hang the tab.
  const maxSteps = dx + dy + 1;
  let steps = 0;

  while (steps <= maxSteps) {
    points.push({ x: x0, y: y0 });

    if (x0 === x1 && y0 === y1) {
      break;
    }

    const e2 = 2 * err;

    if (e2 > -dy) {
      err -= dy;
      x0 += sx;
    }

    if (e2 < dx) {
      err += dx;
      y0 += sy;
    }

    steps += 1;
  }

  return points;
}

/**
 * How a brush footprint is anchored to the pixel under the pointer.
 *
 *   - `center` (pixel snap on): odd diameters centre exactly on the cursor pixel;
 *     even diameters are biased up/left by one so a 2px brush still covers the
 *     pixel the user is pointing at.
 *   - `cursor` (pixel snap off): the footprint grows right and down from the
 *     cursor pixel, which makes even-sized brushes perfectly predictable.
 */
export type BrushAnchor = 'center' | 'cursor';

/**
 * Offsets of a square brush of the given diameter.
 *
 * @param brushSize Diameter in pixels.
 * @param anchor Footprint anchoring strategy. Defaults to `center`.
 */
export function getSquareBrushOffsets(
  brushSize: number,
  anchor: BrushAnchor = 'center',
): Point[] {
  const size = Math.max(1, Math.floor(brushSize));

  if (size === 1) {
    return [{ x: 0, y: 0 }];
  }

  const start =
    anchor === 'cursor'
      ? 0
      : size % 2 === 1
        ? -Math.floor(size / 2)
        : -(size / 2 - 1);

  const offsets: Point[] = [];

  for (let dy = 0; dy < size; dy += 1) {
    for (let dx = 0; dx < size; dx += 1) {
      offsets.push({ x: start + dx, y: start + dy });
    }
  }

  return offsets;
}

/**
 * Stamps a square brush along a rasterised line.
 *
 * @param anchor Footprint anchoring strategy; see `getSquareBrushOffsets`.
 * @returns De-duplicated points in painting order.
 */
export function stampLineWithBrush(
  points: readonly Point[],
  brushSize: number,
  anchor: BrushAnchor = 'center',
): Point[] {
  if (brushSize <= 1) {
    return dedupePoints(points);
  }

  const offsets = getSquareBrushOffsets(brushSize, anchor);
  const stamped: Point[] = [];

  for (const point of points) {
    for (const offset of offsets) {
      stamped.push({ x: point.x + offset.x, y: point.y + offset.y });
    }
  }

  return dedupePoints(stamped);
}

/** Removes duplicate coordinates while preserving first-seen order. */
export function dedupePoints(points: readonly Point[]): Point[] {
  const seen = new Set<number>();
  const result: Point[] = [];

  for (const point of points) {
    // Pack into one integer key: safe for grids up to 65535 wide.
    const key = (point.x + 32768) * 65536 + (point.y + 32768);

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    result.push(point);
  }

  return result;
}

/** True when a grid coordinate lies inside the document bounds. */
export function isPointInBounds(point: Point, dimensions: Dimensions): boolean {
  return (
    point.x >= 0 &&
    point.y >= 0 &&
    point.x < dimensions.width &&
    point.y < dimensions.height
  );
}

/** Clamps a grid coordinate to the document bounds. */
export function clampPointToBounds(point: Point, dimensions: Dimensions): Point {
  return {
    x: Math.min(dimensions.width - 1, Math.max(0, Math.round(point.x))),
    y: Math.min(dimensions.height - 1, Math.max(0, Math.round(point.y))),
  };
}

/**
 * Converts a pixel-grid point into a flat buffer index.
 *
 * @returns The index, or `-1` when the point is outside the document.
 */
export function toBufferIndex(point: Point, dimensions: Dimensions): number {
  if (!isPointInBounds(point, dimensions)) {
    return -1;
  }

  return point.y * dimensions.width + point.x;
}

/** Converts a flat buffer index back into a grid point. */
export function fromBufferIndex(index: number, dimensions: Dimensions): Point {
  return {
    x: index % dimensions.width,
    y: Math.floor(index / dimensions.width),
  };
}
