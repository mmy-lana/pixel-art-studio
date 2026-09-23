/**
 * Viewport projection and zoom maths (plan.md §3.5).
 *
 * The viewport is modelled as: the artboard is centred in the canvas box, then
 * translated by `panX`/`panY`, then scaled by `zoom`. Working from the centre
 * outwards keeps the artboard centred when both pan values are zero, which makes
 * "fit to screen" a pure zoom problem.
 */

import type { Dimensions, Point, ViewportTransform } from '../types';

/** Discrete zoom ladder. Index-based stepping keeps zoom levels reproducible. */
export const ZOOM_LADDER: readonly number[] = [
  0.5, 0.75, 1, 1.5, 2, 3, 4, 5, 6, 8, 10, 12, 16, 20, 24, 32, 48, 64,
];

/** Lowest permitted zoom. */
export const MIN_ZOOM = ZOOM_LADDER[0];

/** Highest permitted zoom. */
export const MAX_ZOOM = ZOOM_LADDER[ZOOM_LADDER.length - 1];

/** Clamps a zoom value into the supported range. */
export function clampZoom(zoom: number): number {
  if (!Number.isFinite(zoom)) {
    return 1;
  }

  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom));
}

/**
 * Returns the next ladder step strictly above/below `zoom`.
 *
 * Snapping to the ladder means repeated presses always land on the same levels
 * regardless of the zoom a pinch gesture left behind.
 */
export function getSteppedZoom(zoom: number, direction: 1 | -1): number {
  if (direction === 1) {
    const next = ZOOM_LADDER.find((step) => step > zoom + 0.0001);

    return next ?? MAX_ZOOM;
  }

  const reversed = [...ZOOM_LADDER].reverse();
  const previous = reversed.find((step) => step < zoom - 0.0001);

  return previous ?? MIN_ZOOM;
}

/**
 * Zoom that fits the artboard inside the canvas box, leaving room for a drop
 * shadow-free margin on both axes.
 *
 * The result is snapped down to an integer zoom (or 0.5 for very large
 * documents) so on-screen pixels stay square and crisp.
 */
export function getFitZoom(
  gridDimensions: Dimensions,
  viewportSize: Dimensions,
  paddingPx: number = 32,
): number {
  const availableWidth = Math.max(1, viewportSize.width - paddingPx * 2);
  const availableHeight = Math.max(1, viewportSize.height - paddingPx * 2);

  const raw = Math.min(
    availableWidth / gridDimensions.width,
    availableHeight / gridDimensions.height,
  );

  if (!Number.isFinite(raw) || raw <= 0) {
    return 1;
  }

  const snapped = raw >= 1 ? Math.floor(raw) : 0.5;

  return clampZoom(snapped);
}

/**
 * Projects a pointer position onto grid space WITHOUT bounds checking.
 *
 * Stroke tracking needs the coordinate even when the pointer has been dragged
 * outside the artboard (so a stroke re-entering the document continues in a
 * straight line); clipping happens when pixels are written, not when the
 * coordinate is derived.
 */
export function projectScreenToGrid(
  screenPoint: Point,
  canvasRect: DOMRect,
  viewport: ViewportTransform,
  gridDimensions: Dimensions,
): Point {
  const relX = screenPoint.x - canvasRect.left;
  const relY = screenPoint.y - canvasRect.top;

  return {
    x: Math.floor(
      (relX - canvasRect.width / 2 - viewport.panX) / viewport.zoom +
        gridDimensions.width / 2,
    ),
    y: Math.floor(
      (relY - canvasRect.height / 2 - viewport.panY) / viewport.zoom +
        gridDimensions.height / 2,
    ),
  };
}

/**
 * Projects a pointer position onto the pixel grid (plan.md §3.5).
 *
 * @param screenPoint Pointer position in client coordinates.
 * @param canvasRect Bounding box of the canvas element.
 * @param viewport Current pan/zoom transform.
 * @param gridDimensions Artboard size in pixels.
 * @returns The grid coordinate, or `null` when the point is outside the artboard.
 */
export function projectScreenToCanvas(
  screenPoint: Point,
  canvasRect: DOMRect,
  viewport: ViewportTransform,
  gridDimensions: Dimensions,
): Point | null {
  const point = projectScreenToGrid(screenPoint, canvasRect, viewport, gridDimensions);

  if (
    point.x < 0 ||
    point.x >= gridDimensions.width ||
    point.y < 0 ||
    point.y >= gridDimensions.height
  ) {
    return null;
  }

  return point;
}

/**
 * Projects a grid coordinate into client coordinates.
 *
 * Used to place DOM overlays (grid, marquee) exactly over their pixels.
 */
export function projectCanvasToScreen(
  gridPoint: Point,
  canvasRect: DOMRect,
  viewport: ViewportTransform,
  gridDimensions: Dimensions,
): Point {
  return {
    x:
      canvasRect.left +
      canvasRect.width / 2 +
      viewport.panX +
      (gridPoint.x - gridDimensions.width / 2) * viewport.zoom,
    y:
      canvasRect.top +
      canvasRect.height / 2 +
      viewport.panY +
      (gridPoint.y - gridDimensions.height / 2) * viewport.zoom,
  };
}

/**
 * Pan offset that keeps `gridAnchor` pinned under `screenAnchor` after `zoom`
 * changes.
 *
 * Without this the artboard would drift toward the top-left as the user zooms.
 */
export function getPanForZoomAnchor(
  gridAnchor: Point,
  screenAnchor: Point,
  canvasRect: DOMRect,
  zoom: number,
  gridDimensions: Dimensions,
): { panX: number; panY: number } {
  const relX = screenAnchor.x - canvasRect.left;
  const relY = screenAnchor.y - canvasRect.top;

  return {
    panX: relX - canvasRect.width / 2 - (gridAnchor.x - gridDimensions.width / 2) * zoom,
    panY: relY - canvasRect.height / 2 - (gridAnchor.y - gridDimensions.height / 2) * zoom,
  };
}

/** Restricts a pan offset so the artboard can never be dragged fully off-screen. */
export function clampPan(
  pan: { panX: number; panY: number },
  gridDimensions: Dimensions,
  viewportSize: Dimensions,
  zoom: number,
): { panX: number; panY: number } {
  const scaledWidth = gridDimensions.width * zoom;
  const scaledHeight = gridDimensions.height * zoom;

  // Always leave at least a quarter of the artboard (or the whole artboard when
  // it is smaller than the box) reachable inside the viewport.
  const maxPanX = Math.max(scaledWidth, viewportSize.width) / 2 + scaledWidth / 4;
  const maxPanY = Math.max(scaledHeight, viewportSize.height) / 2 + scaledHeight / 4;

  return {
    panX: Math.min(maxPanX, Math.max(-maxPanX, pan.panX)),
    panY: Math.min(maxPanY, Math.max(-maxPanY, pan.panY)),
  };
}

/** Distance between two touch points, used for pinch zoom. */
export function getTouchDistance(
  a: { clientX: number; clientY: number },
  b: { clientX: number; clientY: number },
): number {
  const dx = a.clientX - b.clientX;
  const dy = a.clientY - b.clientY;

  return Math.sqrt(dx * dx + dy * dy);
}

/** Midpoint between two touch points, used for two-finger panning. */
export function getTouchMidpoint(
  a: { clientX: number; clientY: number },
  b: { clientX: number; clientY: number },
): Point {
  return {
    x: (a.clientX + b.clientX) / 2,
    y: (a.clientY + b.clientY) / 2,
  };
}
