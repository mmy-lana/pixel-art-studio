/**
 * Colour conversion utilities.
 *
 * CANONICAL PACKING CONTRACT — every module in the application must agree on
 * this layout, including `compositeLayers` (Phase 4) and `pngExport` (Phase 5):
 *
 *   32-bit little-endian:  R(0-7) | G(8-15) | B(16-23) | A(24-31)
 *
 * Because the alpha byte occupies the most significant byte, the integer `0`
 * denotes a fully transparent pixel, which lets the compositor and the flood
 * fill treat `0` as "empty" with a single integer comparison.
 *
 * These helpers are intentionally platform-free (no DOM, no canvas) so they can
 * run in a worker, in Node, or in the browser without a shim.
 */

import type { PixelRgba, RgbColor } from '../../types';

/** Packed value of a fully transparent pixel. */
export const TRANSPARENT_PIXEL = 0;

/** Packed value of an opaque black pixel. */
export const OPAQUE_BLACK = 0xff000000;

/** Fully opaque alpha byte. */
export const OPAQUE_ALPHA = 255;

/** Raised when a colour string cannot be parsed. */
export class ColorParseError extends Error {
  public readonly input: string;

  public constructor(input: string) {
    super(
      `Invalid colour string "${input}". Expected #rgb, #rgba, #rrggbb or #rrggbbaa.`,
    );
    this.name = 'ColorParseError';
    this.input = input;
  }
}

/**
 * Clamps an arbitrary number to a valid 0-255 colour channel byte.
 *
 * Clamping stays monotonic for the extended reals (`+Infinity` clamps to 255,
 * `-Infinity` to 0). `NaN` has no ordering, so it falls back to 0.
 */
export function clampChannel(value: number): number {
  if (Number.isNaN(value)) {
    return 0;
  }

  const rounded = Math.round(value);

  if (rounded < 0) {
    return 0;
  }

  if (rounded > 255) {
    return 255;
  }

  return rounded;
}

/**
 * Packs straight (non-premultiplied) 8-bit channels into the canonical little
 * endian uint32 layout. Inputs outside 0-255 are clamped rather than wrapped.
 */
export function rgbaToUint32(r: number, g: number, b: number, a: number): number {
  return (
    ((clampChannel(a) & 0xff) << 24) |
    ((clampChannel(b) & 0xff) << 16) |
    ((clampChannel(g) & 0xff) << 8) |
    (clampChannel(r) & 0xff)
  );
}

/**
 * Unpacks a canonical little-endian uint32 into straight 8-bit channels.
 *
 * Uses unsigned shifts so negative JS numbers (produced by the `<< 24` above)
 * decode identically to values read back out of a `Uint32Array`.
 */
export function uint32ToRgba(value: number): PixelRgba {
  return {
    r: (value >>> 0) & 0xff,
    g: (value >>> 8) & 0xff,
    b: (value >>> 16) & 0xff,
    a: (value >>> 24) & 0xff,
  };
}

/** Two lowercase hex digits for a 0-255 byte. */
function toHexPair(byte: number): string {
  return clampChannel(byte).toString(16).padStart(2, '0');
}

/** Formats straight channels as a `#rrggbb` (alpha discarded) CSS string. */
export function rgbToHex(r: number, g: number, b: number): string {
  return `#${toHexPair(r)}${toHexPair(g)}${toHexPair(b)}`;
}

/** Formats straight channels as a `#rrggbbaa` CSS string. */
export function rgbaToHex8(rgba: PixelRgba): string {
  return `#${toHexPair(rgba.r)}${toHexPair(rgba.g)}${toHexPair(rgba.b)}${toHexPair(rgba.a)}`;
}

/** Formats straight channels as `rgba(r, g, b, a)` with alpha normalised to 0-1. */
export function rgbaToCssString(rgba: PixelRgba): string {
  const alpha = clampChannel(rgba.a) / 255;
  return `rgba(${clampChannel(rgba.r)}, ${clampChannel(rgba.g)}, ${clampChannel(rgba.b)}, ${Number(alpha.toFixed(4))})`;
}

/**
 * Parses `#rgb`, `#rgba`, `#rrggbb` or `#rrggbbaa` (the leading `#` is
 * optional) into straight 8-bit channels.
 *
 * @returns The parsed colour, or `null` when the input is not a valid colour.
 */
