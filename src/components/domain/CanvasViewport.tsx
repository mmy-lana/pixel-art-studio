import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Dimensions, RgbaBuffer } from '../../types';
import { useEditorStore } from '../../store/editorStore';
import { useCanvasInteraction } from '../../hooks/useCanvasInteraction';
import { useLayerCompositor } from '../../hooks/useLayerCompositor';
import { useSelectionBounds } from '../../hooks/useSelectionBounds';
import { readCompositePixel } from '../../utils/algorithms/compositor';
import { cx } from '../../utils/classNames';
import { projectCanvasToScreen } from '../../utils/viewport';
import { PixelCanvas } from './PixelCanvas';
import { GridOverlay } from './GridOverlay';
import { SelectionMarquee } from './SelectionMarquee';

type DocumentPainter = (composite: RgbaBuffer) => void;

export interface CanvasViewportProps {
  /** Extra classes for the canvas box. */
  className?: string;
}

/** Backdrop treatment for the transparent areas of the artboard. */
const BACKDROP_CLASSES = {
  checker: 'arcade-checker',
  'solid-dark': 'arcade-backdrop-dark',
  'solid-light': 'arcade-backdrop-light',
} as const;

/**
 * The canvas engine's mounting point.
 *
 * Layout: a transformed artboard (centred, panned, zoomed) holding the document
 * canvas, with three screen-space layers above it — the pixel grid, the
 * selection marquee and the interaction overlay canvas (hover cursor, brush
 * footprint, shape preview, floating selection preview, symmetry guides).
 *
 * The artboard transform is CSS-only, so panning and zooming never repaint a
 * single pixel; only the 1px screen-space layers follow the transform.
 */
