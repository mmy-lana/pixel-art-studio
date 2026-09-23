/**
 * Multi-layer compositing engine (plan.md §3.4).
 *
 * CANONICAL PACKING (must match `colorConvert` and `pngExport` exactly):
 *   32-bit little-endian  R(0-7) | G(8-15) | B(16-23) | A(24-31)
 *
 * `compositeLayers` reproduces the plan's arithmetic bit-for-bit for
 * `source-over`, and extends it with the five separable blend modes exposed by
 * the layer UI. Blending follows the W3C compositing model: the source colour is
 * first blended against the backdrop, then composited with source-over:
 *
 *   Cs' = (1 - ab) * Cs + ab * B(Cb, Cs)
 *   ao  = as + ab * (1 - as)
 *   Co  = (Cs' * as + Cb * ab * (1 - as)) / ao
 */

import type {
  BlendMode,
  Dimensions,
  PixelLayer,
  PixelRgba,
  Point,
  RgbaBuffer,
} from '../../types';
import { rgbaToUint32, uint32ToRgba } from '../color/colorConvert';

/** Channel value of a fully transparent pixel. */
const TRANSPARENT = 0;

/** Separable blend function applied to normalised 0-1 channels. */
type ChannelBlend = (backdrop: number, source: number) => number;

const CHANNEL_BLENDS: Partial<Record<BlendMode, ChannelBlend>> = {
  multiply: (backdrop, source) => backdrop * source,
  screen: (backdrop, source) => backdrop + source - backdrop * source,
  // Overlay is hard-light with the operands swapped.
  overlay: (backdrop, source) =>
    backdrop <= 0.5 ? 2 * backdrop * source : 1 - 2 * (1 - backdrop) * (1 - source),
  darken: (backdrop, source) => Math.min(backdrop, source),
  lighten: (backdrop, source) => Math.max(backdrop, source),
};

/** Allocates a fully transparent layer buffer for the given document size. */
export function createEmptyLayerBuffer(width: number, height: number): Uint32Array {
  return new Uint32Array(width * height);
}

/**
 * Returns a new buffer with the same contents.
 *
 * Stroke handling clones the active layer into a *staging* buffer, paints the
 * staging buffer in place, and only then commits it through the store, which
 * allocates yet another buffer. `PixelLayer.data` itself is therefore never
 * mutated — see the immutability invariant in `types/index.ts`.
 */
export function cloneLayerBuffer(data: Uint32Array): Uint32Array {
  return new Uint32Array(data);
}

/**
 * Writes one pixel into a staging buffer.
 *
 * NOTE: only staging buffers may be mutated this way. A buffer that is reachable
 * from a `PixelLayer` in the store must never be passed here.
 */
export function writeStagingPixel(
  stagingBuffer: Uint32Array,
  dimensions: Dimensions,
  point: Point,
  packedColor: number,
): boolean {
  if (
    point.x < 0 ||
    point.y < 0 ||
    point.x >= dimensions.width ||
    point.y >= dimensions.height
  ) {
    return false;
  }

  stagingBuffer[point.y * dimensions.width + point.x] = packedColor;
  return true;
}

/** Reads one packed pixel, or `null` when the point is outside the document. */
export function readBufferPixel(
  buffer: Uint32Array,
  dimensions: Dimensions,
  point: Point,
): number | null {
  if (
    point.x < 0 ||
    point.y < 0 ||
    point.x >= dimensions.width ||
    point.y >= dimensions.height
  ) {
    return null;
  }

  return buffer[point.y * dimensions.width + point.x];
}

/**
 * Composites every visible layer into an RGBA byte buffer ready for
 * `new ImageData(...)`.
 *
 * Layers are sorted by their `order` field (0 = bottom) before compositing, so
 * the caller never has to pre-sort.
 *
 * @returns `Uint8ClampedArray` of `width * height * 4` bytes.
 */
