/**
 * Editor store — the single source of truth for the document.
 *
 * IMMUTABILITY CONTRACT
 * Every mutation produces new objects: a new `PixelLayer`, a new `layers` array,
 * and — for pixel writes — a new `Uint32Array`. `PixelLayer.data` is frozen once
 * a layer is in the store, so strokes paint into a *staging* clone which is
 * handed to `commitLayerBuffer` on pointerup. History keeps previous buffers by
 * reference, which is safe precisely because buffers are never mutated in place.
 *
 * PERSISTENCE CONTRACT
 * `documentRevision` increments only on changes that must reach IndexedDB.
 * Session-only preferences (grid, scanlines, sound, symmetry guides) do not bump
 * it, which keeps autosave off the pointermove path and stops a view toggle from
 * marking the project dirty.
 */

import type {
  BlendMode,
  CanvasEditorState,
  CanvasHistoryRecord,
  ColorPalette,
  Dimensions,
  PixelLayer,
  Point,
  ProjectMetadata,
  ProjectSettings,
  SelectionPixelTuple,
  SelectionState,
  SymmetryMode,
  ToolType,
  ViewportTransform,
} from '../types';
import { createStore, useStoreSelector } from './createStore';
import type { Store } from './createStore';
import type { ParsedHexList } from '../utils/color/presetPalettes';
import { createCustomPalette, DEFAULT_PALETTE_ID } from '../utils/color/presetPalettes';
import { normalizeHexColor } from '../utils/color/colorConvert';
import { createEntityId } from '../utils/id/createEntityId';
import { createEmptyLayerBuffer, mergeLayerBuffers } from '../utils/algorithms/compositor';
import {
  clampPan,
  clampZoom,
  getFitZoom,
  getSteppedZoom,
  MAX_ZOOM,
  MIN_ZOOM,
} from '../utils/viewport';

/** Maximum number of undo steps retained (plan.md §Phase 4). */
export const HISTORY_LIMIT = 50;

/** Maximum number of layers a project may hold. */
export const MAX_LAYERS = 12;

/** Size of a brand new session document. */
const DEFAULT_DOCUMENT_WIDTH = 32;
const DEFAULT_DOCUMENT_HEIGHT = 32;

/** Circular history buffer state. */
export interface HistoryState {
  /** Chronological records. `records[index - 1]` is the last applied step. */
  records: CanvasHistoryRecord[];
  /** Number of applied records; everything at or after this index is redoable. */
  index: number;
  /** Capacity of the buffer. */
  limit: number;
}

/** Complete editor state: the plan's `CanvasEditorState` plus engine bookkeeping. */
export interface EditorState extends CanvasEditorState {
  history: HistoryState;
  /** Bumped by every change that must be persisted. */
  documentRevision: number;
  /** Highest revision already written to IndexedDB. `-1` = never saved. */
  savedRevision: number;
  /** Canvas box size in CSS pixels, maintained by the viewport's ResizeObserver. */
  viewportSize: Dimensions;
  /** Session-only: draw the mirror guides while symmetry is active. */
  symmetryGuidesVisible: boolean;
  /** False until a project has been loaded or created. */
  isHydrated: boolean;
}

/** Options for creating a blank project. */
export interface NewProjectOptions {
  title: string;
  width: number;
  height: number;
  /** Base layer fill, or `null` for a fully transparent base layer. */
  backgroundHex: string | null;
  fps?: number;
}

/** Default session preferences. */
export function createDefaultSettings(): ProjectSettings {
  return {
    gridVisible: false,
    gridColor: '#3b3f56',
    scanlinesEnabled: true,
    soundEffectsEnabled: true,
    pixelSnap: true,
    backgroundPattern: 'checker',
  };
}

/** Default (empty) selection. */
export function createEmptySelection(): SelectionState {
  return {
    active: false,
    origin: null,
    current: null,
    selectedPixels: [],
    floating: false,
  };
}

