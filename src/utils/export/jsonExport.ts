/**
 * Project JSON interchange.
 *
 * This is the FILE format: self-contained, human-inspectable and portable
 * between machines. It is deliberately NOT the persistence path — IndexedDB
 * stores layers through structured clone (see `indexeddbClient`), and the reader
 * below is the only place in the codebase allowed to turn a serialized payload
 * back into a `Uint32Array`.
 *
 * Layer rasters are Base64-encoded raw bytes rather than number arrays: a 128x128
 * layer becomes ~87KB of text instead of ~1.3MB, and decoding is a single pass
 * over a `Uint8Array`.
 */

import type { BlendMode, PixelLayer, ProjectMetadata } from '../../types';
import { createEntityId } from '../id/createEntityId';

/** Discriminator written into every exported file. */
export const PROJECT_JSON_FORMAT = 'pixel-art-studio-project';

/** Current file schema version. */
export const PROJECT_JSON_VERSION = 1;

/** Layer entry inside an exported project file. */
export interface SerializedLayer {
  name: string;
  order: number;
  visible: boolean;
  locked: boolean;
  opacity: number;
  blendMode: BlendMode;
  /** Base64 of the layer's little-endian `Uint32Array` bytes. */
  dataBase64: string;
}

/** Shape of an exported project file. */
export interface SerializedProject {
  format: typeof PROJECT_JSON_FORMAT;
  version: number;
  exportedAt: number;
  project: {
    title: string;
    width: number;
    height: number;
    fps: number;
  };
  layers: SerializedLayer[];
}

/** Raised when an imported file is not a valid project payload. */
export class ProjectJsonError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = 'ProjectJsonError';
  }
}

const VALID_BLEND_MODES: readonly BlendMode[] = [
  'source-over',
  'multiply',
  'screen',
  'overlay',
  'darken',
  'lighten',
];

/** Base64-encodes a byte view without blowing the argument limit. */
function bytesToBase64(bytes: Uint8Array): string {
  const CHUNK = 0x8000;
  let binary = '';

  for (let offset = 0; offset < bytes.length; offset += CHUNK) {
    const slice = bytes.subarray(offset, offset + CHUNK);
    binary += String.fromCharCode(...slice);
  }

  return btoa(binary);
}

/** Decodes Base64 into bytes. */
function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes;
}

/**
 * Serializes a project and its layers.
 *
 * @throws {Error} When a layer buffer does not match the declared document size.
 */
export function serializeProjectToJson(
  project: ProjectMetadata,
  layers: readonly PixelLayer[],
): string {
  const expectedPixels = project.width * project.height;

  const payload: SerializedProject = {
    format: PROJECT_JSON_FORMAT,
    version: PROJECT_JSON_VERSION,
    exportedAt: Date.now(),
    project: {
      title: project.title,
      width: project.width,
      height: project.height,
      fps: project.fps,
    },
    layers: [...layers]
      .sort((a, b) => a.order - b.order)
      .map((layer) => {
        if (layer.data.length < expectedPixels) {
          throw new Error(
            `Layer "${layer.name}" holds ${layer.data.length} pixels but the document needs ${expectedPixels}.`,
          );
        }

        return {
          name: layer.name,
          order: layer.order,
          visible: layer.visible,
          locked: layer.locked,
          opacity: layer.opacity,
          blendMode: layer.blendMode,
          dataBase64: bytesToBase64(
            new Uint8Array(layer.data.buffer, layer.data.byteOffset, expectedPixels * 4),
          ),
        };
      }),
  };

  return JSON.stringify(payload, null, 2);
}

function requireNumber(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new ProjectJsonError(`Field "${field}" must be a finite number.`);
  }

  return value;
}

function requireBoolean(value: unknown, field: string): boolean {
  if (typeof value !== 'boolean') {
    throw new ProjectJsonError(`Field "${field}" must be a boolean.`);
  }

  return value;
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new ProjectJsonError(`Field "${field}" must be a non-empty string.`);
  }

  return value;
}

/**
 * Parses and validates an exported project file.
 *
 * Every structural field is checked before any buffer is allocated, so a
 * malformed or hostile file cannot produce a partially-loaded project.
 *
 * @returns Project metadata (with fresh ids) and validated layers whose buffers
 * are live `Uint32Array`s sized to the document.
 * @throws {ProjectJsonError} When the payload is not a valid project file.
 */