export function parseHexColor(hex: string): PixelRgba | null {
  if (typeof hex !== 'string') {
    return null;
  }

  const body = hex.trim().replace(/^#/, '');

  if (!/^[0-9a-f]+$/i.test(body)) {
    return null;
  }

  const expand = (char: string): number => parseInt(char + char, 16);

  switch (body.length) {
    case 3:
      return {
        r: expand(body[0]),
        g: expand(body[1]),
        b: expand(body[2]),
        a: OPAQUE_ALPHA,
      };
    case 4:
      return {
        r: expand(body[0]),
        g: expand(body[1]),
        b: expand(body[2]),
        a: expand(body[3]),
      };
    case 6:
      return {
        r: parseInt(body.slice(0, 2), 16),
        g: parseInt(body.slice(2, 4), 16),
        b: parseInt(body.slice(4, 6), 16),
        a: OPAQUE_ALPHA,
      };
    case 8:
      return {
        r: parseInt(body.slice(0, 2), 16),
        g: parseInt(body.slice(2, 4), 16),
        b: parseInt(body.slice(4, 6), 16),
        a: parseInt(body.slice(6, 8), 16),
      };
    default:
      return null;
  }
}

/** Type guard for colour strings accepted by `parseHexColor`. */
export function isValidHexColor(hex: string): boolean {
  return parseHexColor(hex) !== null;
}

/**
 * Parses a colour string, throwing `ColorParseError` when it is malformed.
 *
 * @param alphaOverride When supplied (0-255), replaces any alpha parsed from the
 * input. Used by the colour picker to apply an explicit opacity value.
 */
export function hexToRgba(hex: string, alphaOverride?: number): PixelRgba {
  const parsed = parseHexColor(hex);

  if (parsed === null) {
    throw new ColorParseError(hex);
  }

  if (typeof alphaOverride === 'number') {
    return { ...parsed, a: clampChannel(alphaOverride) };
  }

  return parsed;
}

/** Parses a colour string into straight RGB, discarding alpha. */
export function hexToRgb(hex: string): RgbColor {
  const { r, g, b } = hexToRgba(hex);
  return { r, g, b };
}

/**
 * Canonicalises a colour string to `#rrggbb`, or `#rrggbbaa` when the parsed
 * alpha is not fully opaque. Convenient as an `<input type="color">` value and as
 * an IndexedDB-safe normal form for palette swatches.
 */
export function normalizeHexColor(hex: string): string {
  const parsed = hexToRgba(hex);

  if (parsed.a === OPAQUE_ALPHA) {
    return rgbToHex(parsed.r, parsed.g, parsed.b);
  }

  return rgbaToHex8(parsed);
}

/** Packs a colour string directly into the canonical uint32 layout. */
export function hexToUint32(hex: string, alphaOverride?: number): number {
  const { r, g, b, a } = hexToRgba(hex, alphaOverride);
  return rgbaToUint32(r, g, b, a);
}

/** Unpacks a canonical uint32 into a `#rrggbb` string, discarding alpha. */
export function uint32ToHex(value: number): string {
  const { r, g, b } = uint32ToRgba(value);
  return rgbToHex(r, g, b);
}

/** Unpacks a canonical uint32 into a `#rrggbbaa` string. */
export function uint32ToHex8(value: number): string {
  return rgbaToHex8(uint32ToRgba(value));
}

/** Returns a copy of `rgba` with its alpha channel replaced. */
export function withAlphaChannel(rgba: PixelRgba, alpha: number): PixelRgba {
  return { ...rgba, a: clampChannel(alpha) };
}

/** Returns a copy of `rgba` with all channels clamped to 0-255. */
export function clampRgba(rgba: PixelRgba): PixelRgba {
  return {
    r: clampChannel(rgba.r),
    g: clampChannel(rgba.g),
    b: clampChannel(rgba.b),
    a: clampChannel(rgba.a),
  };
}

/** True when two colours are identical in all four straight channels. */
export function isSameRgba(a: PixelRgba, b: PixelRgba): boolean {
  return a.r === b.r && a.g === b.g && a.b === b.b && a.a === b.a;
}

/**
 * WCAG 2.1 relative luminance of a straight RGB colour.
 *
 * @returns A value in the 0 (black) to 1 (white) range.
 */
export function getRelativeLuminance(color: RgbColor): number {
  const channel = (value: number): number => {
    const scaled = clampChannel(value) / 255;
    return scaled <= 0.03928 ? scaled / 12.92 : ((scaled + 0.055) / 1.055) ** 2.4;
  };

  return (
    0.2126 * channel(color.r) + 0.7152 * channel(color.g) + 0.0722 * channel(color.b)
  );
}

/**
 * WCAG 2.1 contrast ratio between two colours.
 *
 * @returns A value in the 1 (identical) to 21 (black on white) range.
 */
export function getContrastRatio(a: RgbColor, b: RgbColor): number {
  const luminanceA = getRelativeLuminance(a);
  const luminanceB = getRelativeLuminance(b);

  const lighter = Math.max(luminanceA, luminanceB);
  const darker = Math.min(luminanceA, luminanceB);

  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * Chooses whichever of `lightHex` / `darkHex` reads more legibly on the supplied
 * background. Used by swatch grids and layer chips to keep labels readable
 * against arbitrary user colours.
 */
export function pickReadableTextColor(
  backgroundHex: string,
  lightHex: string = '#ffffff',
  darkHex: string = '#000000',
): string {
  const background = hexToRgb(backgroundHex);

  return getContrastRatio(background, hexToRgb(lightHex)) >=
    getContrastRatio(background, hexToRgb(darkHex))
    ? lightHex
    : darkHex;
}
