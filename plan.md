# Pixel Art Studio - System Architecture & Implementation Plan

---

## 1. Data Schema & Pure TypeScript Interfaces

```typescript
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

export type BlendMode = 
  | 'source-over' 
  | 'multiply' 
  | 'screen' 
  | 'overlay' 
  | 'darken' 
  | 'lighten';

export interface Point {
  x: number;
  y: number;
}

export interface Dimensions {
  width: number;
  height: number;
}

export interface BoundingBox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

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

// Immutability Invariant: State updates must produce a new PixelLayer object
// and a new Uint32Array reference. In-place mutation of layer.data is prohibited.

export interface PaletteColor {
  id: string;
  hex: string;
  name: string;
}

export interface ColorPalette {
  id: string;
  name: string;
  colors: PaletteColor[];
  isCustom: boolean;
}

export interface CanvasHistoryRecord {
  id: string;
  timestamp: number;
  actionName: string;
  layerId: string;
  previousData: Uint32Array;
  newData: Uint32Array;
}

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

export interface ProjectSettings {
  gridVisible: boolean;
  gridColor: string;
  scanlinesEnabled: boolean;
  soundEffectsEnabled: boolean;
  pixelSnap: boolean;
  backgroundPattern: 'checker' | 'solid-dark' | 'solid-light';
}

export interface SelectionPixelTuple {
  index: number;
  color: number;
}

export interface SelectionState {
  active: boolean;
  origin: Point | null;
  current: Point | null;
  selectedPixels: SelectionPixelTuple[]; // Array-of-tuples for structured clone & serialization safety
  floating: boolean;
}

// All entity IDs must be generated via crypto.randomUUID()

export interface ViewportTransform {
  zoom: number;
  panX: number;
  panY: number;
}

export interface CanvasEditorState {
  currentProject: ProjectMetadata;
  layers: PixelLayer[];
  activeLayerId: string;
  selectedTool: ToolType;
  primaryColor: string;
  secondaryColor: string;
  brushSize: number;
  symmetryMode: 'none' | 'horizontal' | 'vertical' | 'both';
  viewport: ViewportTransform;
  selection: SelectionState;
  settings: ProjectSettings;
  activePaletteId: string;
  customPalettes: ColorPalette[];
}
```

---

## 2. Component Architecture

```
/*
 * Architectural Dependency Rule:
 * Strict unidirectional flow: types -> utils -> store -> hooks -> components.
 * Hooks must never import sibling hooks; hooks interact solely through store state.
 */

src/
├── app/
│   ├── layout.tsx
│   └── page.tsx
├── components/
│   ├── primitives/
│   │   ├── ArcadeButton.tsx
│   │   ├── ArcadeToggle.tsx
│   │   ├── ArcadeSlider.tsx
│   │   ├── ArcadeInput.tsx
│   │   ├── ArcadeSelect.tsx
│   │   ├── ArcadeModal.tsx
│   │   ├── ArcadeTooltip.tsx
│   │   └── RetroCard.tsx
│   ├── compound/
│   │   ├── ColorPickerPanel.tsx
│   │   ├── PaletteManager.tsx
│   │   ├── ToolsetPanel.tsx
│   │   ├── LayerList.tsx
│   │   ├── LayerListItem.tsx
│   │   ├── ZoomControls.tsx
│   │   ├── HistoryControls.tsx
│   │   ├── SymmetryControls.tsx
│   │   └── ScanlineOverlay.tsx
│   ├── domain/
│   │   ├── CanvasViewport.tsx
│   │   ├── PixelCanvas.tsx
│   │   ├── GridOverlay.tsx
│   │   ├── SelectionMarquee.tsx
│   │   ├── ExportDialog.tsx
│   │   ├── NewProjectDialog.tsx
│   │   ├── ProjectLibraryModal.tsx
│   │   └── AudioController.tsx
│   └── layout/
│       ├── RetroHeader.tsx
│       ├── MainWorkbench.tsx
│       ├── MobileControlDrawer.tsx
│       └── MobileToolCarousel.tsx
├── hooks/
│   ├── useCanvasInteraction.ts
│   ├── useHistoryBuffer.ts
│   ├── useLayerCompositor.ts
│   ├── useRetroAudio.ts
│   ├── useSelectionBounds.ts
│   └── usePixelProjectStorage.ts
├── store/
│   ├── projectStore.ts
│   └── editorStore.ts
└── utils/
    ├── algorithms/
    │   ├── bresenham.ts
    │   ├── floodFill.ts
    │   ├── circleRaster.ts
    │   └── rectangleRaster.ts
    ├── color/
    │   ├── colorConvert.ts
    │   └── presetPalettes.ts
    ├── export/
    │   ├── pngExport.ts
    │   └── jsonExport.ts
    ├── audio/
    │   └── soundSynth.ts
    └── storage/
        └── indexedDbClient.ts
```

