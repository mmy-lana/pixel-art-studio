/**
 * Flood fill.
 *
 * Breadth-first scanline-free fill over a 4-connected neighbourhood, matching
 * plan.md §3.2. The input buffer is never mutated: a copy is written and
 * returned, which preserves the layer immutability invariant at every call site.
 */

import type { Point } from '../../types';

export interface FloodFillResult {
  /** A new buffer containing the fill (or an unmodified copy when nothing changed). */
  modifiedBuffer: Uint32Array;
  /** Every coordinate that changed, in fill order. */
  changedCoordinates: Point[];
}

/**
 * Replaces the contiguous region of `sourceColor` connected to `startPoint` with
 * `fillColorUint32`.
 *
 * @param buffer Layer raster in the canonical little-endian packing.
 * @param width Document width in pixels.
 * @param height Document height in pixels.
 * @returns The mutated copy plus the changed coordinates. When the start point is
 * out of bounds, or already holds the fill colour, the copy is returned unchanged
 * with an empty coordinate list.
 */
export function executeFloodFill(
  buffer: Uint32Array,
  width: number,
  height: number,
  startPoint: Point,
  fillColorUint32: number,
): FloodFillResult {
  const targetBuffer = new Uint32Array(buffer);
  const changed: Point[] = [];

  const totalPixels = width * height;

  if (!Number.isInteger(width) || !Number.isInteger(height) || totalPixels <= 0) {
    return { modifiedBuffer: targetBuffer, changedCoordinates: changed };
  }

  if (buffer.length < totalPixels) {
    throw new Error(
      `executeFloodFill: buffer holds ${buffer.length} pixels but the document is ${width}x${height} (${totalPixels}).`,
    );
  }

  const startX = Math.floor(startPoint.x);
  const startY = Math.floor(startPoint.y);

  if (startX < 0 || startX >= width || startY < 0 || startY >= height) {
    return { modifiedBuffer: targetBuffer, changedCoordinates: changed };
  }

  const startIndex = startY * width + startX;
  const sourceColor = targetBuffer[startIndex];

  if (sourceColor === fillColorUint32) {
    return { modifiedBuffer: targetBuffer, changedCoordinates: changed };
  }

  const visited = new Uint8Array(totalPixels);
  const queueX = new Int32Array(totalPixels);
  const queueY = new Int32Array(totalPixels);

  let head = 0;
  let tail = 0;

  queueX[tail] = startX;
  queueY[tail] = startY;
  tail += 1;
  visited[startIndex] = 1;

  // Neighbour offsets, hard-coded to avoid allocating a tuple array per pixel.
  const NEIGHBOUR_DX = [1, -1, 0, 0];
  const NEIGHBOUR_DY = [0, 0, 1, -1];

  while (head < tail) {
    const cx = queueX[head];
    const cy = queueY[head];
    head += 1;

    const currentIndex = cy * width + cx;
    targetBuffer[currentIndex] = fillColorUint32;
    changed.push({ x: cx, y: cy });

    for (let i = 0; i < 4; i += 1) {
      const nx = cx + NEIGHBOUR_DX[i];
      const ny = cy + NEIGHBOUR_DY[i];

      if (nx < 0 || nx >= width || ny < 0 || ny >= height) {
        continue;
      }

      const neighbourIndex = ny * width + nx;

      if (visited[neighbourIndex] === 0 && targetBuffer[neighbourIndex] === sourceColor) {
        visited[neighbourIndex] = 1;
        queueX[tail] = nx;
        queueY[tail] = ny;
        tail += 1;
      }
    }
  }

  return { modifiedBuffer: targetBuffer, changedCoordinates: changed };
}

/**
 * Collects the region that `executeFloodFill` would replace without writing it.
 *
 * Used to render the fill preview before the commit, and to report the affected
 * pixel count in the status bar.
 */
export function collectFloodFillRegion(
  buffer: Uint32Array,
  width: number,
  height: number,
  startPoint: Point,
): Point[] {
  const totalPixels = width * height;
  const startX = Math.floor(startPoint.x);
  const startY = Math.floor(startPoint.y);

  if (startX < 0 || startX >= width || startY < 0 || startY >= height) {
    return [];
  }

  const sourceColor = buffer[startY * width + startX];
  const visited = new Uint8Array(totalPixels);
  const queueX = new Int32Array(totalPixels);
  const queueY = new Int32Array(totalPixels);
  const region: Point[] = [];

  let head = 0;
  let tail = 0;

  queueX[tail] = startX;
  queueY[tail] = startY;
  tail += 1;
  visited[startY * width + startX] = 1;

  const NEIGHBOUR_DX = [1, -1, 0, 0];
  const NEIGHBOUR_DY = [0, 0, 1, -1];

  while (head < tail) {
    const cx = queueX[head];
    const cy = queueY[head];
    head += 1;

    region.push({ x: cx, y: cy });

    for (let i = 0; i < 4; i += 1) {
      const nx = cx + NEIGHBOUR_DX[i];
      const ny = cy + NEIGHBOUR_DY[i];

      if (nx < 0 || nx >= width || ny < 0 || ny >= height) {
        continue;
      }

      const neighbourIndex = ny * width + nx;

      if (visited[neighbourIndex] === 0 && buffer[neighbourIndex] === sourceColor) {
        visited[neighbourIndex] = 1;
        queueX[tail] = nx;
        queueY[tail] = ny;
        tail += 1;
      }
    }
  }

  return region;
}