export function parseProjectJson(json: string): {
  project: ProjectMetadata;
  layers: PixelLayer[];
} {
  let parsed: unknown;

  try {
    parsed = JSON.parse(json);
  } catch {
    throw new ProjectJsonError('That file is not valid JSON.');
  }

  if (typeof parsed !== 'object' || parsed === null) {
    throw new ProjectJsonError('That file does not contain a project object.');
  }

  const candidate = parsed as Partial<SerializedProject>;

  if (candidate.format !== PROJECT_JSON_FORMAT) {
    throw new ProjectJsonError(
      `Unrecognised file format "${String(candidate.format)}". Expected "${PROJECT_JSON_FORMAT}".`,
    );
  }

  if (typeof candidate.version !== 'number' || candidate.version > PROJECT_JSON_VERSION) {
    throw new ProjectJsonError(
      `File version ${String(candidate.version)} is newer than this studio supports (${PROJECT_JSON_VERSION}).`,
    );
  }

  if (typeof candidate.project !== 'object' || candidate.project === null) {
    throw new ProjectJsonError('The file is missing its project header.');
  }

  const header = candidate.project;
  const width = Math.round(requireNumber(header.width, 'project.width'));
  const height = Math.round(requireNumber(header.height, 'project.height'));

  if (width < 1 || height < 1 || width > 1024 || height > 1024) {
    throw new ProjectJsonError(
      `Canvas size ${width}x${height} is outside the supported 1x1 to 1024x1024 range.`,
    );
  }

  if (!Array.isArray(candidate.layers) || candidate.layers.length === 0) {
    throw new ProjectJsonError('The file contains no layers.');
  }

  const now = Date.now();
  const projectId = createEntityId();
  const expectedBytes = width * height * 4;

  const layers = candidate.layers.map((entry, index): PixelLayer => {
    const layer = entry as Partial<SerializedLayer>;

    const name = requireString(layer.name, `layers[${index}].name`);

    if (typeof layer.dataBase64 !== 'string') {
      throw new ProjectJsonError(`Layer "${name}" is missing its pixel data.`);
    }

    let bytes: Uint8Array;

    try {
      bytes = base64ToBytes(layer.dataBase64);
    } catch {
      throw new ProjectJsonError(`Layer "${name}" has malformed Base64 pixel data.`);
    }

    if (bytes.byteLength !== expectedBytes) {
      throw new ProjectJsonError(
        `Layer "${name}" carries ${bytes.byteLength} bytes but ${width}x${height} needs ${expectedBytes}.`,
      );
    }

    const blendMode = layer.blendMode;

    if (typeof blendMode !== 'string' || !VALID_BLEND_MODES.includes(blendMode as BlendMode)) {
      throw new ProjectJsonError(`Layer "${name}" has an unsupported blend mode.`);
    }

    const opacity = requireNumber(layer.opacity, `layers[${index}].opacity`);

    if (opacity < 0 || opacity > 1) {
      throw new ProjectJsonError(`Layer "${name}" has an opacity outside 0..1.`);
    }

    const order = Math.round(requireNumber(layer.order, `layers[${index}].order`));

    // The explicit byteOffset/length copy guarantees an aligned, buffer-backed
    // Uint32Array even if the decoded view happens to be offset.
    const data = new Uint32Array(width * height);
    new Uint8Array(data.buffer).set(bytes);

    return {
      id: createEntityId(),
      projectId,
      name,
      order: order < 0 ? 0 : order,
      visible: requireBoolean(layer.visible, `layers[${index}].visible`),
      locked: requireBoolean(layer.locked, `layers[${index}].locked`),
      opacity,
      blendMode: blendMode as BlendMode,
      data,
      createdAt: now,
      updatedAt: now,
    };
  });

  return {
    project: {
      id: projectId,
      title: requireString(header.title, 'project.title'),
      width,
      height,
      fps: Math.max(1, Math.round(requireNumber(header.fps, 'project.fps'))),
      createdAt: now,
      updatedAt: now,
      thumbnailUrl: null,
    },
    // Re-order sequentially so imported stacks are always contiguous.
    layers: layers
      .sort((a, b) => a.order - b.order)
      .map((layer, index) => (layer.order === index ? layer : { ...layer, order: index })),
  };
}