---

## 3. Core Feature Logic & Pure Algorithms

### 3.1 Bresenham's Line Algorithm
Draws pixel-perfect lines between discrete grid coordinates without gaps.

```typescript
export function getBresenhamLine(p0: Point, p1: Point): Point[] {
  const points: Point[] = [];
  let x0 = Math.round(p0.x);
  let y0 = Math.round(p0.y);
  const x1 = Math.round(p1.x);
  const y1 = Math.round(p1.y);

  const dx = Math.abs(x1 - x0);
  const dy = Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx - dy;

  while (true) {
    points.push({ x: x0, y: y0 });
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 > -dy) {
      err -= dy;
      x0 += sx;
    }
    if (e2 < dx) {
      err += dx;
      y0 += sy;
    }
  }

  return points;
}
```

### 3.2 Flood Fill (Scanline Breadth-First Search)
Fills contiguous pixels matching target color buffer values.

```typescript
export function executeFloodFill(
  buffer: Uint32Array,
  width: number,
  height: number,
  startPoint: Point,
  fillColorUint32: number
): { modifiedBuffer: Uint32Array; changedCoordinates: Point[] } {
  const targetBuffer = new Uint32Array(buffer);
  const changed: Point[] = [];
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

  const visited = new Uint8Array(width * height);
  const queueX = new Int32Array(width * height);
  const queueY = new Int32Array(width * height);
  let head = 0;
  let tail = 0;

  queueX[tail] = startX;
  queueY[tail] = startY;
  tail++;
  visited[startIndex] = 1;

  while (head < tail) {
    const cx = queueX[head];
    const cy = queueY[head];
    head++;

    const currentIndex = cy * width + cx;
    targetBuffer[currentIndex] = fillColorUint32;
    changed.push({ x: cx, y: cy });

    const neighbors: [number, number][] = [
      [cx + 1, cy],
      [cx - 1, cy],
      [cx, cy + 1],
      [cx, cy - 1]
    ];

    for (let i = 0; i < 4; i++) {
      const nx = neighbors[i][0];
      const ny = neighbors[i][1];

      if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
        const nIndex = ny * width + nx;
        if (!visited[nIndex] && targetBuffer[nIndex] === sourceColor) {
          visited[nIndex] = 1;
          queueX[tail] = nx;
          queueY[tail] = ny;
          tail++;
        }
      }
    }
  }

  return { modifiedBuffer: targetBuffer, changedCoordinates: changed };
}
```

### 3.3 Midpoint Circle Algorithm
Rasterizes pixelated hollow or filled circles.

