/**
 * Layer compositor hook.
 *
 * Owns the offscreen compositing pipeline: committed layers are composited once
 * per state change (memoised), and a staging buffer can be swapped in for a
 * single layer to produce a preview composite during a live stroke.
 *
 * The preview path deliberately does NOT touch React state — the interaction
 * engine calls `compositeWithPreview` and pushes the result straight into the
 * canvas, so a 60Hz drag never triggers a re-render.
 */

import { useCallback, useMemo } from 'react';
import type { PixelLayer, RgbaBuffer } from '../types';
import { compositeLayers, flattenLayersToPacked } from '../utils/algorithms/compositor';

export interface LayerCompositorApi {
  /** Composite of the committed layers only, as RGBA bytes. */
  baseComposite: RgbaBuffer;
  /**
   * Composite with `data` swapped in for `layerId`.
   *
   * @returns A fresh RGBA byte buffer; the base composite is never mutated.
   */
  compositeWithPreview: (layerId: string, data: Uint32Array) => RgbaBuffer;
  /** Flattened packed pixels of the committed layers (eyedropper sampling). */
  packedComposite: Uint32Array;
}

/**
 * Composites `layers` at the given document size.
 *
 * @param layers Layers in any order; the compositor sorts by `order`.
 * @param width Document width in pixels.
 * @param height Document height in pixels.
 */
export function useLayerCompositor(
  layers: readonly PixelLayer[],
  width: number,
  height: number,
): LayerCompositorApi {
  const baseComposite = useMemo(
    () => compositeLayers(layers, width, height),
    [layers, width, height],
  );

  const packedComposite = useMemo(
    () => flattenLayersToPacked(layers, width, height),
    [layers, width, height],
  );

  const compositeWithPreview = useCallback(
    (layerId: string, data: Uint32Array): RgbaBuffer => {
      const withPreview = layers.map((layer) =>
        layer.id === layerId ? { ...layer, data } : layer,
      );

      return compositeLayers(withPreview, width, height);
    },
    [layers, width, height],
  );

  return { baseComposite, compositeWithPreview, packedComposite };
}
