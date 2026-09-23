/**
 * Pixel Art Studio — canonical domain schema.
 *
 * Layer 1 of the architectural dependency rule: `types -> utils -> store ->
 * hooks -> components`. This module MUST NOT import from any other layer; it is
 * a pure, dependency-free declaration of the data contracts shared by every
 * other module in the application.
 *
 * Invariant: all entity identifiers are opaque UUID v4 strings produced by
 * `createEntityId()` (`src/utils/id/createEntityId.ts`), which wraps
 * `crypto.randomUUID()`.
 */

/** Every drawing/interaction mode exposed by the tool rail. */
export type ToolType =
  | 'pencil'
  | 'eraser'
  | 'bucket'
  | 'eyedropper'
  | 'line'
  | 'rectangle'
  | 'circle'
  | 'select'
  | 'pan';

/**
 * Compositing operations supported by `compositeLayers`.
 *
 * The first entry (`source-over`) is the canonical normal-alpha path and is the
 * only mode whose math is implemented by plain source-over accumulation in the
 * Phase 4 compositor; the remaining entries are per-channel separable blends
 * resolved against the backdrop.
 */
export type BlendMode =
  | 'source-over'
  | 'multiply'
  | 'screen'
  | 'overlay'
  | 'darken'
  | 'lighten';

/** Mirroring strategy applied around the active layer's centre axes. */
export type SymmetryMode = 'none' | 'horizontal' | 'vertical' | 'both';

/** Backdrop pattern rendered behind the lowest visible layer. */
export type BackgroundPattern = 'checker' | 'solid-dark' | 'solid-light';

/** Integer grid coordinate. Values are always whole pixels, never sub-pixel. */
export interface Point {
  x: number;
  y: number;
}

/** Grid extents in pixels. */
export interface Dimensions {
  width: number;
  height: number;
}

/** Inclusive axis-aligned rectangle in grid space. */
export interface BoundingBox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/** Straight (non-premultiplied) 8-bit colour channels. */
export interface RgbColor {
  r: number;
  g: number;
  b: number;
}

/**
 * RGBA byte buffer that is guaranteed to be backed by a plain `ArrayBuffer`.
 *
 * The explicit buffer type parameter matches `ImageData`'s `ImageDataArray`, so a
 * freshly composited frame can be handed straight to `new ImageData(...)` with no
 * defensive copy.
 */
export type RgbaBuffer = Uint8ClampedArray<ArrayBuffer>;

/** Straight (non-premultiplied) 8-bit colour channels plus alpha. */
export interface PixelRgba {
  r: number;
  g: number;
  b: number;
  a: number;
}

/**
 * A single raster layer.
 *
 * `data` is a row-major `width * height` buffer of values packed canonically by
 * `rgbaToUint32` as little-endian `A(24-31) B(16-23) G(8-15) R(0-7)`. The value
 * `0` therefore denotes a fully transparent pixel.
 *
 * Immutability Invariant: state updates must produce a new `PixelLayer` object
 * AND a new `Uint32Array` reference. In-place mutation of `layer.data` is
 * prohibited anywhere in the codebase.
 */
export interface PixelLayer {
  id: string;
  projectId: string;
  name: string;
  order: number;
  visible: boolean;
  locked: boolean;
  opacity: number;
  blendMode: BlendMode;
  data: Uint32Array;
  createdAt: number;
  updatedAt: number;
}

/** A single named swatch inside a palette. */
export interface PaletteColor {
  id: string;
  hex: string;
  name: string;
}

/** An ordered set of swatches, either shipped with the app or user-authored. */
export interface ColorPalette {
  id: string;
  name: string;
  colors: PaletteColor[];
  isCustom: boolean;
}

/**
 * One reversible layer mutation recorded by the 50-step history buffer.
 *
 * Both buffers are full snapshots (not deltas) so that undo/redo is O(1) w.r.t.
 * operation complexity and immune to ordering bugs.
 */
export interface CanvasHistoryRecord {
  id: string;
  timestamp: number;
  actionName: string;
  layerId: string;
  previousData: Uint32Array;
  newData: Uint32Array;
}

/**
 * Project descriptor. This is exactly the record persisted in the IndexedDB
 * `projects` object store (keyPath `id`).
 *
 * `thumbnailUrl` is serialized as a standard Base64 Data URL string
 * (`data:image/png;base64,....`) or `null` when no preview has been captured.
 * Raw layer buffers are NEVER stored here.
 */
export interface ProjectMetadata {
  id: string;
  title: string;
  width: number;
  height: number;
  fps: number;
  createdAt: number;
  updatedAt: number;
  thumbnailUrl: string | null;
}

/** Per-project editor preferences, persisted alongside the project record. */
export interface ProjectSettings {
  gridVisible: boolean;
  gridColor: string;
  scanlinesEnabled: boolean;
  soundEffectsEnabled: boolean;
  pixelSnap: boolean;
  backgroundPattern: BackgroundPattern;
}

/**
 * A flattened selection entry.
 *
 * Represented as an array-of-tuples rather than a `Map` so the structure stays
 * safely structured-cloneable and serializable across worker/postMessage
 * boundaries without custom `replacer` logic.
 */
export interface SelectionPixelTuple {
  index: number;
  color: number;
}

/** State of the marquee/select tool. */
export interface SelectionState {
  active: boolean;
  origin: Point | null;
  current: Point | null;
  selectedPixels: SelectionPixelTuple[];
  floating: boolean;
}

/** Pan/zoom transform applied when projecting grid space onto the viewport. */
export interface ViewportTransform {
  zoom: number;
  panX: number;
  panY: number;
}

/** Complete editor state tree. */
export interface CanvasEditorState {
  currentProject: ProjectMetadata;
  layers: PixelLayer[];
  activeLayerId: string;
  selectedTool: ToolType;
  primaryColor: string;
  secondaryColor: string;
  brushSize: number;
  symmetryMode: SymmetryMode;
  viewport: ViewportTransform;
  selection: SelectionState;
  settings: ProjectSettings;
  activePaletteId: string;
  customPalettes: ColorPalette[];
}

/* ------------------------------------------------------------------ *
 * Persistence contracts (consumed by src/utils/storage)
 * ------------------------------------------------------------------ */

/** Object store names inside the `pixel-art-studio` IndexedDB database. */
export type IndexedDbStoreName = 'projects' | 'project_layers';

/** Machine-readable failure taxonomy for persistence operations. */
export type IndexedDbErrorCode =
  /** The environment exposes no usable IndexedDB implementation. */
  | 'unsupported'
  /** `indexedDB.open()` itself failed or was refused. */
  | 'open-failed'
  /** Another tab holds an older connection open during an upgrade. */
  | 'blocked'
  /** Another tab is upgrading the schema; this connection is now stale. */
  | 'version-change'
  /** A read/write transaction errored or aborted. */
  | 'transaction-failed'
  /** A persisted record failed structural validation on read or write. */
  | 'invalid-record'
  /** The origin storage quota was exceeded. */
  | 'quota-exceeded';

/** Result of `estimateStorageUsage()`. */
export interface StorageUsageEstimate {
  usageBytes: number;
  quotaBytes: number;
  /** `usageBytes / quotaBytes` clamped to the 0..1 range. */
  percentUsed: number;
}
