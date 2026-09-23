/**
 * Canvas interaction engine.
 *
 * Responsibilities
 *   - Pointer and multi-touch handling for every tool, with the gesture
 *     preemption rule from plan §4.2: the moment a second touch point appears,
 *     the pending single-pointer stroke buffer is DISCARDED (zero pixels
 *     committed) and the gesture switches exclusively to pan/pinch-zoom.
 *   - Painting into a staging buffer during the drag and committing exactly once
 *     on pointerup, so `PixelLayer.data` is never mutated in place and no
 *     IndexedDB write can be scheduled from `pointermove`.
 *   - Screen-space overlay painting: hover cursor, brush footprint, shape
 *     preview, floating-selection preview and symmetry guides.
 *
 * The hook is deliberately imperative: hover and stroke state live in refs so a
 * 60Hz drag paints the canvas without triggering a single React re-render.
 */

import type {
  MouseEvent as ReactMouseEvent,
  PointerEvent as ReactPointerEvent,
  RefObject,
} from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Dimensions, PixelRgba, Point, RgbaBuffer, ToolType } from '../types';
import { editorStore, useEditorStore } from '../store/editorStore';
import { getBresenhamLine, stampLineWithBrush } from '../utils/algorithms/bresenham';
import type { BrushAnchor } from '../utils/algorithms/bresenham';
import { executeFloodFill } from '../utils/algorithms/floodFill';
import { getDragRadius, getRasterCircle } from '../utils/algorithms/circleRaster';
import { getRasterRectangle } from '../utils/algorithms/rectangleRaster';
import { expandSymmetricStroke } from '../utils/algorithms/symmetry';
import { hexToUint32, rgbaToCssString } from '../utils/color/colorConvert';
import {
  clampZoom,
  getPanForZoomAnchor,
  getSteppedZoom,
  getTouchDistance,
  getTouchMidpoint,
  projectCanvasToScreen,
  projectScreenToGrid,
} from '../utils/viewport';
import { getToolDefinition } from '../utils/tools/toolDefinitions';
import { retroAudioEngine } from '../utils/audio/soundSynth';

/** What the active pointer is doing. */
type StrokeKind = 'none' | 'freehand' | 'shape' | 'pan' | 'marquee' | 'move-selection';

interface StrokeState {
  kind: StrokeKind;
  pointerId: number;
  layerId: string;
  /** Staging buffer for pixel edits; `null` for pan/marquee/selection moves. */
  staging: Uint32Array | null;
  actionName: string;
  /** Last painted point (freehand). */
  lastPoint: Point;
  /** Anchor point (shapes, marquee, selection moves). */
  anchor: Point;
  /** Latest point. */
  current: Point;
  /** Packed colour being painted. */
  color: number;
  /** Shift-held at pointerdown: filled shapes. */
  filled: boolean;
  /** Pixels written into the staging buffer so far. */
  paintedCount: number;
  /** Last seen pointer position, in client coordinates (incremental panning). */
  lastClient: Point;
}

interface GestureState {
  active: boolean;
  startDistance: number;
  startZoom: number;
  startMidpoint: Point;
  /** Grid point under the gesture midpoint, kept pinned while zooming. */
  anchorGrid: Point | null;
}

/** Result of the tool's immediate (non-stroke) action. */
interface ToolOutcome {
  handled: boolean;
  message: string | null;
}

export interface CanvasInteractionParams {
  /** Canvas box that owns every pointer gesture. */
  containerRef: RefObject<HTMLDivElement | null>;
  /** Screen-space overlay canvas (cursor, preview, guides). */
  overlayCanvasRef: RefObject<HTMLCanvasElement | null>;
  /** Pushes a document-resolution composite into the visible canvas. */
  paintDocument: (composite: RgbaBuffer) => void;
  /** Repaints the canvas from the committed composite (drops any preview). */
  paintBaseDocument: () => void;
  /** Composite with a staging buffer swapped in for one layer. */
  compositeWithPreview: (layerId: string, data: Uint32Array) => RgbaBuffer;
  /** Samples the committed composite (eyedropper). */
  sampleCompositePixel: (point: Point) => PixelRgba | null;
  /** Commits a selection translation through the selection hook's logic. */
  commitSelectionMove: (delta: Point) => boolean;
}