export function CanvasViewport({ className }: CanvasViewportProps) {
  const project = useEditorStore((state) => state.currentProject);
  const layers = useEditorStore((state) => state.layers);
  const viewport = useEditorStore((state) => state.viewport);
  const settings = useEditorStore((state) => state.settings);
  const selection = useEditorStore((state) => state.selection);

  const dimensions = useMemo<Dimensions>(
    () => ({ width: project.width, height: project.height }),
    [project.width, project.height],
  );

  const containerRef = useRef<HTMLDivElement | null>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const documentPaintRef = useRef<DocumentPainter | null>(null);

  /**
   * Box rect in client coordinates. Kept in state (not a ref) because the DOM
   * grid and marquee overlays are positioned from it; it only changes on layout
   * changes, never on pointer movement.
   */
  const [containerRect, setContainerRect] = useState<DOMRect | null>(null);

  const { baseComposite, compositeWithPreview } = useLayerCompositor(
    layers,
    dimensions.width,
    dimensions.height,
  );

  const selectionBounds = useSelectionBounds(dimensions);

  const paintDocument = useCallback((composite: RgbaBuffer): void => {
    documentPaintRef.current?.(composite);
  }, []);

  const paintBaseDocument = useCallback((): void => {
    documentPaintRef.current?.(baseComposite);
  }, [baseComposite]);

  const sampleCompositePixel = useCallback(
    (point: { x: number; y: number }) =>
      readCompositePixel(baseComposite, dimensions, point),
    [baseComposite, dimensions],
  );

  const interaction = useCanvasInteraction({
    containerRef,
    overlayCanvasRef,
    paintDocument,
    paintBaseDocument,
    compositeWithPreview,
    sampleCompositePixel,
    commitSelectionMove: selectionBounds.translateSelection,
  });

  /* ---------------- box rect tracking ---------------- */

  useEffect(() => {
    const element = containerRef.current;

    if (!element) {
      return;
    }

    const update = (): void => {
      setContainerRect(element.getBoundingClientRect());
    };

    update();

    const observer = new ResizeObserver(update);
    observer.observe(element);

    window.addEventListener('resize', update);
    // Capture-phase scroll catches panel scrolling that shifts the box.
    window.addEventListener('scroll', update, true);

    return () => {
      observer.disconnect();
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, []);

  /* ---------------- marquee rectangle ---------------- */

  const marqueeRect = useMemo(() => {
    // A live marquee drag reports origin/current before the pixel tuples exist.
    if (selection.active && selection.origin !== null && selection.current !== null) {
      return {
        minX: Math.min(selection.origin.x, selection.current.x),
        minY: Math.min(selection.origin.y, selection.current.y),
        maxX: Math.max(selection.origin.x, selection.current.x),
        maxY: Math.max(selection.origin.y, selection.current.y),
      };
    }

    return selectionBounds.bounds;
  }, [selection, selectionBounds.bounds]);

  const artboardFrame = useMemo(() => {
    if (containerRect === null) {
      return null;
    }

    const topLeft = projectCanvasToScreen({ x: 0, y: 0 }, containerRect, viewport, dimensions);

    return {
      left: Math.round(topLeft.x - containerRect.left),
      top: Math.round(topLeft.y - containerRect.top),
      width: Math.round(dimensions.width * viewport.zoom),
      height: Math.round(dimensions.height * viewport.zoom),
    };
  }, [containerRect, viewport, dimensions]);

  return (
    <div
      ref={containerRef}
      {...interaction.handlers}
      className={cx(
        'arcade-deck relative touch-none overflow-hidden select-none',
        className,
      )}
    >
      {/* Transformed artboard: centred, panned and zoomed in one CSS transform. */}
      <div
        className="absolute left-1/2 top-1/2"
        style={{
          width: dimensions.width,
          height: dimensions.height,
          transform: `translate(-50%, -50%) translate(${viewport.panX}px, ${viewport.panY}px) scale(${viewport.zoom})`,
          imageRendering: 'pixelated',
        }}
      >
        <div
          aria-hidden="true"
          className={cx('absolute inset-0', BACKDROP_CLASSES[settings.backgroundPattern])}
        />
        <PixelCanvas
          dimensions={dimensions}
          composite={baseComposite}
          paintRef={documentPaintRef}
        />
      </div>

      {/* Artboard frame (screen space so its 1px edge never scales). */}
      {artboardFrame !== null && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute"
          style={{
            left: artboardFrame.left,
            top: artboardFrame.top,
            width: artboardFrame.width,
            height: artboardFrame.height,
            boxShadow: '0 0 0 1px rgba(232, 234, 246, 0.35), 0 6px 0 -2px rgba(0, 0, 0, 0.6)',
          }}
        />
      )}

      {settings.gridVisible && (
        <GridOverlay
          dimensions={dimensions}
          viewport={viewport}
          containerRect={containerRect}
          color={settings.gridColor}
        />
      )}

      <SelectionMarquee
        dimensions={dimensions}
        viewport={viewport}
        containerRect={containerRect}
        rect={marqueeRect}
        floating={selection.floating}
      />

      {/* Interaction overlay: hover cursor, shape + move previews, guides. */}
      <canvas
        ref={overlayCanvasRef}
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 h-full w-full"
      />

      {/* Transient warnings (locked layer, blocked action). */}
      {interaction.warningMessage !== null && (
        <div
          role="status"
          className="arcade-pop absolute bottom-2 left-1/2 z-20 flex max-w-[92%] -translate-x-1/2 items-center gap-2 border-2 border-arcade-amber bg-arcade-ink px-2 py-1.5"
        >
          <span className="text-pixel-xs normal-case leading-relaxed text-arcade-amber">
            {interaction.warningMessage}
          </span>
          <button
            type="button"
            aria-label="Dismiss warning"
            onClick={interaction.clearWarning}
            className="pixel-press flex h-6 w-6 flex-none items-center justify-center border-2 border-arcade-amber text-pixel-xs text-arcade-amber"
          >
            ✕
          </button>
        </div>
      )}
    </div>
  );
}
