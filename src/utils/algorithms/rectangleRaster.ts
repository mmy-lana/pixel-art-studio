/**
 * Rectangle rasterisation.
 *
 * The rectangle tool drags a bounding box in any direction, so the two corners
 * are normalised before the outline or fill is emitted.
 */

import type { BoundingBox, Point } from '../../types';

/** Normalises two arbitrary corners into an inclusive axis-aligned box. */
export function normalizeCorners(a: Point, b: Point): BoundingBox {
  const startX = Math.round(a.x);
  const startY = Math.round(a.y);
  const endX = Math.round(b.x);
  const endY = Math.round(b.y);

  return {
    minX: Math.min(startX, endX),
    minY: Math.min(startY, endY),
    maxX: Math.max(startX, endX),
    maxY: Math.max(startY, endY),
  };
}

/**
 * Rasterises a rectangle from two corner points.
 *
 * @param from First corner.
 * @param to Opposite corner.
 * @param filled When true every interior pixel is emitted, otherwise only the
 * 1px outline.
 * @returns Row-major, de-duplicated points.
 */
export function getRasterRectangle(from: Point, to: Point, filled: boolean): Point[] {
  const { minX, minY, maxX, maxY } = normalizeCorners(from, to);
  const points: Point[] = [];

  if (filled) {
    for (let y = minY; y <= maxY; y += 1) {
      for (let x = minX; x <= maxX; x += 1) {
        points.push({ x, y });
      }
    }

    return points;
  }

  // Outline: top and bottom edges, then the left/right edges without the corners
  // already emitted above.
  for (let x = minX; x <= maxX; x += 1) {
    points.push({ x, y: minY });
  }

  if (maxY !== minY) {
    for (let x = minX; x <= maxX; x += 1) {
      points.push({ x, y: maxY });
    }
  }

  for (let y = minY + 1; y < maxY; y += 1) {
    points.push({ x: minX, y });

    if (maxX !== minX) {
      points.push({ x: maxX, y });
    }
  }

  return points;
}

/** Width and height of the box in pixels (inclusive). */
export function getBoxDimensions(box: BoundingBox): { width: number; height: number } {
  return {
    width: box.maxX - box.minX + 1,
    height: box.maxY - box.minY + 1,
  };
}