export interface CanvasInteractionApi {
  /** True between pointerdown and pointerup of a drawing stroke. */
  isDrawing: boolean;
  /** True while a pan gesture (space, hand tool or middle button) is active. */
  isPanning: boolean;
  /** Pixel under the pointer, throttled for the status bar. */
  hoverPixel: Point | null;
  /** Transient message: locked layer, blocked action. */
  warningMessage: string | null;
  clearWarning: () => void;
  /** Repaints the overlay; call after a viewport or preference change. */
  repaintOverlay: () => void;
  handlers: {
    onPointerDown: (event: ReactPointerEvent<HTMLDivElement>) => void;
    onPointerMove: (event: ReactPointerEvent<HTMLDivElement>) => void;
    onPointerUp: (event: ReactPointerEvent<HTMLDivElement>) => void;
    onPointerCancel: (event: ReactPointerEvent<HTMLDivElement>) => void;
    onPointerLeave: () => void;
    onContextMenu: (event: React.MouseEvent<HTMLDivElement>) => void;
  };
}

/** Tools that build a shape preview and commit it on release. */
const SHAPE_TOOLS: readonly ToolType[] = ['line', 'rectangle', 'circle'];

/** Throttle for hover-coordinate state updates (ms). */
const HOVER_THROTTLE_MS = 60;

/** Guard for shape previews that would draw an absurd number of cells. */
const MAX_PREVIEW_CELLS = 24000;

function createEmptyStroke(): StrokeState {
  return {
    kind: 'none',
    pointerId: -1,
    layerId: '',
    staging: null,
    actionName: '',
    lastPoint: { x: 0, y: 0 },
    anchor: { x: 0, y: 0 },
    current: { x: 0, y: 0 },
    color: 0,
    filled: false,
    paintedCount: 0,
    lastClient: { x: 0, y: 0 },
  };
}

/**
 * Wires the pointer/touch engine to a canvas box.
 *
 * @param params Rendering callbacks owned by the viewport component.
 */