export function compositeLayers(
  layers: readonly PixelLayer[],
  width: number,
  height: number,
): RgbaBuffer {
  const totalPixels = width * height;
  const compositeBuffer = new Uint8ClampedArray(totalPixels * 4);

  const ordered = [...layers].sort((a, b) => a.order - b.order);

  for (let index = 0; index < ordered.length; index += 1) {
    const layer = ordered[index];

    if (!layer.visible || layer.opacity <= 0) {
      continue;
    }

    const layerData = layer.data;

    if (layerData.length < totalPixels) {
      continue;
    }

    const layerOpacity = Math.max(0, Math.min(1, layer.opacity));
    const blend = CHANNEL_BLENDS[layer.blendMode];

    // Fast path: bit-identical to the reference implementation in plan.md §3.4.
    if (blend === undefined) {
      for (let p = 0; p < totalPixels; p += 1) {
        const colorUint32 = layerData[p];

        if (colorUint32 === TRANSPARENT) {
          continue;
        }

        const srcR = (colorUint32 >>> 0) & 0xff;
        const srcG = (colorUint32 >>> 8) & 0xff;
        const srcB = (colorUint32 >>> 16) & 0xff;
        const srcA = (((colorUint32 >>> 24) & 0xff) / 255) * layerOpacity;

        if (srcA <= 0) {
          continue;
        }

        const destOffset = p * 4;
        const dstR = compositeBuffer[destOffset];
        const dstG = compositeBuffer[destOffset + 1];
        const dstB = compositeBuffer[destOffset + 2];
        const dstA = compositeBuffer[destOffset + 3] / 255;

        const outA = srcA + dstA * (1 - srcA);

        if (outA > 0) {
          compositeBuffer[destOffset] = Math.round(
            (srcR * srcA + dstR * dstA * (1 - srcA)) / outA,
          );
          compositeBuffer[destOffset + 1] = Math.round(
            (srcG * srcA + dstG * dstA * (1 - srcA)) / outA,
          );
          compositeBuffer[destOffset + 2] = Math.round(
            (srcB * srcA + dstB * dstA * (1 - srcA)) / outA,
          );
          compositeBuffer[destOffset + 3] = Math.round(outA * 255);
        }
      }

      continue;
    }

    // Blend path.
    for (let p = 0; p < totalPixels; p += 1) {
      const colorUint32 = layerData[p];

      if (colorUint32 === TRANSPARENT) {
        continue;
      }

      const src = uint32ToRgba(colorUint32);
      const srcA = (src.a / 255) * layerOpacity;

      if (srcA <= 0) {
        continue;
      }

      const destOffset = p * 4;
      const dstR = compositeBuffer[destOffset];
      const dstG = compositeBuffer[destOffset + 1];
      const dstB = compositeBuffer[destOffset + 2];
      const dstA = compositeBuffer[destOffset + 3] / 255;

      // Blended source colour in 0-255 space.
      const blendedR =
        (1 - dstA) * src.r + dstA * 255 * blend(dstR / 255, src.r / 255);
      const blendedG =
        (1 - dstA) * src.g + dstA * 255 * blend(dstG / 255, src.g / 255);
      const blendedB =
        (1 - dstA) * src.b + dstA * 255 * blend(dstB / 255, src.b / 255);

      const outA = srcA + dstA * (1 - srcA);

      if (outA > 0) {
        compositeBuffer[destOffset] = Math.round(
          (blendedR * srcA + dstR * dstA * (1 - srcA)) / outA,
        );
        compositeBuffer[destOffset + 1] = Math.round(
          (blendedG * srcA + dstG * dstA * (1 - srcA)) / outA,
        );
        compositeBuffer[destOffset + 2] = Math.round(
          (blendedB * srcA + dstB * dstA * (1 - srcA)) / outA,
        );
        compositeBuffer[destOffset + 3] = Math.round(outA * 255);
      }
    }
  }

  return compositeBuffer;
}