```typescript
export function getRasterCircle(center: Point, radius: number, filled: boolean): Point[] {
  const points: Map<string, Point> = new Map();
  const cx = Math.round(center.x);
  const cy = Math.round(center.y);
  const r = Math.round(radius);

  const addPoint = (x: number, y: number) => {
    const key = `${x},${y}`;
    if (!points.has(key)) {
      points.set(key, { x, y });
    }
  };

  const addSpan = (x1: number, x2: number, y: number) => {
    const minX = Math.min(x1, x2);
    const maxX = Math.max(x1, x2);
    for (let x = minX; x <= maxX; x++) {
      addPoint(x, y);
    }
  };

  let x = 0;
  let y = r;
  let d = 3 - 2 * r;

  while (y >= x) {
    if (filled) {
      addSpan(cx - x, cx + x, cy + y);
      addSpan(cx - x, cx + x, cy - y);
      addSpan(cx - y, cx + y, cy + x);
      addSpan(cx - y, cx + y, cy - x);
    } else {
      addPoint(cx + x, cy + y);
      addPoint(cx - x, cy + y);
      addPoint(cx + x, cy - y);
      addPoint(cx - x, cy - y);
      addPoint(cx + y, cy + x);
      addPoint(cx - y, cy + x);
      addPoint(cx + y, cy - x);
      addPoint(cx - y, cy - x);
    }

    x++;
    if (d > 0) {
      y--;
      d = d + 4 * (x - y) + 10;
    } else {
      d = d + 4 * x + 6;
    }
  }

  return Array.from(points.values());
}
```

### 3.4 Multi-Layer Compositing Engine
Composites layers into a single render buffer with alpha calculation and blend operations.

```typescript
/**
 * Canonical 32-bit little-endian packing: R(0-7) | G(8-15) | B(16-23) | A(24-31)
 * Must match compositeLayers decoding exactly across all modules.
 */
export function rgbaToUint32(r: number, g: number, b: number, a: number): number {
  return ((a & 0xff) << 24) | ((b & 0xff) << 16) | ((g & 0xff) << 8) | (r & 0xff);
}

export function compositeLayers(
  layers: PixelLayer[],
  width: number,
  height: number
): Uint8ClampedArray {
  const totalPixels = width * height;
  const compositeBuffer = new Uint8ClampedArray(totalPixels * 4);

  for (let i = 0; i < layers.length; i++) {
    const layer = layers[i];
    if (!layer.visible || layer.opacity === 0) continue;

    const layerData = layer.data;
    const layerOpacity = Math.max(0, Math.min(1, layer.opacity));

    for (let p = 0; p < totalPixels; p++) {
      const colorUint32 = layerData[p];
      if (colorUint32 === 0) continue;

      const srcR = (colorUint32 >> 0) & 0xff;
      const srcG = (colorUint32 >> 8) & 0xff;
      const srcB = (colorUint32 >> 16) & 0xff;
      const srcA = (((colorUint32 >> 24) & 0xff) / 255) * layerOpacity;

      if (srcA <= 0) continue;

      const destOffset = p * 4;
      const dstR = compositeBuffer[destOffset];
      const dstG = compositeBuffer[destOffset + 1];
      const dstB = compositeBuffer[destOffset + 2];
      const dstA = compositeBuffer[destOffset + 3] / 255;

      const outA = srcA + dstA * (1 - srcA);

      if (outA > 0) {
        compositeBuffer[destOffset] = Math.round((srcR * srcA + dstR * dstA * (1 - srcA)) / outA);
        compositeBuffer[destOffset + 1] = Math.round((srcG * srcA + dstG * dstA * (1 - srcA)) / outA);
        compositeBuffer[destOffset + 2] = Math.round((srcB * srcA + dstB * dstA * (1 - srcA)) / outA);
        compositeBuffer[destOffset + 3] = Math.round(outA * 255);
      }
    }
  }

  return compositeBuffer;
}
```

### 3.5 Screen to Canvas Coordinate Projection
Transforms pointer events to pixel grid space with support for pinch, zoom, and canvas panning.

```typescript
export function projectScreenToCanvas(
  screenPoint: Point,
  canvasRect: DOMRect,
  viewport: ViewportTransform,
  gridDimensions: Dimensions
): Point | null {
  const relX = screenPoint.x - canvasRect.left;
  const relY = screenPoint.y - canvasRect.top;

  const gridX = Math.floor((relX - canvasRect.width / 2 - viewport.panX) / viewport.zoom + gridDimensions.width / 2);
  const gridY = Math.floor((relY - canvasRect.height / 2 - viewport.panY) / viewport.zoom + gridDimensions.height / 2);

  if (gridX < 0 || gridX >= gridDimensions.width || gridY < 0 || gridY >= gridDimensions.height) {
    return null;
  }

  return { x: gridX, y: gridY };
}
```