/** Normalises a hex string straight into the canonical packed representation. */
function normalizeHexToPacked(hex: string): number {
  const normalized = normalizeHexColor(hex);
  const body = normalized.replace('#', '');
  const hasAlpha = body.length === 8;

  const r = parseInt(body.slice(0, 2), 16);
  const g = parseInt(body.slice(2, 4), 16);
  const b = parseInt(body.slice(4, 6), 16);
  const a = hasAlpha ? parseInt(body.slice(6, 8), 16) : 255;

  return ((a & 0xff) << 24) | ((b & 0xff) << 16) | ((g & 0xff) << 8) | (r & 0xff);
}

/**
 * Builds a project record plus its base layer.
 *
 * @returns The project metadata and a one-element layer array (order 0), so a
 * new document always satisfies the "at least one layer" invariant.
 */
export function createProjectWithLayers(options: NewProjectOptions): {
  project: ProjectMetadata;
  layers: PixelLayer[];
} {
  const now = Date.now();
  const projectId = createEntityId();
  const width = Math.max(1, Math.floor(options.width));
  const height = Math.max(1, Math.floor(options.height));

  const data = createEmptyLayerBuffer(width, height);

  if (options.backgroundHex !== null) {
    // One packed value for every pixel: `fill` is both correct and allocation-free.
    data.fill(normalizeHexToPacked(options.backgroundHex));
  }

  const baseLayer: PixelLayer = {
    id: createEntityId(),
    projectId,
    name: 'Base',
    order: 0,
    visible: true,
    locked: false,
    opacity: 1,
    blendMode: 'source-over',
    data,
    createdAt: now,
    updatedAt: now,
  };

  return {
    project: {
      id: projectId,
      title: options.title.trim().length > 0 ? options.title.trim() : 'UNTITLED SPRITE',
      width,
      height,
      fps: options.fps !== undefined && options.fps > 0 ? options.fps : 8,
      createdAt: now,
      updatedAt: now,
      thumbnailUrl: null,
    },
    layers: [baseLayer],
  };
}

/** First-run state: a blank 32x32 sprite with one layer. */
export function createInitialEditorState(): EditorState {
  const { project, layers } = createProjectWithLayers({
    title: 'UNTITLED SPRITE',
    width: DEFAULT_DOCUMENT_WIDTH,
    height: DEFAULT_DOCUMENT_HEIGHT,
    backgroundHex: null,
  });

  return {
    currentProject: project,
    layers,
    activeLayerId: layers[0].id,
    selectedTool: 'pencil',
    primaryColor: '#00ff66',
    secondaryColor: '#ff007f',
    brushSize: 1,
    symmetryMode: 'none',
    viewport: { zoom: 8, panX: 0, panY: 0 },
    selection: createEmptySelection(),
    settings: createDefaultSettings(),
    activePaletteId: DEFAULT_PALETTE_ID,
    customPalettes: [],
    history: { records: [], index: 0, limit: HISTORY_LIMIT },
    documentRevision: 1,
    savedRevision: -1,
    viewportSize: { width: 800, height: 600 },
    symmetryGuidesVisible: true,
    isHydrated: false,
  };
}

/** Re-sorts layers by `order` and rewrites the sequence as 0..n-1. */
function renumberLayers(layers: readonly PixelLayer[]): PixelLayer[] {
  return [...layers]
    .sort((a, b) => a.order - b.order)
    .map((layer, index) =>
      layer.order === index ? layer : { ...layer, order: index, updatedAt: Date.now() },
    );
}

/** Returns the layer directly below `layerId`, or `null` when it is the bottom. */
function findLayerBelow(layers: readonly PixelLayer[], layerId: string): PixelLayer | null {
  const target = layers.find((layer) => layer.id === layerId);

  if (!target) {
    return null;
  }

  const below = layers
    .filter((layer) => layer.order < target.order)
    .sort((a, b) => b.order - a.order);

  return below[0] ?? null;
}

/** History records whose layer no longer exists can never be applied. */
function isRecordApplicable(state: EditorState, record: CanvasHistoryRecord): boolean {
  return state.layers.some((layer) => layer.id === record.layerId);
}

const baseStore = createStore<EditorState>(createInitialEditorState());

function getState(): EditorState {
  return baseStore.getState();
}

function setState(patch: Partial<EditorState>): void {
  baseStore.setState(patch);
}

