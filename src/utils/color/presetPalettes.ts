/**
 * Shipped retro colour palettes.
 *
 * DESIGN NOTE ON IDS: runtime entities (projects, layers, custom palettes,
 * history records) derive their ids from `createEntityId()` / `crypto.randomUUID()`.
 * The presets below are *static seed data*, so they use deterministic,
 * human-readable ids instead: `activePaletteId` is persisted in project
 * preferences and must resolve to the same preset across reloads and across
 * client versions. Swatch ids are derived from their palette id plus index for
 * the same reason.
 */

import type { ColorPalette, PaletteColor } from '../../types';
import { createEntityId } from '../id/createEntityId';
import { isValidHexColor, normalizeHexColor } from './colorConvert';

/** `[hex, displayName]` tuple used to declare a preset compactly. */
type PaletteSeedEntry = readonly [hex: string, name: string];

interface PaletteSeed {
  id: string;
  name: string;
  entries: readonly PaletteSeedEntry[];
}

/**
 * NES (Ricoh 2C02) hardware palette.
 *
 * The 64 hardware entries contain 8 redundant black slots ($0E/$0F, $1E/$1F,
 * $2E/$2F, $3E/$3F); those are omitted, leaving the 56 addressable colours.
 * $0D and $1D are both black on real hardware and are intentionally kept as
 * separate entries so indices stay aligned with the hardware table.
 */
const NES_ENTRIES: readonly PaletteSeedEntry[] = [
  ['#7c7c7c', 'NES $00'],
  ['#0000fc', 'NES $01'],
  ['#0000bc', 'NES $02'],
  ['#4428bc', 'NES $03'],
  ['#940084', 'NES $04'],
  ['#a80020', 'NES $05'],
  ['#a81000', 'NES $06'],
  ['#881400', 'NES $07'],
  ['#503000', 'NES $08'],
  ['#007800', 'NES $09'],
  ['#006800', 'NES $0A'],
  ['#005800', 'NES $0B'],
  ['#004058', 'NES $0C'],
  ['#000000', 'NES $0D'],
  ['#bcbcbc', 'NES $10'],
  ['#0078f8', 'NES $11'],
  ['#0058f8', 'NES $12'],
  ['#6844fc', 'NES $13'],
  ['#d800cc', 'NES $14'],
  ['#e40058', 'NES $15'],
  ['#f83800', 'NES $16'],
  ['#e45c10', 'NES $17'],
  ['#ac7c00', 'NES $18'],
  ['#00b800', 'NES $19'],
  ['#00a800', 'NES $1A'],
  ['#00a844', 'NES $1B'],
  ['#008888', 'NES $1C'],
  ['#000000', 'NES $1D'],
  ['#f8f8f8', 'NES $20'],
  ['#3cbcfc', 'NES $21'],
  ['#6888fc', 'NES $22'],
  ['#9878f8', 'NES $23'],
  ['#f878f8', 'NES $24'],
  ['#f85898', 'NES $25'],
  ['#f87858', 'NES $26'],
  ['#fca044', 'NES $27'],
  ['#f8b800', 'NES $28'],
  ['#b8f818', 'NES $29'],
  ['#58d854', 'NES $2A'],
  ['#58f898', 'NES $2B'],
  ['#00e8d8', 'NES $2C'],
  ['#787878', 'NES $2D'],
  ['#fcfcfc', 'NES $30'],
  ['#a4e4fc', 'NES $31'],
  ['#b8b8f8', 'NES $32'],
  ['#d8b8f8', 'NES $33'],
  ['#f8b8f8', 'NES $34'],
  ['#f8a4c0', 'NES $35'],
  ['#f0d0b0', 'NES $36'],
  ['#fce0a8', 'NES $37'],
  ['#f8d878', 'NES $38'],
  ['#d8f878', 'NES $39'],
  ['#b8f8b8', 'NES $3A'],
  ['#b8f8d8', 'NES $3B'],
  ['#00fcfc', 'NES $3C'],
  ['#f8d8f8', 'NES $3D'],
];

