# Pixel Art Studio

A browser-native, offline-first sprite editor and pixel art workstation built with React, TypeScript, Tailwind CSS v4, and the Web Audio API. Styled in a retro 8-bit arcade cabinet aesthetic with CRT scanlines, multi-layer compositing, and multi-scale export engines.

**Live Application:** [https://pixel-art-studio-cyan.vercel.app/](https://pixel-art-studio-cyan.vercel.app/)

---

## Overview

Pixel Art Studio combines vintage game-asset authoring ergonomics with a modern, high-performance web architecture:

- **Multi-Layer Raster Engine:** Non-destructive layer stack with blend modes (`source-over`, `multiply`, `screen`, `overlay`, `darken`, `lighten`), opacity control, layer reordering, and merge-down arithmetic.
- **Sub-Millisecond Drawing Pipeline:** Offscreen buffer compositing utilizing packed 32-bit integer typed arrays (`Uint32Array`) directly mapped to Canvas `ImageData`. Zero DOM re-renders on active strokes.
- **Procedural 8-Bit Audio:** 100% synthesized sound effects generated via Web Audio API oscillators and gain envelopes. Zero external audio asset dependencies.
- **Deterministic Persistence:** Client-side IndexedDB persistence utilizing structured cloning for raw typed arrays, debounced autosave guards, and project library management.
- **Engine-Ready Exports:** Nearest-neighbor PNG scaling (1x to 32x), configurable multi-tile spritesheet generation, and lossless portable JSON interchange files.

---

## Feature Matrix

| Domain | Capabilities |
|---|---|
| **Drawing Tools** | Pencil, Eraser, Flood Fill (BFS), Eyedropper, Line (Bresenham), Rectangle, Circle (Midpoint), Marquee Select, Pan |
| **Symmetry Engine** | Live mirroring across Horizontal (X), Vertical (Y), or Quadrant (Both) axes for strokes and geometric shapes |
| **Color Systems** | Pre-loaded hardware palettes (NES, Game Boy DMG, PICO-8, Commodore 64, Cyberpunk Neon), HEX/RGBA inputs, custom palette manager, and text import/export |
| **Layers** | Up to 12 layers, visibility toggling, edit locking, sequential drag-and-drop reordering, blend modes, and opacity curves |
| **History** | 50-step circular buffer storing immutable typed-array snapshots with redo truncation on divergence |
| **Export Formats** | Scaled PNG (1x, 2x, 4x, 8x, 16x, 32x), tiled spritesheets (custom columns, rows, padding, backgrounds), and `.pas.json` project interchange |

---

## Keyboard Shortcuts

| Key | Action |
|---|---|
| `B` | Pencil Tool |
| `E` | Eraser Tool |
| `G` | Flood Fill Tool |
| `I` | Eyedropper / Color Picker |
| `L` | Line Tool |
| `U` | Rectangle Tool (Hold `Shift` to fill) |
| `C` | Circle Tool (Hold `Shift` to fill) |
| `M` | Marquee Selection Tool |
| `H` / `Space + Drag` | Pan Viewport |
| `X` | Swap Primary and Secondary Colors |
| `D` | Reset Colors to Default (Black / White) |
| `Ctrl + Z` | Undo |
| `Ctrl + Y` / `Ctrl + Shift + Z` | Redo |
| `+` / `=` | Zoom In |
| `-` / `_` | Zoom Out |
| `0` | Reset Zoom to 100% |
| `F` | Fit Artboard to Viewport |
| `Delete` / `Backspace` | Clear Active Selection |
| `Esc` | Clear Selection / Dismiss Dialog |

---

## Architecture & Data Contracts

The codebase enforces strict unidirectional dependency flow:
`types -> utils -> store -> hooks -> components`

### Canonical Pixel Encoding
To eliminate platform-endian and byte-order serialization mismatches across the compositor and export pipelines, color integers are strictly packed in little-endian 32-bit words:

```
Bits 0 - 7   : Red   (0-255)
Bits 8 - 15  : Green (0-255)
Bits 16 - 23 : Blue  (0-255)
Bits 24 - 31 : Alpha (0-255)
```

Integer `0x00000000` denotes a fully transparent pixel, permitting single-instruction blank-pixel checks during layer compositing and flood fills.

### State & Reactivity
- State mutations are held within a custom observable store bound via `useSyncExternalStore`.
- Active stroke operations write directly to detached `Uint32Array` staging buffers. The store and history stack are only committed on `pointerup`, ensuring 60fps gesture fluidness without React reconciler overhead.
- Storage writes to IndexedDB are debounced at 400ms and guarded by an active transaction lock to prevent data races.

---

## Tech Stack

- **Runtime & UI:** React (Latest), TypeScript
- **Bundler:** Vite
- **Styling:** Tailwind CSS v4 (`@tailwindcss/vite`, CSS-first `@theme` design tokens)
- **Icons:** Lucide React
- **Storage:** Browser IndexedDB (Native transactional API)
- **Audio:** Browser Web Audio API (Hardware oscillators)
- **Package Manager:** pnpm

---

## Getting Started

### Prerequisites
- Node.js (v18.0.0 or higher recommended)
- pnpm (`corepack enable && corepack prepare pnpm@latest --activate`)

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/mmy-lana/pixel-art-studio.git
   cd pixel-art-studio
   ```

2. Install dependencies:
   ```bash
   pnpm install
   ```

3. Launch development server:
   ```bash
   pnpm run dev
   ```

4. Build production bundle:
   ```bash
   pnpm run build
   ```

---

## Project Structure

```
src/
├── app/                  # Application root shell and workbench assembly
├── assets/styles/        # Tailwind v4 theme directives and arcade surface CSS
├── components/
│   ├── primitives/       # Atomic arcade UI (ArcadeButton, ArcadeSlider, ArcadeModal)
│   ├── compound/         # Feature panels (ColorPickerPanel, LayerList, ToolsetPanel)
│   ├── domain/           # Canvas viewport, pixel raster, export dialogs
│   └── layout/           # Marquee header, workbench rails, mobile drawers
├── hooks/                # Canvas interaction, history buffer, audio synthesis hooks
├── store/                # Immutable editor and project persistence stores
├── types/                # Pure TypeScript domain interfaces
└── utils/                # Bresenham, flood fill, color conversion, and IDB storage clients
```

---

## License

MIT License. Free for personal, educational, and commercial usage.