/** Applies a patch, bumps the document revision and touches `updatedAt`. */
function setDocumentState(patch: Partial<EditorState>): void {
  const state = getState();

  baseStore.setState({
    ...patch,
    documentRevision: state.documentRevision + 1,
    currentProject: {
      ...(patch.currentProject ?? state.currentProject),
      updatedAt: Date.now(),
    },
  });
}

function updateLayer(layerId: string, updater: (layer: PixelLayer) => PixelLayer): boolean {
  const state = getState();
  const target = state.layers.find((layer) => layer.id === layerId);

  if (!target) {
    return false;
  }

  const updated = updater(target);

  setDocumentState({
    layers: state.layers.map((layer) => (layer.id === layerId ? updated : layer)),
  });

  return true;
}

function replaceLayerBuffer(layerId: string, data: Uint32Array): boolean {
  return updateLayer(layerId, (layer) => ({ ...layer, data, updatedAt: Date.now() }));
}

export interface EditorActions {
  /* Tools and colours */
  setTool: (tool: ToolType) => void;
  setPrimaryColor: (hex: string) => void;
  setSecondaryColor: (hex: string) => void;
  swapColors: () => void;
  resetColors: () => void;
  setBrushSize: (size: number) => void;
  setSymmetryMode: (mode: SymmetryMode) => void;
  setSymmetryGuidesVisible: (visible: boolean) => void;

  /* Viewport */
  setViewport: (patch: Partial<ViewportTransform>) => void;
  setViewportSize: (size: Dimensions) => void;
  panBy: (deltaX: number, deltaY: number) => void;
  zoomIn: () => void;
  zoomOut: () => void;
  setZoom: (zoom: number) => void;
  zoomToFit: () => void;
  resetZoom: () => void;

  /* Selection */
  setSelection: (selection: SelectionState) => void;
  floatSelection: () => void;
  clearSelection: () => void;

  /* Session-only preferences */
  setGridVisible: (visible: boolean) => void;
  setGridColor: (hex: string) => void;
  toggleScanlines: () => void;
  setBackgroundPattern: (pattern: ProjectSettings['backgroundPattern']) => void;
  setPixelSnap: (enabled: boolean) => void;
  setSoundEffectsEnabled: (enabled: boolean) => void;

  /* Palettes */
  setActivePaletteId: (paletteId: string) => void;
  addCustomPalette: (palette: ColorPalette) => void;
  createCustomPaletteFromHexList: (name: string, parsed: ParsedHexList) => ColorPalette | null;
  deleteCustomPalette: (paletteId: string) => void;
  addColorToActivePalette: (hex: string) => void;
  removeColorFromActivePalette: (colorId: string) => void;
  replaceActivePaletteColors: (paletteId: string, hexColors: readonly string[]) => void;

  /* Layers */
  setActiveLayerId: (layerId: string) => void;
  addLayer: () => string | null;
  duplicateLayer: (layerId: string) => string | null;
  mergeLayerDown: (layerId: string) => boolean;
  deleteLayer: (layerId: string) => boolean;
  reorderLayer: (layerId: string, newOrder: number) => boolean;
  renameLayer: (layerId: string, name: string) => void;
  setLayerVisible: (layerId: string, visible: boolean) => void;
  setLayerLocked: (layerId: string, locked: boolean) => void;
  /** Flips a layer's visibility; the layer-row cap is a toggle, not a setter. */
  toggleLayerVisible: (layerId: string) => void;
  /** Flips a layer's lock state. */
  toggleLayerLocked: (layerId: string) => void;
  setLayerOpacity: (layerId: string, opacity: number) => void;
  setLayerBlendMode: (layerId: string, blendMode: BlendMode) => void;

  /* Pixels */
  commitLayerBuffer: (params: {
    layerId: string;
    data: Uint32Array;
    actionName: string;
  }) => boolean;
  paintPoints: (params: {
    points: readonly Point[];
    colorUint32: number;
    actionName: string;
    layerId?: string;
  }) => boolean;
  applyPixelWrites: (params: {
    layerId: string;
    writes: readonly SelectionPixelTuple[];
    actionName: string;
  }) => boolean;

  /* History */
  undo: () => boolean;
  redo: () => boolean;
  clearHistory: () => void;