export function useCanvasInteraction(params: CanvasInteractionParams): CanvasInteractionApi {
  const {
    containerRef,
    overlayCanvasRef,
    paintDocument,
    paintBaseDocument,
    compositeWithPreview,
    sampleCompositePixel,
    commitSelectionMove,
  } = params;

  const selectedTool = useEditorStore((state) => state.selectedTool);
  const viewportZoom = useEditorStore((state) => state.viewport.zoom);
  const viewportPanX = useEditorStore((state) => state.viewport.panX);
  const viewportPanY = useEditorStore((state) => state.viewport.panY);
  const selection = useEditorStore((state) => state.selection);
  const symmetryMode = useEditorStore((state) => state.symmetryMode);
  const symmetryGuidesVisible = useEditorStore((state) => state.symmetryGuidesVisible);
  const brushSize = useEditorStore((state) => state.brushSize);
  const settings = useEditorStore((state) => state.settings);
  const projectWidth = useEditorStore((state) => state.currentProject.width);
  const projectHeight = useEditorStore((state) => state.currentProject.height);

  const strokeRef = useRef<StrokeState>(createEmptyStroke());
  const gestureRef = useRef<GestureState>({
    active: false,
    startDistance: 0,
    startZoom: 1,
    startMidpoint: { x: 0, y: 0 },
    anchorGrid: null,
  });
  /** Live pointers, keyed by id, in client coordinates (pinch + pan maths). */
  const pointersRef = useRef<Map<number, { clientX: number; clientY: number }>>(new Map());
  const spaceHeldRef = useRef(false);
  const hoverRef = useRef<Point | null>(null);
  const lastHoverPublishRef = useRef(0);
  const wheelDeltaAccumulatorRef = useRef(0);

  const [isDrawing, setIsDrawing] = useState(false);
  const [isPanning, setIsPanning] = useState(false);
  const [hoverPixel, setHoverPixel] = useState<Point | null>(null);
  const [warningMessage, setWarningMessage] = useState<string | null>(null);

  const dimensions: Dimensions = { width: projectWidth, height: projectHeight };

  /* ------------------------------------------------------------------ *
   * Geometry helpers
   * ------------------------------------------------------------------ */

  const getContainerRect = useCallback((): DOMRect | null => {
    return containerRef.current?.getBoundingClientRect() ?? null;
  }, [containerRef]);

  /** Grid point under a client position, unclamped. */
  const toGridPoint = useCallback(
    (clientX: number, clientY: number): Point | null => {
      const rect = getContainerRect();

      if (!rect) {
        return null;
      }

      const state = editorStore.getState();

      return projectScreenToGrid(
        { x: clientX, y: clientY },
        rect,
        state.viewport,
        { width: state.currentProject.width, height: state.currentProject.height },
      );
    },
    [getContainerRect],
  );

  /* ------------------------------------------------------------------ *
   * Overlay painting (screen space)
   * ------------------------------------------------------------------ */

  const paintOverlay = useCallback((): void => {
    const canvas = overlayCanvasRef.current;
    const context = canvas?.getContext('2d');
    const rect = getContainerRect();

    if (!canvas || !context || !rect) {
      return;
    }

    const dpr = window.devicePixelRatio || 1;

    context.setTransform(1, 0, 0, 1, 0, 0);
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.scale(dpr, dpr);

    const state = editorStore.getState();
    const { viewport, currentProject, symmetryMode: mode, symmetryGuidesVisible: showGuides } = state;
    const zoom = viewport.zoom;

    // Local container-space origin of grid cell (0,0).
    const screenOrigin = projectCanvasToScreen({ x: 0, y: 0 }, rect, viewport, {
      width: currentProject.width,
      height: currentProject.height,
    });
    const origin = {
      x: screenOrigin.x - rect.left,
      y: screenOrigin.y - rect.top,
    };

    const cellRect = (point: Point): { x: number; y: number; size: number } => ({
      x: origin.x + point.x * zoom,
      y: origin.y + point.y * zoom,
      size: zoom,
    });

    /* Symmetry guides ------------------------------------------------- */
    if (mode !== 'none' && showGuides) {
      context.save();
      context.setLineDash([6, 4]);
      context.lineWidth = 1;
      context.strokeStyle = 'rgba(0, 229, 255, 0.75)';

      if (mode === 'vertical' || mode === 'both') {
        const axisX = origin.x + (currentProject.width / 2) * zoom;
        context.beginPath();
        context.moveTo(axisX, origin.y);
        context.lineTo(axisX, origin.y + currentProject.height * zoom);
        context.stroke();
      }

      if (mode === 'horizontal' || mode === 'both') {
        const axisY = origin.y + (currentProject.height / 2) * zoom;
        context.beginPath();
        context.moveTo(origin.x, axisY);
        context.lineTo(origin.x + currentProject.width * zoom, axisY);
        context.stroke();
      }

      context.restore();
    }

    const stroke = strokeRef.current;

    /* Shape preview --------------------------------------------------- */
    if (stroke.kind === 'shape' && stroke.staging !== null) {
      const rawPoints = getShapePoints(
        state.selectedTool,
        stroke.anchor,
        stroke.current,
        stroke.filled,
      );
      const previewPoints = expandSymmetricStroke(
        rawPoints,
        state.symmetryMode,
        dimensions,
      );

      if (previewPoints.length <= MAX_PREVIEW_CELLS) {
        context.save();
        context.globalAlpha = 0.85;
        context.fillStyle = 'rgba(0, 255, 102, 0.55)';

        for (const point of previewPoints) {
          const cell = cellRect(point);
          context.fillRect(cell.x, cell.y, cell.size, cell.size);
        }

        context.restore();
      }
    }

    /* Floating selection preview -------------------------------------- */
    if (
      stroke.kind === 'move-selection' &&
      selection.selectedPixels.length > 0
    ) {
      const deltaX = stroke.current.x - stroke.anchor.x;
      const deltaY = stroke.current.y - stroke.anchor.y;

      context.save();

      for (const tuple of selection.selectedPixels) {
        const sourcePoint = {
          x: tuple.index % currentProject.width,
          y: Math.floor(tuple.index / currentProject.width),
        };

        const target = { x: sourcePoint.x + deltaX, y: sourcePoint.y + deltaY };
        const cell = cellRect(target);

        const rgba: PixelRgba = {
          r: (tuple.color >>> 0) & 0xff,
          g: (tuple.color >>> 8) & 0xff,
          b: (tuple.color >>> 16) & 0xff,
          a: (tuple.color >>> 24) & 0xff,
        };

        context.fillStyle = rgbaToCssString(rgba);
        context.fillRect(cell.x, cell.y, cell.size, cell.size);
      }

      context.restore();
    }

    /* Hover cursor ---------------------------------------------------- */
    const hover = hoverRef.current;

    if (hover !== null && stroke.kind === 'none' && state.selectedTool !== 'pan') {
      const brush = Math.max(1, state.brushSize);
      const offset = brush % 2 === 1 ? -Math.floor(brush / 2) : -(brush / 2 - 1);
      const cell = cellRect({ x: hover.x + offset, y: hover.y + offset });

      context.save();
      context.lineWidth = 1;
      context.strokeStyle = 'rgba(255, 255, 255, 0.9)';
      context.strokeRect(
        Math.round(cell.x) + 0.5,
        Math.round(cell.y) + 0.5,
        Math.max(1, brush * zoom - 1),
        Math.max(1, brush * zoom - 1),
      );
      context.strokeStyle = 'rgba(0, 0, 0, 0.9)';
      context.strokeRect(
        Math.round(cell.x) - 0.5,
        Math.round(cell.y) - 0.5,
        Math.max(1, brush * zoom + 1),
        Math.max(1, brush * zoom + 1),
      );
      context.restore();
    }
  }, [getContainerRect, overlayCanvasRef, selection.selectedPixels]);

  const repaintOverlay = useCallback((): void => {
    paintOverlay();
  }, [paintOverlay]);

  /* ------------------------------------------------------------------ *
   * Stroke lifecycle
   * ------------------------------------------------------------------ */

  /** Discards the staging buffer without committing a single pixel. */
  const discardStroke = useCallback((): void => {
    const stroke = strokeRef.current;

    if (stroke.kind === 'none') {
      return;
    }

    strokeRef.current = createEmptyStroke();
    setIsDrawing(false);
    setIsPanning(false);

    // Repaint from the committed state so the discarded preview disappears.
    paintBaseDocument();
  }, [paintBaseDocument]);

  const commitStroke = useCallback((): void => {
    const stroke = strokeRef.current;
    const state = editorStore.getState();

    if (stroke.kind === 'none') {
      return;
    }

    if (stroke.kind === 'freehand' && stroke.staging !== null && stroke.paintedCount > 0) {
      const committed = editorStore.commitLayerBuffer({
        layerId: stroke.layerId,
        data: stroke.staging,
        actionName: stroke.actionName,
      });

      if (!committed) {
        setWarningMessage('That layer is locked, so the stroke was not applied.');
      }
    }

    if (stroke.kind === 'shape' && stroke.staging !== null) {
      const rawPoints = getShapePoints(
        state.selectedTool,
        stroke.anchor,
        stroke.current,
        stroke.filled,
      );
      const points = expandSymmetricStroke(
        rawPoints,
        state.symmetryMode,
        dimensions,
      );

      const written = writePointsIntoStaging(stroke.staging, points, stroke.color, dimensions);

      if (written > 0) {
        editorStore.commitLayerBuffer({
          layerId: stroke.layerId,
          data: stroke.staging,
          actionName: stroke.actionName,
        });
      }
    }

    if (stroke.kind === 'marquee') {
      const layer = state.layers.find((entry) => entry.id === state.activeLayerId);
      const selectionRect = normalizeSelectionRect(stroke.anchor, stroke.current);

      const selectedPixels = layer
        ? collectSelectionPixels(layer.data, dimensions, selectionRect)
        : [];

      editorStore.setSelection({
        active: selectedPixels.length > 0,
        origin: selectionRect.origin,
        current: selectionRect.current,
        selectedPixels,
        floating: false,
      });

      if (selectedPixels.length > 0) {
        retroAudioEngine.playToolSelect();
      }
    }

    if (stroke.kind === 'move-selection') {
      const delta = {
        x: stroke.current.x - stroke.anchor.x,
        y: stroke.current.y - stroke.anchor.y,
      };

      if (delta.x !== 0 || delta.y !== 0) {
        const moved = commitSelectionMove(delta);

        if (!moved) {
          setWarningMessage('The selection could not be moved.');
        }
      }
    }

    strokeRef.current = createEmptyStroke();
    setIsDrawing(false);
    setIsPanning(false);
    paintOverlay();
  }, [commitSelectionMove, dimensions, paintOverlay]);

  /* ------------------------------------------------------------------ *
   * Immediate tool actions (no stroke)
   * ------------------------------------------------------------------ */

  const runImmediateTool = useCallback(
    (tool: ToolType, gridPoint: Point | null, secondary: boolean): ToolOutcome => {
      const state = editorStore.getState();

      if (tool === 'eyedropper') {
        if (gridPoint === null) {
          return { handled: true, message: null };
        }

        const sampled = sampleCompositePixel(gridPoint);

        if (sampled === null || sampled.a === 0) {
          return { handled: true, message: 'That pixel is fully transparent.' };
        }

        const hex = `#${[sampled.r, sampled.g, sampled.b]
          .map((channel) => channel.toString(16).padStart(2, '0'))
          .join('')}`;

        if (secondary) {
          editorStore.setSecondaryColor(hex);
        } else {
          editorStore.setPrimaryColor(hex);
        }

        retroAudioEngine.playToolSelect();

        return { handled: true, message: null };
      }

      if (tool === 'bucket') {
        if (gridPoint === null) {
          return { handled: true, message: null };
        }

        const layer = state.layers.find((entry) => entry.id === state.activeLayerId);

        if (!layer) {
          return { handled: true, message: 'No active layer to fill.' };
        }

        if (layer.locked) {
          return { handled: true, message: `"${layer.name}" is locked, so it cannot be filled.` };
        }

        const targetColor = hexToUint32(secondary ? state.secondaryColor : state.primaryColor);

        const result = executeFloodFill(
          layer.data,
          state.currentProject.width,
          state.currentProject.height,
          gridPoint,
          targetColor,
        );

        if (result.changedCoordinates.length === 0) {
          return { handled: true, message: null };
        }

        editorStore.commitLayerBuffer({
          layerId: layer.id,
          data: result.modifiedBuffer,
          actionName: 'Fill',
        });

        retroAudioEngine.playActionSuccess();

        return { handled: true, message: null };
      }

      return { handled: false, message: null };
    },
    [sampleCompositePixel],
  );

  /* ------------------------------------------------------------------ *
   * Pointer handlers
   * ------------------------------------------------------------------ */

  const handlePointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>): void => {
      const container = containerRef.current;

      if (!container) {
        return;
      }

      pointersRef.current.set(event.pointerId, {
        clientX: event.clientX,
        clientY: event.clientY,
      });

      // Gesture preemption (plan §4.2): a second touch point immediately
      // discards the pending single-pointer stroke and switches to pan/pinch.
      if (pointersRef.current.size >= 2) {
        discardStroke();
        strokeRef.current = createEmptyStroke();

        const points = Array.from(pointersRef.current.values());
        const state = editorStore.getState();

        gestureRef.current = {
          active: true,
          startDistance: Math.max(1, getTouchDistance(points[0], points[1])),
          startZoom: state.viewport.zoom,
          startMidpoint: getTouchMidpoint(points[0], points[1]),
          anchorGrid: toGridPoint(
            (points[0].clientX + points[1].clientX) / 2,
            (points[0].clientY + points[1].clientY) / 2,
          ),
        };

        setIsPanning(true);
        return;
      }

      try {
        container.setPointerCapture(event.pointerId);
      } catch {
        // Pointer capture is best-effort; the window listeners cover the rest.
      }

      const state = editorStore.getState();
      const tool = state.selectedTool;
      const gridPoint = toGridPoint(event.clientX, event.clientY);
      const secondary = event.button === 2;
      const wantsPan =
        spaceHeldRef.current || tool === 'pan' || event.button === 1;

      if (wantsPan) {
        strokeRef.current = {
          ...createEmptyStroke(),
          kind: 'pan',
          pointerId: event.pointerId,
          lastClient: { x: event.clientX, y: event.clientY },
        };

        setIsPanning(true);
        return;
      }

      const immediate = runImmediateTool(tool, gridPoint, secondary);

      if (immediate.handled) {
        setWarningMessage(immediate.message);
        return;
      }

      if (gridPoint === null) {
        // Started outside the artboard: nothing to do until the pointer enters.
        return;
      }

      const layer = state.layers.find((entry) => entry.id === state.activeLayerId);

      if (!layer) {
        setWarningMessage('No active layer. Add a layer before drawing.');
        return;
      }

      if (layer.locked) {
        setWarningMessage(`"${layer.name}" is locked. Unlock it to draw.`);
        retroAudioEngine.playErrorBuzz();
        return;
      }

      setWarningMessage(null);

      const color = hexToUint32(secondary ? state.secondaryColor : state.primaryColor);

      if (tool === 'select') {
        const selectionContainsPoint =
          state.selection.active &&
          state.selection.selectedPixels.length > 0 &&
          isPointInsideSelection(state.selection.selectedPixels, dimensions, gridPoint);

        strokeRef.current = {
          ...createEmptyStroke(),
          kind: selectionContainsPoint ? 'move-selection' : 'marquee',
          pointerId: event.pointerId,
          layerId: layer.id,
          anchor: gridPoint,
          current: gridPoint,
          lastPoint: gridPoint,
          lastClient: { x: event.clientX, y: event.clientY },
        };

        if (!selectionContainsPoint) {
          // Live marquee feedback: origin/current drive the DOM marquee while the
          // pixel tuples are only resolved on release.
          editorStore.setSelection({
            active: true,
            origin: gridPoint,
            current: gridPoint,
            selectedPixels: [],
            floating: false,
          });
        }

        setIsDrawing(true);
        return;
      }

      const isShape = SHAPE_TOOLS.includes(tool);

      strokeRef.current = {
        ...createEmptyStroke(),
        kind: isShape ? 'shape' : 'freehand',
        pointerId: event.pointerId,
        layerId: layer.id,
        // Staging clone: the committed layer buffer is never mutated.
        staging: new Uint32Array(layer.data),
        actionName: TOOL_ACTION_NAMES[tool] ?? 'Draw',
        anchor: gridPoint,
        current: gridPoint,
        lastPoint: gridPoint,
        color,
        filled: event.shiftKey,
        lastClient: { x: event.clientX, y: event.clientY },
      };

      setIsDrawing(true);
      retroAudioEngine.playPixelBlip();

      if (!isShape) {
        // Paint the first dab immediately so a tap leaves a pixel.
        const state2 = editorStore.getState();
        const targetColor = tool === 'eraser' ? 0 : color;

        const dabPoints = expandSymmetricStroke([gridPoint], state2.symmetryMode, dimensions);

        strokeRef.current.paintedCount = writePointsIntoStaging(
          strokeRef.current.staging as Uint32Array,
          stampLineWithBrush(dabPoints, state2.brushSize, brushAnchorFor(state2.settings.pixelSnap)),
          targetColor,
          dimensions,
        );

        paintDocument(
          compositeWithPreview(layer.id, strokeRef.current.staging as Uint32Array),
        );
      }
    },
    [
      containerRef,
      dimensions,
      discardStroke,
      paintDocument,
      compositeWithPreview,
      runImmediateTool,
      toGridPoint,
    ],
  );

  const handlePointerMove = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>): void => {
      pointersRef.current.set(event.pointerId, {
        clientX: event.clientX,
        clientY: event.clientY,
      });

      const gesture = gestureRef.current;

      /* Two-finger pan + pinch zoom ---------------------------------- */
      if (gesture.active && pointersRef.current.size >= 2) {
        const points = Array.from(pointersRef.current.values());
        const distance = Math.max(1, getTouchDistance(points[0], points[1]));
        const midpoint = getTouchMidpoint(points[0], points[1]);

        const rect = getContainerRect();

        if (rect) {
          const nextZoom = clampZoom(gesture.startZoom * (distance / gesture.startDistance));

          // `anchorGrid` was the grid point under the gesture's start midpoint, so
          // pinning it to the CURRENT midpoint both zooms about the pinch centre
          // and pans by the midpoint delta in one step. Using the live midpoint
          // avoids re-projecting through a viewport that is itself changing.
          const pan = getPanForZoomAnchor(
            gesture.anchorGrid ?? { x: 0, y: 0 },
            midpoint,
            rect,
            nextZoom,
            dimensions,
          );

          editorStore.setViewport({ zoom: nextZoom, panX: pan.panX, panY: pan.panY });
        }

        return;
      }

      const stroke = strokeRef.current;
      const state = editorStore.getState();

      if (stroke.kind === 'none') {
        /* Hover tracking -------------------------------------------- */
        const hover = toGridPoint(event.clientX, event.clientY);
        const insideArtboard =
          hover !== null &&
          hover.x >= 0 &&
          hover.y >= 0 &&
          hover.x < dimensions.width &&
          hover.y < dimensions.height;

        hoverRef.current = insideArtboard ? hover : null;
        paintOverlay();

        const now = performance.now();

        if (now - lastHoverPublishRef.current > HOVER_THROTTLE_MS) {
          lastHoverPublishRef.current = now;
          setHoverPixel(insideArtboard ? hover : null);
        }

        return;
      }

      if (stroke.kind === 'pan') {
        // Incremental + clamped, so the artboard can never be dragged fully
        // off-screen no matter how far the pointer travels.
        editorStore.panBy(
          event.clientX - stroke.lastClient.x,
          event.clientY - stroke.lastClient.y,
        );

        stroke.lastClient = { x: event.clientX, y: event.clientY };

        return;
      }

      const gridPoint = toGridPoint(event.clientX, event.clientY);

      if (gridPoint === null) {
        return;
      }

      if (stroke.kind === 'freehand') {
        if (stroke.staging === null) {
          return;
        }

        const segment = getBresenhamLine(stroke.lastPoint, gridPoint);
        const mirrored = expandSymmetricStroke(segment, state.symmetryMode, dimensions);
        const brushed = stampLineWithBrush(
          mirrored,
          state.brushSize,
          brushAnchorFor(state.settings.pixelSnap),
        );
        const color = state.selectedTool === 'eraser' ? 0 : stroke.color;

        stroke.paintedCount += writePointsIntoStaging(
          stroke.staging,
          brushed,
          color,
          dimensions,
        );

        stroke.lastPoint = gridPoint;
        stroke.current = gridPoint;

        paintDocument(compositeWithPreview(stroke.layerId, stroke.staging));

        return;
      }

      if (stroke.kind === 'shape') {
        stroke.current = gridPoint;
        paintOverlay();
        return;
      }

      if (stroke.kind === 'marquee') {
        stroke.current = gridPoint;

        editorStore.setSelection({
          active: true,
          origin: stroke.anchor,
          current: gridPoint,
          selectedPixels: [],
          floating: false,
        });

        return;
      }

      if (stroke.kind === 'move-selection') {
        stroke.current = gridPoint;
        paintOverlay();
      }
    },
    [
      compositeWithPreview,
      dimensions,
      getContainerRect,
      paintDocument,
      paintOverlay,
      toGridPoint,
    ],
  );

  const endPointer = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>): void => {
      pointersRef.current.delete(event.pointerId);

      const gesture = gestureRef.current;

      if (gesture.active) {
        if (pointersRef.current.size < 2) {
          // Leaving pinch mode never resumes the cancelled stroke; the user must
          // start a fresh pointerdown.
          gestureRef.current = {
            active: false,
            startDistance: 0,
            startZoom: 1,
            startMidpoint: { x: 0, y: 0 },
            anchorGrid: null,
          };
          setIsPanning(false);
        }

        return;
      }

      const stroke = strokeRef.current;

      if (stroke.kind === 'none' || stroke.pointerId !== event.pointerId) {
        return;
      }

      if (stroke.kind === 'pan') {
        strokeRef.current = createEmptyStroke();
        setIsPanning(false);
        return;
      }

      commitStroke();
    },
    [commitStroke],
  );

  const handlePointerLeave = useCallback((): void => {
    hoverRef.current = null;
    setHoverPixel(null);
    paintOverlay();
  }, [paintOverlay]);

  const handleContextMenu = useCallback((event: ReactMouseEvent<HTMLDivElement>): void => {
    // Right-drag draws with the secondary colour; suppress the browser menu.
    event.preventDefault();
  }, []);

  /* ------------------------------------------------------------------ *
   * Wheel zoom / pan (native, non-passive so preventDefault works)
   * ------------------------------------------------------------------ */

  useEffect(() => {
    const container = containerRef.current;

    if (!container) {
      return;
    }

    const handleWheel = (event: WheelEvent): void => {
      event.preventDefault();

      const state = editorStore.getState();
      const rect = container.getBoundingClientRect();

      if (event.ctrlKey || event.metaKey) {
        wheelDeltaAccumulatorRef.current += event.deltaY;
        const ZOOM_WHEEL_THRESHOLD = 50;

        if (Math.abs(wheelDeltaAccumulatorRef.current) < ZOOM_WHEEL_THRESHOLD) {
          return;
        }

        const direction = wheelDeltaAccumulatorRef.current < 0 ? 1 : -1;
        wheelDeltaAccumulatorRef.current = 0;

        const anchorGrid = projectScreenToGrid(
          { x: event.clientX, y: event.clientY },
          rect,
          state.viewport,
          { width: state.currentProject.width, height: state.currentProject.height },
        );

        const nextZoom = getSteppedZoom(state.viewport.zoom, direction);
        const pan = getPanForZoomAnchor(
          anchorGrid,
          { x: event.clientX, y: event.clientY },
          rect,
          nextZoom,
          { width: state.currentProject.width, height: state.currentProject.height },
        );

        editorStore.setViewport({ zoom: nextZoom, panX: pan.panX, panY: pan.panY });
        return;
      }

      editorStore.panBy(-event.deltaX, -event.deltaY);
    };

    container.addEventListener('wheel', handleWheel, { passive: false });

    return () => {
      container.removeEventListener('wheel', handleWheel);
    };
  }, [containerRef]);

  /* ------------------------------------------------------------------ *
   * Space-bar pan modifier
   * ------------------------------------------------------------------ */

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.code === 'Space' && !isTextEntryTarget(event.target)) {
        spaceHeldRef.current = true;
      }
    };

    const handleKeyUp = (event: KeyboardEvent): void => {
      if (event.code === 'Space') {
        spaceHeldRef.current = false;
      }
    };

    const handleBlur = (): void => {
      spaceHeldRef.current = false;
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('blur', handleBlur);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('blur', handleBlur);
    };
  }, []);

  /* ------------------------------------------------------------------ *
   * Cursor + overlay repaint on state change
   * ------------------------------------------------------------------ */

  useEffect(() => {
    const container = containerRef.current;

    if (!container) {
      return;
    }

    if (isPanning) {
      container.style.cursor = 'grabbing';
      return;
    }

    container.style.cursor = getToolDefinition(selectedTool).cursor;
  }, [containerRef, isPanning, selectedTool]);

  useEffect(() => {
    paintOverlay();
  }, [
    paintOverlay,
    viewportZoom,
    viewportPanX,
    viewportPanY,
    symmetryMode,
    symmetryGuidesVisible,
    settings.gridVisible,
    brushSize,
    selection.selectedPixels,
    projectWidth,
    projectHeight,
  ]);

  const paintOverlayRef = useRef(paintOverlay);
  paintOverlayRef.current = paintOverlay;

  /* Overlay canvas sizing: backing store follows the box size and DPR. */
  useEffect(() => {
    const container = containerRef.current;
    const canvas = overlayCanvasRef.current;

    if (!container || !canvas) {
      return;
    }

    const resize = (): void => {
      const rect = container.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;

      const nextWidth = Math.max(1, Math.round(rect.width * dpr));
      const nextHeight = Math.max(1, Math.round(rect.height * dpr));

      if (canvas.width !== nextWidth || canvas.height !== nextHeight) {
        canvas.width = nextWidth;
        canvas.height = nextHeight;
      }

      editorStore.setViewportSize({
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      });

      paintOverlayRef.current();
    };

    resize();

    const observer = new ResizeObserver(resize);
    observer.observe(container);

    return () => {
      observer.disconnect();
    };
  }, [containerRef, overlayCanvasRef]);

  return {
    isDrawing,
    isPanning,
    hoverPixel,
    warningMessage,
    clearWarning: useCallback(() => {
      setWarningMessage(null);
    }, []),
    repaintOverlay,
    handlers: {
      onPointerDown: handlePointerDown,
      onPointerMove: handlePointerMove,
      onPointerUp: endPointer,
      onPointerCancel: endPointer,
      onPointerLeave: handlePointerLeave,
      onContextMenu: handleContextMenu,
    },
  };
}

