/**
 * Selection bounds hook.
 *
 * `SelectionState` stores a flat array of `{ index, color }` tuples (chosen for
 * structured-clone safety). This hook derives the geometry the UI and the move
 * engine need from that flat representation, and exposes the two mutations that
 * operate on it: translating the selection and deleting its pixels.
 */

import { useCallback, useMemo } from 'react';
import type { BoundingBox, Dimensions, Point } from '../types';
import { editorStore, useEditorStore } from '../store/editorStore';
import { fromBufferIndex } from '../utils/algorithms/bresenham';

export interface SelectionBoundsApi {
  /** Inclusive bounding box in grid space, or `null` when nothing is selected. */
  bounds: BoundingBox | null;
  /** Selected pixel count. */
  pixelCount: number;
  /** Bounding box width in pixels. */
  width: number;
  /** Bounding box height in pixels. */
  height: number;
  /** True while the selection contents are being dragged. */
  isFloating: boolean;
  /** True when `point` lies inside the selection's bounding box. */
  containsPoint: (point: Point) => boolean;
  /**
   * Clears the selected pixels from their current positions.
   *
   * @returns True when a mutation was committed.
   */
  deleteSelectedPixels: () => boolean;
  /**
   * Moves the selection contents by `delta`, clearing the original positions and
   * writing the pixels at the offset ones in a single history record.
   *
   * @returns True when a mutation was committed.
   */
  translateSelection: (delta: Point, actionName?: string) => boolean;
}

/**
 * Derives selection geometry from the editor store.
 *
 * @param dimensions Document size, used to drop out-of-bounds writes when a
 * selection is dragged partly off the artboard.
 */
export function useSelectionBounds(dimensions: Dimensions): SelectionBoundsApi {
  const selection = useEditorStore((state) => state.selection);
  const activeLayerId = useEditorStore((state) => state.activeLayerId);

  const bounds = useMemo<BoundingBox | null>(() => {
    if (selection.selectedPixels.length === 0) {
      return null;
    }

    const { width } = dimensions;

    let minX = Number.POSITIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;

    for (const tuple of selection.selectedPixels) {
      const point = fromBufferIndex(tuple.index, dimensions);

      if (point.x < minX) minX = point.x;
      if (point.y < minY) minY = point.y;
      if (point.x > maxX) maxX = point.x;
      if (point.y > maxY) maxY = point.y;
    }

    if (!Number.isFinite(minX) || width <= 0) {
      return null;
    }

    return { minX, minY, maxX, maxY };
  }, [selection.selectedPixels, dimensions]);

  const containsPoint = useCallback(
    (point: Point): boolean => {
      if (bounds === null) {
        return false;
      }

      return (
        point.x >= bounds.minX &&
        point.x <= bounds.maxX &&
        point.y >= bounds.minY &&
        point.y <= bounds.maxY
      );
    },
    [bounds],
  );

  const deleteSelectedPixels = useCallback((): boolean => {
    if (selection.selectedPixels.length === 0) {
      return false;
    }

    const writes = selection.selectedPixels.map((tuple) => ({
      index: tuple.index,
      color: 0,
    }));

    const committed = editorStore.applyPixelWrites({
      layerId: activeLayerId,
      writes,
      actionName: 'Delete selection',
    });

    editorStore.clearSelection();

    return committed;
  }, [selection.selectedPixels, activeLayerId]);

  const translateSelection = useCallback(
    (delta: Point, actionName: string = 'Move selection'): boolean => {
      if (selection.selectedPixels.length === 0 || (delta.x === 0 && delta.y === 0)) {
        return false;
      }

      const { width, height } = dimensions;
      const totalPixels = width * height;

      // Clears run first so a pixel that is both vacated and re-filled ends up
      // holding the moved colour.
      const writes = selection.selectedPixels.map((tuple) => ({
        index: tuple.index,
        color: 0,
      }));

      const movedTuples: { index: number; color: number }[] = [];

      for (const tuple of selection.selectedPixels) {
        const point = fromBufferIndex(tuple.index, dimensions);
        const targetX = point.x + delta.x;
        const targetY = point.y + delta.y;

        if (targetX < 0 || targetY < 0 || targetX >= width || targetY >= height) {
          continue;
        }

        const targetIndex = targetY * width + targetX;

        if (targetIndex < 0 || targetIndex >= totalPixels) {
          continue;
        }

        if (tuple.color !== 0) {
          writes.push({ index: targetIndex, color: tuple.color });
        }
        movedTuples.push({ index: targetIndex, color: tuple.color });
      }

      const committed = editorStore.applyPixelWrites({
        layerId: activeLayerId,
        writes,
        actionName,
      });

      if (committed) {
        // Follow the pixels so a second drag continues from the new position.
        editorStore.setSelection({
          ...selection,
          selectedPixels: movedTuples,
          floating: false,
        });
      }

      return committed;
    },
    [selection, dimensions, activeLayerId],
  );

  return {
    bounds,
    pixelCount: selection.selectedPixels.length,
    width: bounds === null ? 0 : bounds.maxX - bounds.minX + 1,
    height: bounds === null ? 0 : bounds.maxY - bounds.minY + 1,
    isFloating: selection.floating,
    containsPoint,
    deleteSelectedPixels,
    translateSelection,
  };
}