/**
 * Composites one packed source pixel over one packed backdrop pixel.
 *
 * Used by merge-down, which needs packed-in/packed-out arithmetic rather than a
 * byte buffer.
 */
export function compositePixelOver(
  backdropPacked: number,
  sourcePacked: number,
  sourceOpacity: number,
  blendMode: BlendMode,
): number {
  if (sourcePacked === TRANSPARENT || sourceOpacity <= 0) {
    return backdropPacked;
  }

  const src = uint32ToRgba(sourcePacked);
  const dst = uint32ToRgba(backdropPacked);

  const srcA = (src.a / 255) * Math.max(0, Math.min(1, sourceOpacity));
  const dstA = dst.a / 255;

  if (srcA <= 0) {
    return backdropPacked;
  }

  const blend = CHANNEL_BLENDS[blendMode];

  const blendedR = blend === undefined ? src.r : (1 - dstA) * src.r + dstA * 255 * blend(dst.r / 255, src.r / 255);
  const blendedG = blend === undefined ? src.g : (1 - dstA) * src.g + dstA * 255 * blend(dst.g / 255, src.g / 255);
  const blendedB = blend === undefined ? src.b : (1 - dstA) * src.b + dstA * 255 * blend(dst.b / 255, src.b / 255);

  const outA = srcA + dstA * (1 - srcA);

  if (outA <= 0) {
    return TRANSPARENT;
  }

  return rgbaToUint32(
    Math.round((blendedR * srcA + dst.r * dstA * (1 - srcA)) / outA),
    Math.round((blendedG * srcA + dst.g * dstA * (1 - srcA)) / outA),
    Math.round((blendedB * srcA + dst.b * dstA * (1 - srcA)) / outA),
    Math.round(outA * 255),
  );
}

/**
 * Flattens an upper layer into a lower one, producing a single packed buffer
 * that already includes the upper layer's opacity and blend mode.
 *
 * The result keeps the lower layer's alpha; merging never introduces pixels
 * outside the union of the two layers' coverage.
 */
export function mergeLayerBuffers(
  lowerBuffer: Uint32Array,
  upperBuffer: Uint32Array,
  width: number,
  height: number,
  upperOpacity: number,
  upperBlendMode: BlendMode,
): Uint32Array {
  const totalPixels = width * height;
  const merged = new Uint32Array(totalPixels);

  for (let p = 0; p < totalPixels; p += 1) {
    const lower = p < lowerBuffer.length ? lowerBuffer[p] : TRANSPARENT;
    const upper = p < upperBuffer.length ? upperBuffer[p] : TRANSPARENT;

    merged[p] = compositePixelOver(lower, upper, upperOpacity, upperBlendMode);
  }

  return merged;
}

/** Reads a pixel out of a composited RGBA byte buffer. */
export function readCompositePixel(
  composite: RgbaBuffer,
  dimensions: Dimensions,
  point: Point,
): PixelRgba | null {
  if (
    point.x < 0 ||
    point.y < 0 ||
    point.x >= dimensions.width ||
    point.y >= dimensions.height
  ) {
    return null;
  }

  const offset = (point.y * dimensions.width + point.x) * 4;

  return {
    r: composite[offset],
    g: composite[offset + 1],
    b: composite[offset + 2],
    a: composite[offset + 3],
  };
}

/**
 * Flattens the visible layers into a packed buffer.
 *
 * Used by the eyedropper-free paths and by tests that need to compare packed
 * output; the renderer uses the byte-buffer variant directly.
 */
export function flattenLayersToPacked(
  layers: readonly PixelLayer[],
  width: number,
  height: number,
): Uint32Array {
  const composite = compositeLayers(layers, width, height);
  const totalPixels = width * height;
  const packed = new Uint32Array(totalPixels);

  for (let p = 0; p < totalPixels; p += 1) {
    const offset = p * 4;
    packed[p] = rgbaToUint32(
      composite[offset],
      composite[offset + 1],
      composite[offset + 2],
      composite[offset + 3],
    );
  }

  return packed;
}
