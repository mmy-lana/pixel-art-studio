/**
 * Symmetry helpers.
 *
 * AXIS CONVENTION (single source of truth for the whole app):
 *   - `vertical`   mirrors across the VERTICAL centre line  → left  <-> right
 *   - `horizontal` mirrors across the HORIZONTAL centre line → top   <-> bottom
 *
 * Mirrored coordinates use the pixel-grid identity `mirror = size - 1 - value`,
 * so a 32px-wide canvas maps x=0 to x=31 with no off-by-one drift.
 */

import type { Dimensions, Point, SymmetryMode } from '../../types';

/** A single mirror plane. */
export type SymmetryAxis = 'horizontal' | 'vertical';

/** Human-readable metadata for every mode, shared by the UI and tooltips. */
export const SYMMETRY_MODE_META: Readonly<
  Record<SymmetryMode, { label: string; description: string }>
> = {
  none: {
    label: 'Off',
    description: 'Free drawing with no mirroring.',
  },
  horizontal: {
    label: 'H',
    description: 'Mirror across the horizontal axis (top ↔ bottom).',
  },
  vertical: {
    label: 'V',
    description: 'Mirror across the vertical axis (left ↔ right).',
  },
  both: {
    label: 'Both',
    description: 'Mirror across both axes (quadrant symmetry).',
  },
};

/** Ordered mode list matching the control layout. */
export const SYMMETRY_MODES: readonly SymmetryMode[] = [
  'none',
  'vertical',
  'horizontal',
  'both',
];

/** Expands a symmetry mode into the mirror planes it applies. */
export function getSymmetryAxes(mode: SymmetryMode): SymmetryAxis[] {
  switch (mode) {
    case 'none':
      return [];
    case 'vertical':
      return ['vertical'];
    case 'horizontal':
      return ['horizontal'];
    case 'both':
      return ['vertical', 'horizontal'];
    default:
      return [];
  }
}

/**
 * Mirrors one grid point across a single axis.
 *
 * Points outside the grid are mirrored arithmetically (no clamping) so the
 * caller can decide whether to discard or clip them.
 */
export function mirrorPoint(
  point: Point,
  axis: SymmetryAxis,
  dimensions: Dimensions,
): Point {
  return axis === 'vertical'
    ? { x: dimensions.width - 1 - point.x, y: point.y }
    : { x: point.x, y: dimensions.height - 1 - point.y };
}

/**
 * Expands a point into every symmetric counterpart, including the original.
 *
 * Duplicates are removed: a point sitting exactly on a mirror axis would
 * otherwise be painted twice, which is harmless for opaque colours but would
 * double-composite translucent ones.
 */
export function expandSymmetricPoints(
  point: Point,
  mode: SymmetryMode,
  dimensions: Dimensions,
): Point[] {
  const axes = getSymmetryAxes(mode);

  if (axes.length === 0) {
    return [point];
  }

  const results: Point[] = [point];
  const seen = new Set<string>([`${point.x},${point.y}`]);

  const add = (candidate: Point): void => {
    const key = `${candidate.x},${candidate.y}`;

    if (seen.has(key)) {
      return;
    }

    seen.add(key);
    results.push(candidate);
  };

  for (const axis of axes) {
    add(mirrorPoint(point, axis, dimensions));
  }

  // 'both' also needs the diagonal counterpart produced by mirroring the
  // already-mirrored point across the second axis.
  if (axes.length === 2) {
    add({
      x: dimensions.width - 1 - point.x,
      y: dimensions.height - 1 - point.y,
    });
  }

  return results;
}

/** Expands a whole stroke, preserving order and removing duplicates. */
export function expandSymmetricStroke(
  points: readonly Point[],
  mode: SymmetryMode,
  dimensions: Dimensions,
): Point[] {
  if (mode === 'none') {
    return [...points];
  }

  const expanded: Point[] = [];
  const seen = new Set<string>();

  for (const point of points) {
    for (const candidate of expandSymmetricPoints(point, mode, dimensions)) {
      const key = `${candidate.x},${candidate.y}`;

      if (seen.has(key)) {
        continue;
      }

      seen.add(key);
      expanded.push(candidate);
    }
  }

  return expanded;
}
