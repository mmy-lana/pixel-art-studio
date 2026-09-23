/**
 * PNG export pipeline (plan.md §3.7).
 *
 * Exports are produced at exact nearest-neighbour scale from the same
 * `compositeLayers` buffer the editor renders, so what the user downloads is
 * pixel-for-pixel what they saw.
 */

import type { PixelLayer } from '../../types';
import { compositeLayers } from '../algorithms/compositor';
import { normalizeHexColor } from '../color/colorConvert';

/** Scale factors offered by the export dialog. */
export const EXPORT_SCALE_FACTORS = [1, 2, 4, 8, 16, 32] as const;

/** One of the supported integer scale factors. */
export type ExportScaleFactor = (typeof EXPORT_SCALE_FACTORS)[number];

/** Grid layout options for the tile-sheet exporter. */
export const SPRITESHEET_LAYOUTS = [1, 2, 3, 4, 6, 8] as const;

/**
 * Renders the visible layers into a `canvas` at document resolution.
 *
 * @throws {Error} When a 2D context cannot be allocated.
 */
function renderDocumentToCanvas(
  layers: readonly PixelLayer[],
  width: number,
  height: number,
): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext('2d');

  if (!context) {
    throw new Error('Canvas 2D context creation failed while preparing the export.');
  }

  const composite = compositeLayers(layers, width, height);
  context.putImageData(new ImageData(composite, width, height), 0, 0);

  return canvas;
}

/** Converts a canvas to a PNG blob. */
function canvasToPngBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) {
        resolve(blob);
        return;
      }

      reject(new Error('PNG Blob generation returned null.'));
    }, 'image/png');
  });
}

/**
 * Exports the composited document as a scaled PNG.
 *
 * @param layers Layers in any order; the compositor sorts by `order`.
 * @param width Document width in pixels.
 * @param height Document height in pixels.
 * @param scaleFactor Integer magnification (1-32).
 * @param includeBackground When true the image is flattened onto
 * `backgroundColorHex`; when false the PNG keeps its alpha channel.
 * @param backgroundColorHex Background colour, ignored when transparency is kept.
 * @returns The encoded PNG.
 * @throws {Error} When `scaleFactor` is not a positive integer or the context
 * cannot be allocated.
 */
export async function exportToPNG(
  layers: readonly PixelLayer[],
  width: number,
  height: number,
  scaleFactor: number,
  includeBackground: boolean,
  backgroundColorHex: string = '#000000',
): Promise<Blob> {
  if (!Number.isInteger(scaleFactor) || scaleFactor < 1) {
    throw new Error(`exportToPNG: scaleFactor must be a positive integer, received ${scaleFactor}.`);
  }

  const exportCanvas = document.createElement('canvas');
  exportCanvas.width = width * scaleFactor;
  exportCanvas.height = height * scaleFactor;

  const context = exportCanvas.getContext('2d');

  if (!context) {
    throw new Error('Canvas 2D context creation failed during export.');
  }

  // Nearest-neighbour magnification: no smoothing, no half-pixel bleed.
  context.imageSmoothingEnabled = false;

  if (includeBackground) {
    context.fillStyle = normalizeHexColor(backgroundColorHex).slice(0, 7);
    context.fillRect(0, 0, exportCanvas.width, exportCanvas.height);
  }

  context.drawImage(
    renderDocumentToCanvas(layers, width, height),
    0,
    0,
    width,
    height,
    0,
    0,
    exportCanvas.width,
    exportCanvas.height,
  );

  return canvasToPngBlob(exportCanvas);
}

export interface SpritesheetExportOptions {
  layers: readonly PixelLayer[];
  width: number;
  height: number;
  /** Cells per row. */
  columns: number;
  /** Cell rows. */
  rows: number;
  /** Integer magnification of each tile. */
  scaleFactor: number;
  /** Blank pixels inserted between tiles, also at the outer edges. */
  padding: number;
  includeBackground: boolean;
  backgroundColorHex: string;
}