### 3.6 Web Audio 8-Bit Synthesizer
Generates retro sound effects programmatically without external audio files.

```typescript
export class RetroAudioEngine {
  private ctx: AudioContext | null = null;
  private isMuted: boolean = false;

  private initContext() {
    if (!this.ctx && typeof window !== 'undefined') {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AudioCtx();
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  public setMuted(muted: boolean) {
    this.isMuted = muted;
  }

  public playPixelBlip() {
    if (this.isMuted) return;
    this.initContext();
    if (!this.ctx) return;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    const now = this.ctx.currentTime;

    osc.type = 'square';
    osc.frequency.setValueAtTime(440, now);
    osc.frequency.exponentialRampToValueAtTime(880, now + 0.04);

    gain.gain.setValueAtTime(0.12, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.04);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(now);
    osc.stop(now + 0.04);
  }

  public playToolSelect() {
    if (this.isMuted) return;
    this.initContext();
    if (!this.ctx) return;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    const now = this.ctx.currentTime;

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(320, now);
    osc.frequency.setValueAtTime(640, now + 0.03);

    gain.gain.setValueAtTime(0.1, now);
    gain.gain.linearRampToValueAtTime(0.001, now + 0.07);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(now);
    osc.stop(now + 0.07);
  }

  public playActionSuccess() {
    if (this.isMuted) return;
    this.initContext();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    const notes = [523.25, 659.25, 783.99, 1046.50];

    notes.forEach((freq, idx) => {
      if (!this.ctx) return;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      const startTime = now + idx * 0.05;

      osc.type = 'square';
      osc.frequency.setValueAtTime(freq, startTime);

      gain.gain.setValueAtTime(0.08, startTime);
      gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.08);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(startTime);
      osc.stop(startTime + 0.08);
    });
  }
}
```

### 3.7 Scaled PNG Exporter
Exports multi-layer pixel art with exact nearest-neighbor scaling and transparent or colored background.

```typescript
export async function exportToPNG(
  layers: PixelLayer[],
  width: number,
  height: number,
  scaleFactor: number,
  includeBackground: boolean,
  backgroundColorHex: string = '#000000'
): Promise<Blob> {
  const exportCanvas = document.createElement('canvas');
  exportCanvas.width = width * scaleFactor;
  exportCanvas.height = height * scaleFactor;

  const ctx = exportCanvas.getContext('2d');
  if (!ctx) {
    throw new Error('Canvas 2D context creation failed during export.');
  }

  ctx.imageSmoothingEnabled = false;

  if (includeBackground) {
    ctx.fillStyle = backgroundColorHex;
    ctx.fillRect(0, 0, exportCanvas.width, exportCanvas.height);
  }

  const rawComposite = compositeLayers(layers, width, height);

  const baseCanvas = document.createElement('canvas');
  baseCanvas.width = width;
  baseCanvas.height = height;
  const baseCtx = baseCanvas.getContext('2d');
  if (!baseCtx) {
    throw new Error('Base canvas context allocation failed.');
  }

  const imgData = new ImageData(rawComposite, width, height);
  baseCtx.putImageData(imgData, 0, 0);

  ctx.drawImage(
    baseCanvas,
    0,
    0,
    width,
    height,
    0,
    0,
    exportCanvas.width,
    exportCanvas.height
  );

  return new Promise((resolve, reject) => {
    exportCanvas.toBlob((blob) => {
      if (blob) {
        resolve(blob);
      } else {
        reject(new Error('PNG Blob generation returned null.'));
      }
    }, 'image/png');
  });
}
```

---

## 4. Responsive Breakpoint Matrix & Mobile Touch System