/* ------------------------------------------------------------------ *
 * Pure helpers
 * ------------------------------------------------------------------ */

/** Human-readable history labels per tool. */
const TOOL_ACTION_NAMES: Partial<Record<ToolType, string>> = {
  pencil: 'Pencil',
  eraser: 'Eraser',
  line: 'Line',
  rectangle: 'Rectangle',
  circle: 'Circle',
};

/** True when the event target is a text field (so Space must not pan). */
function isTextEntryTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  const tag = target.tagName.toLowerCase();

  return tag === 'input' || tag === 'textarea' || target.isContentEditable;
}

/**
 * Maps the pixel-snap preference onto a brush anchoring strategy.
 *
 * Snap ON centres the footprint on the cursor pixel (classic pixel-art feel);
 * snap OFF grows it right/down so even diameters are predictable.
 */
function brushAnchorFor(pixelSnap: boolean): BrushAnchor {
  return pixelSnap ? 'center' : 'cursor';
}

/** Rasterises the preview/commit points for the active shape tool. */
function getShapePoints(
  tool: ToolType,
  anchor: Point,
  current: Point,
  filled: boolean,
): Point[] {
  switch (tool) {
    case 'line':
      return getBresenhamLine(anchor, current);
    case 'rectangle':
      return getRasterRectangle(anchor, current, filled);
    case 'circle':
      return getRasterCircle(anchor, getDragRadius(anchor, current), filled);
    default:
      return [];
  }
}

