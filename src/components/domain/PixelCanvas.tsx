import type { Ref, RefObject } from 'react';
import { useCallback, useLayoutEffect, useRef } from 'react';
import type { Dimensions, RgbaBuffer } from '../../types';
import { cx } from '../../utils/classNames';

export interface PixelCanvasProps {
  /** Artboard size in pixels; also the canvas backing-store size. */
  dimensions: Dimensions;
  /**
   * Composite of every visible layer as RGBA bytes
   * (`Uint8ClampedArray` of `width * height * 4`).
   */
  composite: RgbaBuffer;
  /**
   * Receives the imperative paint function so callers can push a preview
   * composite during a drag without a React re-render.
   */
  paintRef?: RefObject<((composite: RgbaBuffer) => void) | null>;
  /** Extra classes for the canvas element. */
  className?: string;
  /** Ref to the underlying `<canvas>`. */
  ref?: Ref<HTMLCanvasElement>;
}

/**
 * The document raster.
 *
 * The backing store is kept at the artboard's native pixel resolution and the
 * browser upscales it with `image-rendering: pixelated` (applied through CSS on
 * the transformed wrapper). That keeps a 128x128 document at a 64x zoom from
 * allocating an 8192px-wide canvas, which would break GPU texture limits, and it
 * gives exact nearest-neighbour magnification for free.
 *
 * Repainting is imperative: `paintComposite` is exposed through a ref so the
 * interaction engine can push a preview composite during a drag without causing
 * a React re-render.
 */
export function PixelCanvas({
  dimensions,
  composite,
  paintRef,
  className,
  ref,
}: PixelCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const assignRef = useCallback(
    (element: HTMLCanvasElement | null): void => {
      canvasRef.current = element;

      if (typeof ref === 'function') {
        ref(element);
      } else if (ref !== null && ref !== undefined) {
        ref.current = element;
      }
    },
    [ref],
  );

  /**
   * Paints an RGBA byte buffer into the canvas.
   *
   * The temporary `ImageData` shares the composite's backing store, so this is a
   * single `putImageData` with no per-pixel copy.
   */
  const paintComposite = useCallback(
    (nextComposite: RgbaBuffer): void => {
      const canvas = canvasRef.current;
      const context = canvas?.getContext('2d');

      if (!canvas || !context) {
        return;
      }

      const expectedLength = dimensions.width * dimensions.height * 4;

      if (nextComposite.length < expectedLength) {
        // Never paint a truncated buffer; clear instead so the mismatch is visible.
        context.clearRect(0, 0, canvas.width, canvas.height);
        return;
      }

      // `ImageData` requires an exactly-sized view, so trim any over-long buffer
      // (never copy when the length already matches).
      const source =
        nextComposite.length === expectedLength
          ? nextComposite
          : nextComposite.slice(0, expectedLength);

      const imageData = new ImageData(source, dimensions.width, dimensions.height);
      context.putImageData(imageData, 0, 0);
    },
    [dimensions],
  );

  // Expose the painter so the interaction engine can drive live previews.
  useLayoutEffect(() => {
    if (!paintRef) {
      return;
    }

    paintRef.current = paintComposite;

    return () => {
      paintRef.current = null;
    };
  }, [paintRef, paintComposite]);

  // Keep the backing store in sync when the document size changes, then repaint.
  useLayoutEffect(() => {
    const canvas = canvasRef.current;

    if (!canvas) {
      return;
    }

    if (canvas.width !== dimensions.width) {
      canvas.width = dimensions.width;
    }

    if (canvas.height !== dimensions.height) {
      canvas.height = dimensions.height;
    }

    paintComposite(composite);
  }, [composite, dimensions, paintComposite]);

  return (
    <canvas
      ref={assignRef}
      width={dimensions.width}
      height={dimensions.height}
      aria-label={`Pixel art canvas, ${dimensions.width} by ${dimensions.height} pixels`}
      role="img"
      className={cx('absolute inset-0 h-full w-full', className)}
      style={{ imageRendering: 'pixelated' }}
    />
  );
}