/**
 * Exports the composited document tiled into a `columns x rows` sheet.
 *
 * The studio edits a single frame, so a sheet is the same sprite repeated across
 * the grid — the layout game engines expect for tile and placeholder atlases.
 * Padding is applied on every side, including the outer edge, so the first tile
 * is never flush against texture coordinates 0,0.
 *
 * @returns The encoded PNG sheet.
 * @throws {Error} When any grid dimension is invalid or the context fails.
 */
export async function exportSpritesheet(options: SpritesheetExportOptions): Promise<Blob> {
  const {
    layers,
    width,
    height,
    columns,
    rows,
    scaleFactor,
    padding,
    includeBackground,
    backgroundColorHex,
  } = options;

  if (!Number.isInteger(columns) || columns < 1 || !Number.isInteger(rows) || rows < 1) {
    throw new Error('exportSpritesheet: columns and rows must be positive integers.');
  }

  if (!Number.isInteger(scaleFactor) || scaleFactor < 1) {
    throw new Error('exportSpritesheet: scaleFactor must be a positive integer.');
  }

  if (!Number.isInteger(padding) || padding < 0) {
    throw new Error('exportSpritesheet: padding must be a non-negative integer.');
  }

  const tileWidth = width * scaleFactor;
  const tileHeight = height * scaleFactor;

  const sheetCanvas = document.createElement('canvas');
  sheetCanvas.width = columns * tileWidth + padding * (columns + 1);
  sheetCanvas.height = rows * tileHeight + padding * (rows + 1);

  const context = sheetCanvas.getContext('2d');

  if (!context) {
    throw new Error('Canvas 2D context creation failed during spritesheet export.');
  }

  context.imageSmoothingEnabled = false;

  if (includeBackground) {
    context.fillStyle = normalizeHexColor(backgroundColorHex).slice(0, 7);
    context.fillRect(0, 0, sheetCanvas.width, sheetCanvas.height);
  }

  const documentCanvas = renderDocumentToCanvas(layers, width, height);

  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      context.drawImage(
        documentCanvas,
        0,
        0,
        width,
        height,
        padding + column * (tileWidth + padding),
        padding + row * (tileHeight + padding),
        tileWidth,
        tileHeight,
      );
    }
  }

  return canvasToPngBlob(sheetCanvas);
}

/**
 * Renders the document into a Base64 PNG Data URL.
 *
 * Used for project thumbnails, which are persisted as standard Data URL strings
 * (the only string form IndexedDB accepts for a preview image).
 *
 * @returns The Data URL, or `null` when encoding failed.
 */
export async function exportThumbnailDataUrl(
  layers: readonly PixelLayer[],
  width: number,
  height: number,
  maxSize: number = 128,
): Promise<string | null> {
  try {
    const scale = Math.max(1, Math.floor(maxSize / Math.max(width, height)));
    const canvas = document.createElement('canvas');
    canvas.width = width * scale;
    canvas.height = height * scale;

    const context = canvas.getContext('2d');

    if (!context) {
      return null;
    }

    context.imageSmoothingEnabled = false;
    context.drawImage(
      renderDocumentToCanvas(layers, width, height),
      0,
      0,
      width,
      height,
      0,
      0,
      canvas.width,
      canvas.height,
    );

    const dataUrl = canvas.toDataURL('image/png');

    return dataUrl.startsWith('data:image/png;base64,') ? dataUrl : null;
  } catch {
    // Thumbnails are a convenience; a failure must never block a save.
    return null;
  }
}

/** Turns a project title into a safe download filename stem. */
export function sanitizeFilename(title: string): string {
  const slug = title
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);

  return slug.length > 0 ? slug : 'pixel-art';
}

/** Triggers a browser download for a blob. */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);

  try {
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.rel = 'noopener';
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  } finally {
    // Revoke on the next task so the click has been dispatched.
    window.setTimeout(() => {
      URL.revokeObjectURL(url);
    }, 0);
  }
}

/** Triggers a browser download for a UTF-8 text payload. */
export function downloadTextFile(contents: string, filename: string, mimeType: string): void {
  downloadBlob(new Blob([contents], { type: `${mimeType};charset=utf-8` }), filename);
}