/** Writes points into a staging buffer, clipping to the document. */
function writePointsIntoStaging(
  staging: Uint32Array,
  points: readonly Point[],
  color: number,
  dimensions: Dimensions,
): number {
  let written = 0;

  for (const point of points) {
    if (
      point.x < 0 ||
      point.y < 0 ||
      point.x >= dimensions.width ||
      point.y >= dimensions.height
    ) {
      continue;
    }

    staging[point.y * dimensions.width + point.x] = color;
    written += 1;
  }

  return written;
}

/** Normalises two marquee corners into an inclusive, document-clamped rect. */
function normalizeSelectionRect(
  anchor: Point,
  current: Point,
): { origin: Point; current: Point; minX: number; minY: number; maxX: number; maxY: number } {
  const minX = Math.min(anchor.x, current.x);
  const minY = Math.min(anchor.y, current.y);
  const maxX = Math.max(anchor.x, current.x);
  const maxY = Math.max(anchor.y, current.y);

  return {
    origin: { x: minX, y: minY },
    current: { x: maxX, y: maxY },
    minX,
    minY,
    maxX,
    maxY,
  };
}

/** Collects the layer pixels inside a selection rectangle. */
function collectSelectionPixels(
  layerData: Uint32Array,
  dimensions: Dimensions,
  rect: { minX: number; minY: number; maxX: number; maxY: number },
): { index: number; color: number }[] {
  const pixels: { index: number; color: number }[] = [];

  for (let y = rect.minY; y <= rect.maxY; y += 1) {
    if (y < 0 || y >= dimensions.height) {
      continue;
    }

    for (let x = rect.minX; x <= rect.maxX; x += 1) {
      if (x < 0 || x >= dimensions.width) {
        continue;
      }

      const index = y * dimensions.width + x;

      pixels.push({ index, color: layerData[index] });
    }
  }

  return pixels;
}

/** True when the grid point falls inside the selection's bounding box. */
function isPointInsideSelection(
  selectedPixels: readonly { index: number; color: number }[],
  dimensions: Dimensions,
  point: Point,
): boolean {
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  for (const tuple of selectedPixels) {
    const x = tuple.index % dimensions.width;
    const y = Math.floor(tuple.index / dimensions.width);

    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }

  return point.x >= minX && point.x <= maxX && point.y >= minY && point.y <= maxY;
}