/** Game Boy DMG — four shades of the original reflective LCD. */
const GAME_BOY_ENTRIES: readonly PaletteSeedEntry[] = [
  ['#0f380f', 'Darkest'],
  ['#306230', 'Dark'],
  ['#8bac0f', 'Light'],
  ['#9bbc0f', 'Lightest'],
];

/** PICO-8 — the fantasy-console 16 colour palette. */
const PICO_8_ENTRIES: readonly PaletteSeedEntry[] = [
  ['#000000', 'Black'],
  ['#1d2b53', 'Dark Blue'],
  ['#7e2553', 'Dark Purple'],
  ['#008751', 'Dark Green'],
  ['#ab5236', 'Brown'],
  ['#5f574f', 'Dark Grey'],
  ['#c2c3c7', 'Light Grey'],
  ['#fff1e8', 'White'],
  ['#ff004d', 'Red'],
  ['#ffa300', 'Orange'],
  ['#ffec27', 'Yellow'],
  ['#00e436', 'Green'],
  ['#29adff', 'Blue'],
  ['#83769c', 'Indigo'],
  ['#ff77a8', 'Pink'],
  ['#ffccaa', 'Peach'],
];

/** Commodore 64 VIC-II — the "Pepto" calibrated 16 colour set. */
const COMMODORE_64_ENTRIES: readonly PaletteSeedEntry[] = [
  ['#000000', 'Black'],
  ['#ffffff', 'White'],
  ['#880000', 'Red'],
  ['#aaffee', 'Cyan'],
  ['#cc44cc', 'Purple'],
  ['#00cc55', 'Green'],
  ['#0000aa', 'Blue'],
  ['#eeee77', 'Yellow'],
  ['#dd8855', 'Orange'],
  ['#664400', 'Brown'],
  ['#ff7777', 'Light Red'],
  ['#333333', 'Dark Grey'],
  ['#777777', 'Grey'],
  ['#aaff66', 'Light Green'],
  ['#0088ff', 'Light Blue'],
  ['#bbbbbb', 'Light Grey'],
];

/** Cyberpunk neon — authored high-saturation ramp for synthwave sprites. */
const CYBERPUNK_ENTRIES: readonly PaletteSeedEntry[] = [
  ['#0d0221', 'Night City Black'],
  ['#190a33', 'Deep Void'],
  ['#2a1b4a', 'Toxic Plum'],
  ['#3f2b6b', 'Ultraviolet'],
  ['#5c2e91', 'Ion Violet'],
  ['#7b2ff7', 'Electric Indigo'],
  ['#b026ff', 'Hot Magenta'],
  ['#ff2a6d', 'Blood Neon'],
  ['#ff5e5b', 'Laser Coral'],
  ['#ff9f1c', 'Arcade Amber'],
  ['#ffd400', 'Holo Yellow'],
  ['#05ffa1', 'Data Mint'],
  ['#00f5d4', 'Glitch Teal'],
  ['#00e5ff', 'Cryo Cyan'],
  ['#05d9e8', 'Razor Blue'],
  ['#f8f8f2', 'Ghost White'],
];

const PALETTE_SEEDS: readonly PaletteSeed[] = [
  { id: 'preset-nes', name: 'NES', entries: NES_ENTRIES },
  { id: 'preset-game-boy', name: 'Game Boy', entries: GAME_BOY_ENTRIES },
  { id: 'preset-pico-8', name: 'PICO-8', entries: PICO_8_ENTRIES },
  { id: 'preset-commodore-64', name: 'Commodore 64', entries: COMMODORE_64_ENTRIES },
  { id: 'preset-cyberpunk', name: 'Cyberpunk Neon', entries: CYBERPUNK_ENTRIES },
];

/** Palette selected for a brand new project. */
export const DEFAULT_PALETTE_ID = 'preset-pico-8';

function buildPalette(seed: PaletteSeed): ColorPalette {
  return {
    id: seed.id,
    name: seed.name,
    isCustom: false,
    colors: seed.entries.map((entry, index): PaletteColor => ({
      id: `${seed.id}-${index}`,
      hex: normalizeHexColor(entry[0]),
      name: entry[1],
    })),
  };
}