### 4.1 Viewport Breakpoints & Constraints
- **Layout Safe Area:** Fixed bottom bars and drawer shells require `padding-bottom: env(safe-area-inset-bottom)`.
- **Minimum Tap Target:** All mobile action buttons must maintain minimum dimensions of 44x44px.
- **Mobile Small (360px - 389px):** Canvas fills upper 55% viewport height. Bottom dock exposes 4 primary tools and active color chip. `ZoomControls` are excluded from the main bar and housed strictly within the secondary pull-up drawer to prevent overflow.
- **Mobile Standard (390px - 429px):** Canvas fills upper 60% viewport height. Bottom dock exposes 5 core tools, active color badge, and layer drawer toggle.
- **Mobile Large / Phablet (430px - 767px):** Bottom dock with flyout menus for tools and swatches. Floating undo/redo overlay controls.
- **Tablet (768px - 1023px):** Two-column layout. Left rail (48px wide), flexible canvas, right collapsible drawer (260px) for layers and palettes.
- **Desktop (1024px+):** Arcade cabinet layout. Left tool rail (64px), right panel (320px), central canvas with persistent status bar and CRT scanline toggle.

### 4.2 Touch Interaction Engine & Multi-Touch Preemption
- Single pointer down with drawing tool active (`pencil`, `eraser`, etc.) applies `touch-action: none` and initiates drawing stroke.
- Gesture Preemption Rule: As soon as a second touch point is registered (`e.touches.length >= 2`), immediately abort and discard the pending single-pointer stroke buffer, commit zero changes to the layer, and switch exclusively to pan/pinch-zoom gesture mode.
- Two-finger gesture tracking:
  - Distance delta updates `viewport.zoom`.
  - Midpoint delta updates `viewport.panX` and `viewport.panY`.
- Single pointer release on a valid drawing stroke commits the mutated buffer to history and schedules debounced autosave.

---

## 5. Five-Phase Sequential Implementation Queue

### Phase 1: Types, Storage Client, and Base Utilities
- Core dependency declarations:
  - `react`: `latest`
  - `react-dom`: `latest`
  - `next`: `latest`
  - `tailwindcss`: `latest`
  - `typescript`: `latest`
- Version Verification Rule: After package installation, inspect `package.json` to verify installed major versions of `react`, `next`, and `tailwindcss`. Generate all implementation code strictly targeting the APIs and conventions of those resolved major versions.
- Create pure TypeScript interfaces using `crypto.randomUUID()` for all entity ID generation.
- Implement IndexedDB client (`indexedDbClient.ts`):
  - Object store `projects`: keyPath `id`.
  - Object store `project_layers`: keyPath `id`, indexed by `projectId` (`by_project`) to query layers for any project.
  - Store and retrieve raw `Uint32Array` objects directly via structured clone.
  - Perform runtime check (`record.data instanceof Uint32Array`) on read; never run `JSON.stringify` or `JSON.parse` on layer data buffers.
  - Serialize `ProjectMetadata.thumbnailUrl` as standard Base64 Data URL string.
- Create retro color presets: NES, Game Boy 4-shade, PICO-8, Commodore 64, and Cyberpunk neon.
- Implement color utility functions with canonical little-endian bit-packing (`rgbaToUint32`).
- Implement `RetroAudioEngine` via Web Audio API.