  /* Project lifecycle */
  loadProject: (project: ProjectMetadata, layers: readonly PixelLayer[]) => void;
  createNewProject: (options: NewProjectOptions) => void;
  setProjectTitle: (title: string) => void;
  setProjectFps: (fps: number) => void;
  /**
   * Stores the thumbnail produced by the save pipeline.
   *
   * Deliberately does NOT bump `documentRevision`: the thumbnail is derived from
   * the revision that was just persisted, so marking it dirty would schedule
   * another autosave and loop forever.
   */
  setStoredThumbnail: (thumbnailUrl: string | null) => void;
  markSaved: (revision: number) => void;
  /**
   * Forces the next autosave to write the current document.
   *
   * Used after importing a file: `loadProject` treats a freshly loaded document
   * as already persisted, which is correct for a record read out of IndexedDB but
   * wrong for a project that has never been stored.
   */
  markDocumentDirty: () => void;
  setHydrated: (hydrated: boolean) => void;
}

export type EditorStore = Store<EditorState> & EditorActions;

const actions: EditorActions = {
  /* ------------------------------ tools ------------------------------ */

  setTool: (tool) => {
    setState({ selectedTool: tool });
  },

  setPrimaryColor: (hex) => {
    setState({ primaryColor: normalizeHexColor(hex) });
  },

  setSecondaryColor: (hex) => {
    setState({ secondaryColor: normalizeHexColor(hex) });
  },

  swapColors: () => {
    const state = getState();
    setState({ primaryColor: state.secondaryColor, secondaryColor: state.primaryColor });
  },

  resetColors: () => {
    setState({ primaryColor: '#000000', secondaryColor: '#ffffff' });
  },

  setBrushSize: (size) => {
    setState({ brushSize: Math.min(32, Math.max(1, Math.round(size))) });
  },

  setSymmetryMode: (mode) => {
    setState({ symmetryMode: mode });
  },

  setSymmetryGuidesVisible: (visible) => {
    setState({ symmetryGuidesVisible: visible });
  },

  /* ---------------------------- viewport ----------------------------- */

  setViewport: (patch) => {
    const state = getState();
    setState({ viewport: { ...state.viewport, ...patch } });
  },

  setViewportSize: (size) => {
    const state = getState();

    if (state.viewportSize.width === size.width && state.viewportSize.height === size.height) {
      return;
    }

    const clamped = clampPan(
      { panX: state.viewport.panX, panY: state.viewport.panY },
      { width: state.currentProject.width, height: state.currentProject.height },
      size,
      state.viewport.zoom,
    );

    setState({
      viewportSize: size,
      viewport: { ...state.viewport, ...clamped },
    });
  },

  panBy: (deltaX, deltaY) => {
    const state = getState();

    const next = clampPan(
      { panX: state.viewport.panX + deltaX, panY: state.viewport.panY + deltaY },
      { width: state.currentProject.width, height: state.currentProject.height },
      state.viewportSize,
      state.viewport.zoom,
    );

    setState({ viewport: { ...state.viewport, ...next } });
  },

  zoomIn: () => {
    const state = getState();
    setState({ viewport: { ...state.viewport, zoom: getSteppedZoom(state.viewport.zoom, 1) } });
  },

  zoomOut: () => {
    const state = getState();
    setState({ viewport: { ...state.viewport, zoom: getSteppedZoom(state.viewport.zoom, -1) } });
  },

  setZoom: (zoom) => {
    const state = getState();
    setState({ viewport: { ...state.viewport, zoom: clampZoom(zoom) } });
  },

  zoomToFit: () => {
    const state = getState();

    const zoom = getFitZoom(
      { width: state.currentProject.width, height: state.currentProject.height },
      state.viewportSize,
    );

    setState({ viewport: { zoom, panX: 0, panY: 0 } });
  },

  resetZoom: () => {
    const state = getState();
    setState({ viewport: { ...state.viewport, zoom: 1, panX: 0, panY: 0 } });
  },

  /* ---------------------------- selection ---------------------------- */

  setSelection: (selection) => {
    setState({ selection });
  },

  floatSelection: () => {
    const state = getState();

    if (!state.selection.active) {
      return;
    }

    setState({ selection: { ...state.selection, floating: true } });
  },

  clearSelection: () => {
    setState({ selection: createEmptySelection() });
  },

  /* --------------------------- preferences --------------------------- */

  setGridVisible: (visible) => {
    const state = getState();
    setState({ settings: { ...state.settings, gridVisible: visible } });
  },

  setGridColor: (hex) => {
    const state = getState();
    setState({ settings: { ...state.settings, gridColor: normalizeHexColor(hex) } });
  },

  toggleScanlines: () => {
    const state = getState();
    setState({
      settings: { ...state.settings, scanlinesEnabled: !state.settings.scanlinesEnabled },
    });
  },

  setBackgroundPattern: (pattern) => {
    const state = getState();
    setState({ settings: { ...state.settings, backgroundPattern: pattern } });
  },

  setPixelSnap: (enabled) => {
    const state = getState();
    setState({ settings: { ...state.settings, pixelSnap: enabled } });
  },

  setSoundEffectsEnabled: (enabled) => {
    const state = getState();
    setState({ settings: { ...state.settings, soundEffectsEnabled: enabled } });
  },

  /* ----------------------------- palettes ---------------------------- */

  setActivePaletteId: (paletteId) => {
    setState({ activePaletteId: paletteId });
  },

  addCustomPalette: (palette) => {
    const state = getState();

    if (state.customPalettes.some((existing) => existing.id === palette.id)) {
      return;
    }

    setState({ customPalettes: [...state.customPalettes, palette] });
  },

  createCustomPaletteFromHexList: (name, parsed) => {
    if (parsed.hexes.length === 0) {
      return null;
    }

    const palette = createCustomPalette(name, parsed.hexes);
    const state = getState();

    setState({
      customPalettes: [...state.customPalettes, palette],
      activePaletteId: palette.id,
    });

    return palette;
  },

  deleteCustomPalette: (paletteId) => {
    const state = getState();

    if (!state.customPalettes.some((palette) => palette.id === paletteId)) {
      // Presets are immutable seed data and can never be removed.
      return;
    }

    setState({
      customPalettes: state.customPalettes.filter((palette) => palette.id !== paletteId),
      activePaletteId:
        state.activePaletteId === paletteId ? DEFAULT_PALETTE_ID : state.activePaletteId,
    });
  },

  addColorToActivePalette: (hex) => {
    const state = getState();
    const normalized = normalizeHexColor(hex);

    setState({
      customPalettes: state.customPalettes.map((palette) =>
        palette.id === state.activePaletteId && palette.isCustom
          ? {
              ...palette,
              colors: [
                ...palette.colors,
                { id: createEntityId(), hex: normalized, name: normalized.toUpperCase() },
              ],
            }
          : palette,
      ),
    });
  },

  removeColorFromActivePalette: (colorId) => {
    const state = getState();

    setState({
      customPalettes: state.customPalettes.map((palette) =>
        palette.id === state.activePaletteId && palette.isCustom
          ? { ...palette, colors: palette.colors.filter((color) => color.id !== colorId) }
          : palette,
      ),
    });
  },

  replaceActivePaletteColors: (paletteId, hexColors) => {
    const state = getState();

    setState({
      customPalettes: state.customPalettes.map((palette) =>
        palette.id === paletteId && palette.isCustom
          ? {
              ...palette,
              colors: hexColors.map((hex) => {
                const normalized = normalizeHexColor(hex);

                return {
                  id: createEntityId(),
                  hex: normalized,
                  name: normalized.toUpperCase(),
                };
              }),
            }
          : palette,
      ),
    });
  },

  /* ------------------------------ layers ----------------------------- */

  setActiveLayerId: (layerId) => {
    const state = getState();

    if (!state.layers.some((layer) => layer.id === layerId)) {
      return;
    }

    setState({ activeLayerId: layerId });
  },

  addLayer: () => {
    const state = getState();

    if (state.layers.length >= MAX_LAYERS) {
      return null;
    }

    const now = Date.now();
    const topOrder = state.layers.reduce((max, layer) => Math.max(max, layer.order), -1);

    const layer: PixelLayer = {
      id: createEntityId(),
      projectId: state.currentProject.id,
      name: `Layer ${state.layers.length + 1}`,
      order: topOrder + 1,
      visible: true,
      locked: false,
      opacity: 1,
      blendMode: 'source-over',
      data: createEmptyLayerBuffer(state.currentProject.width, state.currentProject.height),
      createdAt: now,
      updatedAt: now,
    };

    setDocumentState({
      layers: renumberLayers([...state.layers, layer]),
      activeLayerId: layer.id,
      selection: createEmptySelection(),
    });

    return layer.id;
  },

  duplicateLayer: (layerId) => {
    const state = getState();

    if (state.layers.length >= MAX_LAYERS) {
      return null;
    }

    const source = state.layers.find((layer) => layer.id === layerId);

    if (!source) {
      return null;
    }

    const now = Date.now();

    const duplicate: PixelLayer = {
      ...source,
      id: createEntityId(),
      name: `${source.name} copy`,
      order: source.order + 1,
      // New buffer: the duplicate must never share storage with the original, or
      // a later stroke on one would corrupt the other.
      data: new Uint32Array(source.data),
      createdAt: now,
      updatedAt: now,
    };

    const shifted = state.layers.map((layer) =>
      layer.order > source.order ? { ...layer, order: layer.order + 1 } : layer,
    );

    setDocumentState({
      layers: renumberLayers([...shifted, duplicate]),
      activeLayerId: duplicate.id,
      selection: createEmptySelection(),
    });

    return duplicate.id;
  },

  mergeLayerDown: (layerId) => {
    const state = getState();
    const upper = state.layers.find((layer) => layer.id === layerId);

    if (!upper) {
      return false;
    }

    const lower = findLayerBelow(state.layers, layerId);

    if (!lower) {
      // The bottom layer has nothing to merge into.
      return false;
    }

    const mergedBuffer = mergeLayerBuffers(
      lower.data,
      upper.data,
      state.currentProject.width,
      state.currentProject.height,
      upper.opacity,
      upper.blendMode,
    );

    const mergedLayer: PixelLayer = {
      ...lower,
      data: mergedBuffer,
      // The merge bakes opacity and blend into the pixels, so the result is a
      // plain normal layer.
      opacity: 1,
      blendMode: 'source-over',
      updatedAt: Date.now(),
    };

    setDocumentState({
      layers: renumberLayers(
        state.layers
          .filter((layer) => layer.id !== layerId)
          .map((layer) => (layer.id === lower.id ? mergedLayer : layer)),
      ),
      activeLayerId: lower.id,
      selection: createEmptySelection(),
    });

    return true;
  },

  deleteLayer: (layerId) => {
    const state = getState();

    // Deletion guard (plan §Phase 3): a project always keeps at least one layer.
    if (state.layers.length <= 1) {
      return false;
    }

    if (!state.layers.some((layer) => layer.id === layerId)) {
      return false;
    }

    const remaining = state.layers.filter((layer) => layer.id !== layerId);

    let nextActiveId = state.activeLayerId;

    if (state.activeLayerId === layerId) {
      // Shift to the preceding (lower) neighbour before removal, so no observer
      // ever sees an `activeLayerId` that fails to resolve.
      const below = findLayerBelow(state.layers, layerId);
      const fallback = [...remaining].sort((a, b) => a.order - b.order)[0];

      nextActiveId = (below ?? fallback).id;
    }

    setDocumentState({
      layers: renumberLayers(remaining),
      activeLayerId: nextActiveId,
      selection: createEmptySelection(),
    });

    return true;
  },

  reorderLayer: (layerId, newOrder) => {
    const state = getState();
    const target = state.layers.find((layer) => layer.id === layerId);

    if (!target) {
      return false;
    }

    const clamped = Math.max(0, Math.min(state.layers.length - 1, Math.round(newOrder)));

    if (clamped === target.order) {
      return false;
    }

    const withoutTarget = state.layers
      .filter((layer) => layer.id !== layerId)
      .sort((a, b) => a.order - b.order);

    withoutTarget.splice(clamped, 0, target);

    // Sequential renumbering: sibling order values become exactly 0..n-1.
    setDocumentState({
      layers: withoutTarget.map((layer, index) =>
        layer.order === index ? layer : { ...layer, order: index, updatedAt: Date.now() },
      ),
    });

    return true;
  },

  renameLayer: (layerId, name) => {
    const trimmed = name.trim();

    if (trimmed.length === 0) {
      return;
    }

    updateLayer(layerId, (layer) => ({ ...layer, name: trimmed, updatedAt: Date.now() }));
  },

  setLayerVisible: (layerId, visible) => {
    updateLayer(layerId, (layer) => ({ ...layer, visible, updatedAt: Date.now() }));
  },

  setLayerLocked: (layerId, locked) => {
    updateLayer(layerId, (layer) => ({ ...layer, locked, updatedAt: Date.now() }));
  },

  toggleLayerVisible: (layerId) => {
    updateLayer(layerId, (layer) => ({
      ...layer,
      visible: !layer.visible,
      updatedAt: Date.now(),
    }));
  },

  toggleLayerLocked: (layerId) => {
    updateLayer(layerId, (layer) => ({
      ...layer,
      locked: !layer.locked,
      updatedAt: Date.now(),
    }));
  },

  setLayerOpacity: (layerId, opacity) => {
    const clamped = Math.max(0, Math.min(1, opacity));

    updateLayer(layerId, (layer) => ({ ...layer, opacity: clamped, updatedAt: Date.now() }));
  },

  setLayerBlendMode: (layerId, blendMode) => {
    updateLayer(layerId, (layer) => ({ ...layer, blendMode, updatedAt: Date.now() }));
  },

  /* ------------------------------ pixels ----------------------------- */

  commitLayerBuffer: ({ layerId, data, actionName }) => {
    const state = getState();
    const target = state.layers.find((layer) => layer.id === layerId);

    if (!target) {
      return false;
    }

    if (target.locked) {
      // Locked layers reject every edit; the status bar surfaces the reason.
      return false;
    }

    const expectedPixels = state.currentProject.width * state.currentProject.height;

    if (data.length < expectedPixels) {
      throw new Error(
        `commitLayerBuffer: buffer holds ${data.length} pixels but the document needs ${expectedPixels}.`,
      );
    }

    // Buffer-fidelity guard: a detached or JSON-degraded buffer must never enter
    // the store, because the compositor indexes it as a typed array.
    if (!(data instanceof Uint32Array)) {
      throw new Error('commitLayerBuffer: `data` must be a Uint32Array.');
    }

    const record: CanvasHistoryRecord = {
      id: createEntityId(),
      timestamp: Date.now(),
      actionName,
      layerId,
      previousData: target.data,
      newData: data,
    };

    const layers = state.layers.map((layer) =>
      layer.id === layerId ? { ...layer, data, updatedAt: Date.now() } : layer,
    );

    // History divergence rule: a new paint action truncates the redo tail.
    const truncated = state.history.records.slice(0, state.history.index);
    const appended = [...truncated, record];

    // Circular buffer: drop the oldest record once the cap is reached.
    const overflow = Math.max(0, appended.length - state.history.limit);
    const records = overflow > 0 ? appended.slice(overflow) : appended;

    setDocumentState({
      layers,
      history: { records, index: records.length, limit: state.history.limit },
    });

    return true;
  },

  paintPoints: ({ points, colorUint32, actionName, layerId }) => {
    const state = getState();
    const targetId = layerId ?? state.activeLayerId;
    const target = state.layers.find((layer) => layer.id === targetId);

    if (!target || target.locked) {
      return false;
    }

    const { width, height } = state.currentProject;

    // Staging clone: committed layer data is never mutated in place.
    const staging = new Uint32Array(target.data);
    let painted = 0;

    for (const point of points) {
      if (point.x < 0 || point.y < 0 || point.x >= width || point.y >= height) {
        continue;
      }

      staging[point.y * width + point.x] = colorUint32;
      painted += 1;
    }

    if (painted === 0) {
      return false;
    }

    return actions.commitLayerBuffer({ layerId: targetId, data: staging, actionName });
  },

  applyPixelWrites: ({ layerId, writes, actionName }) => {
    const state = getState();
    const target = state.layers.find((layer) => layer.id === layerId);

    if (!target || target.locked) {
      return false;
    }

    const staging = new Uint32Array(target.data);

    for (const write of writes) {
      if (write.index < 0 || write.index >= staging.length) {
        continue;
      }

      staging[write.index] = write.color;
    }

    return actions.commitLayerBuffer({ layerId, data: staging, actionName });
  },

  /* ----------------------------- history ----------------------------- */

  undo: () => {
    const state = getState();
    let index = state.history.index;

    // Skip records whose layer has since been deleted, so undo keeps working
    // after structural edits.
    while (index > 0 && !isRecordApplicable(state, state.history.records[index - 1])) {
      index -= 1;
    }

    if (index === 0) {
      baseStore.setState({ history: { ...state.history, index } });
      return false;
    }

    const record = state.history.records[index - 1];

    if (!replaceLayerBuffer(record.layerId, record.previousData)) {
      return false;
    }

    baseStore.setState({ history: { ...getState().history, index: index - 1 } });

    return true;
  },

  redo: () => {
    const state = getState();
    let index = state.history.index;

    while (
      index < state.history.records.length &&
      !isRecordApplicable(state, state.history.records[index])
    ) {
      index += 1;
    }

    if (index >= state.history.records.length) {
      baseStore.setState({ history: { ...state.history, index } });
      return false;
    }

    const record = state.history.records[index];

    if (!replaceLayerBuffer(record.layerId, record.newData)) {
      return false;
    }

    baseStore.setState({ history: { ...getState().history, index: index + 1 } });

    return true;
  },

  clearHistory: () => {
    const state = getState();
    baseStore.setState({ history: { records: [], index: 0, limit: state.history.limit } });
  },

  /* ------------------------- project lifecycle ----------------------- */

  loadProject: (project, layers) => {
    const ordered = renumberLayers(layers);
    const viewportSize = getState().viewportSize;

    setState({
      currentProject: { ...project },
      layers: ordered,
      activeLayerId: ordered[0]?.id ?? '',
      selection: createEmptySelection(),
      history: { records: [], index: 0, limit: HISTORY_LIMIT },
      viewport: {
        zoom: getFitZoom({ width: project.width, height: project.height }, viewportSize),
        panX: 0,
        panY: 0,
      },
      // Freshly loaded from storage: nothing to write back yet.
      documentRevision: 0,
      savedRevision: 0,
      isHydrated: true,
    });
  },

  createNewProject: (options) => {
    const { project, layers } = createProjectWithLayers(options);
    const viewportSize = getState().viewportSize;

    setState({
      currentProject: project,
      layers,
      activeLayerId: layers[0].id,
      selection: createEmptySelection(),
      history: { records: [], index: 0, limit: HISTORY_LIMIT },
      viewport: {
        zoom: getFitZoom({ width: project.width, height: project.height }, viewportSize),
        panX: 0,
        panY: 0,
      },
      // Never saved: autosave inserts the record after the first stroke or edit.
      documentRevision: 1,
      savedRevision: -1,
      isHydrated: true,
    });
  },

  setProjectTitle: (title) => {
    const trimmed = title.trim();

    if (trimmed.length === 0) {
      return;
    }

    setDocumentState({ currentProject: { ...getState().currentProject, title: trimmed } });
  },

  setProjectFps: (fps) => {
    const clamped = Math.min(60, Math.max(1, Math.round(fps)));

    setDocumentState({ currentProject: { ...getState().currentProject, fps: clamped } });
  },

  setStoredThumbnail: (thumbnailUrl) => {
    const state = getState();

    if (state.currentProject.thumbnailUrl === thumbnailUrl) {
      return;
    }

    setState({ currentProject: { ...state.currentProject, thumbnailUrl } });
  },

  markSaved: (revision) => {
    setState({ savedRevision: revision });
  },

  markDocumentDirty: () => {
    setState({ documentRevision: getState().documentRevision + 1 });
  },

  setHydrated: (hydrated) => {
    setState({ isHydrated: hydrated });
  },
};

/** The editor store singleton: state access plus every action. */
export const editorStore: EditorStore = { ...baseStore, ...actions };

/** Subscribes a component to a slice of editor state. */
export function useEditorStore<TSelection>(
  selector: (state: EditorState) => TSelection,
): TSelection {
  return useStoreSelector(baseStore, selector);
}

/* Viewport clamps are re-exported so UI code has a single import site. */
export { MAX_ZOOM, MIN_ZOOM };