/**
 * The shipped palettes, in display order. Frozen so no consumer can mutate the
 * seed data that other modules share by reference.
 */
export const PRESET_PALETTES: readonly ColorPalette[] = Object.freeze(
  PALETTE_SEEDS.map(buildPalette),
);

/** Returns a preset palette by id, or `undefined` when the id is unknown. */
export function getPresetPaletteById(paletteId: string): ColorPalette | undefined {
  return PRESET_PALETTES.find((palette) => palette.id === paletteId);
}

/**
 * Resolves an id against custom palettes first, then presets.
 *
 * @returns The matching palette, or the default preset when the id is unknown —
 * a stale `activePaletteId` loaded from storage must never leave the UI without
 * a palette to render.
 */
export function resolvePaletteById(
  paletteId: string,
  customPalettes: readonly ColorPalette[] = [],
): ColorPalette {
  const custom = customPalettes.find((palette) => palette.id === paletteId);

  if (custom) {
    return custom;
  }

  const preset = getPresetPaletteById(paletteId);

  if (preset) {
    return preset;
  }

  const fallback = getPresetPaletteById(DEFAULT_PALETTE_ID);

  if (!fallback) {
    throw new Error(
      `resolvePaletteById: default palette "${DEFAULT_PALETTE_ID}" is missing from PRESET_PALETTES.`,
    );
  }

  return fallback;
}

/**
 * Builds a user-authored palette from a list of colour strings.
 *
 * @throws {Error} When `name` is blank or any entry is not a valid colour
 * string. Callers validate interactively with `isValidHexColor` to surface
 * inline field errors before reaching this point.
 */
export function createCustomPalette(name: string, hexColors: readonly string[]): ColorPalette {
  const trimmedName = name.trim();

  if (trimmedName.length === 0) {
    throw new Error('createCustomPalette: a palette name is required.');
  }

  if (hexColors.length === 0) {
    throw new Error('createCustomPalette: at least one colour is required.');
  }

  const colors = hexColors.map((hex, index): PaletteColor => {
    let normalized: string;

    try {
      normalized = normalizeHexColor(hex);
    } catch {
      throw new Error(
        `createCustomPalette: entry ${index + 1} ("${hex}") is not a valid colour string.`,
      );
    }

    return {
      id: createEntityId(),
      hex: normalized,
      name: `Swatch ${index + 1}`,
    };
  });

  return {
    id: createEntityId(),
    name: trimmedName,
    colors,
    isCustom: true,
  };
}

/** Result of parsing a pasted palette hex list. */
export interface ParsedHexList {
  /** Canonicalised, de-duplicated colours, in input order. */
  hexes: string[];
  /** Entries that were not valid colour strings, in input order. */
  invalid: string[];
  /** Entries that parsed but repeated an earlier colour. */
  duplicates: number;
}

/**
 * Parses a loose list of colour strings (hex list export, or text pasted from
 * another editor) into canonical `#rrggbb` / `#rrggbbaa` values.
 *
 * Entries may be separated by commas, whitespace or newlines, and the leading
 * `#` is optional. Invalid entries are reported rather than silently dropped so
 * the palette editor can show exactly what it could not read.
 */
export function parseHexList(input: string): ParsedHexList {
  const rawEntries = input
    .split(/[\s,;]+/)
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);

  const hexes: string[] = [];
  const invalid: string[] = [];
  const seen = new Set<string>();
  let duplicates = 0;

  for (const entry of rawEntries) {
    if (!isValidHexColor(entry)) {
      invalid.push(entry);
      continue;
    }

    const normalized = normalizeHexColor(entry);

    if (seen.has(normalized)) {
      duplicates += 1;
      continue;
    }

    seen.add(normalized);
    hexes.push(normalized);
  }

  return { hexes, invalid, duplicates };
}

/** Serialises a palette (or bare list of colour strings) into a hex list. */
export function serializeHexList(
  colors: readonly PaletteColor[] | readonly string[],
): string {
  return colors
    .map((color) => (typeof color === 'string' ? normalizeHexColor(color) : color.hex))
    .join('\n');
}