### Phase 2: Design Foundation & Atomic UI Primitives
- Configure CSS-first Tailwind token variables using modern `@theme` directive in root CSS:
  ```css
  @theme {
    --color-arcade-black: #0c0c14;
    --color-arcade-neon-green: #00ff66;
    --color-arcade-hot-pink: #ff007f;
    --color-arcade-cyan: #00e5ff;
    --color-arcade-amber: #ffaa00;
    --font-arcade: "Press Start 2P", "Courier New", monospace;
  }
- Build atomic components:
  - `ArcadeButton`: 3D beveled button with press translation (`active:translate-y-0.5`) and audio trigger on click.
  - `ArcadeToggle`: 8-bit rocker switch with LED indicator.
  - `ArcadeSlider`: Stepped range slider with pixel thumb.
  - `ArcadeInput`: Chunky pixelated text and number inputs.
  - `ArcadeSelect`: Dropdown styled as an arcade menu selector.
  - `RetroCard`: Bordered container with corner accents and CRT bezel styling.
  - `ScanlineOverlay`: Non-interactive CSS scanline and vignette filter with toggle state.

### Phase 3: Compound Molecules & Feature Modules
- Build `ToolsetPanel`: Tool buttons with active indicator LEDs, hotkey badges, and tooltips.
- Build `ColorPickerPanel`: Visual color swatch matrix, primary/secondary color display, eyedropper toggle, and hex code editor.
- Build `PaletteManager`: Palette switcher dropdown, custom color addition, and export/import of palette hex lists.
- Build `LayerListItem`: Layer visibility toggle, lock toggle, opacity slider, blend mode selector, layer rename input, and layer drag handle.
- Build `LayerList`: Layer stack ordering, add layer, duplicate layer, merge down, and delete layer buttons.
  - Layer Reordering Strategy: Reordering updates sibling `order` values sequentially (0, 1, 2, ...) and persists them in a single batched IndexedDB transaction.
  - Layer Deletion Guard: Deletion is blocked if only 1 layer exists. When deleting the currently active layer, `activeLayerId` automatically shifts to the preceding adjacent layer before removal to prevent null reference errors.
- Build `ZoomControls`: Zoom in, zoom out, fit to screen, and reset 100% buttons.
- Build `HistoryControls`: Step backward (Undo) and Step forward (Redo) with action name indicators.

### Phase 4: Canvas Engine, Drawing Algorithms & State Management
- Implement drawing math utilities:
  - `getBresenhamLine` for continuous pencil and line tools.
  - `executeFloodFill` for boundary color replacement.
  - `getRasterCircle` and `getRasterRectangle` for geometric shape drawing.
- Implement `CanvasViewport` component:
  - Main HTML5 Canvas and secondary overlay canvas for cursor hover, grid lines, and shape previews.
  - Offscreen rendering pipeline for multi-layer compositing.
  - Gesture preemption on multi-touch to cancel drawing strokes on 2nd finger touch.
- Implement `useHistoryBuffer` hook:
  - 50-step circular buffer storing layer mutations.
  - History Divergence Rule: Any new paint action executed after `undo()` immediately truncates and discards the redo tail.
- Implement project state manager (`editorStore.ts`):
  - Enforce reference immutability: every stroke, fill, and modification must produce a newly allocated `PixelLayer` and new `Uint32Array` buffer clone. Never mutate `layer.data` in place.
- Implement `usePixelProjectStorage` autosave hook:
  - Debounced at 400ms.
  - Triggers strictly on `pointerup` / stroke-end; never on `pointermove`.
  - Guarded by an in-flight transaction lock to prevent concurrent IndexedDB writes.

### Phase 5: Page Assembly, Responsive Shell & Export Pipeline
- Implement `NewProjectDialog`: Canvas size presets (8x8, 16x16, 24x24, 32x32, 64x64, custom up to 128x128) and default background selector.
- Implement `ExportDialog`: Multi-scale PNG exporter (1x, 2x, 4x, 8x, 16x, 32x), spritesheet format exporter, background transparency toggle, and download trigger.
- Implement `ProjectLibraryModal`: List saved local projects, delete project, duplicate project, and load selected project from IndexedDB.
- Assemble responsive shell in `app/page.tsx`:
  - Desktop workbench layout with sticky toolbars and side docks.
  - Mobile layout with drawer toggles, bottom-docked tool selector, and touch gesture handling.
  - Integration of audio feedback on all interactive operations.
  - Keyboard shortcuts listener: `B` (Pencil), `E` (Eraser), `G` (Bucket), `I` (Eyedropper), `L` (Line), `U` (Rectangle), `C` (Circle), `H` (Pan), `Ctrl+Z` (Undo), `Ctrl+Y` (Redo).