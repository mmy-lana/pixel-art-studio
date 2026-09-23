/**
 * Entity identifier factory.
 *
 * Every persisted entity (`ProjectMetadata`, `PixelLayer`, `CanvasHistoryRecord`,
 * custom `ColorPalette`) receives its `id` from this module so that identifier
 * generation has exactly one implementation.
 */

/** Matches the canonical UUID v4 textual form, case-insensitive. */
const UUID_V4_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Cache the resolved implementation so the feature probe runs at most once. */
let uuidImplementation: (() => string) | null | undefined;

function resolveUuidImplementation(): (() => string) | null {
  if (uuidImplementation !== undefined) {
    return uuidImplementation;
  }

  if (typeof globalThis.crypto === 'undefined') {
    uuidImplementation = null;
    return uuidImplementation;
  }

  const { crypto } = globalThis;

  // Preferred path: WebCrypto's RFC 4122 UUID v4 generator. Available in all
  // secure contexts (https + localhost) and in every modern browser runtime.
  if (typeof crypto.randomUUID === 'function') {
    uuidImplementation = () => crypto.randomUUID();
    return uuidImplementation;
  }

  // Fallback path: `randomUUID` is unavailable in insecure contexts on some
  // engines, but `getRandomValues` still is. Build a spec-compliant v4 UUID by
  // masking the version and variant bits by hand.
  if (typeof crypto.getRandomValues === 'function') {
    uuidImplementation = () => {
      const bytes = crypto.getRandomValues(new Uint8Array(16));
      bytes[6] = (bytes[6] & 0x0f) | 0x40; // version 4
      bytes[8] = (bytes[8] & 0x3f) | 0x80; // variant 10xx

      let hex = '';
      for (let i = 0; i < 16; i += 1) {
        hex += bytes[i].toString(16).padStart(2, '0');
      }

      return [
        hex.slice(0, 8),
        hex.slice(8, 12),
        hex.slice(12, 16),
        hex.slice(16, 20),
        hex.slice(20, 32),
      ].join('-');
    };
    return uuidImplementation;
  }

  uuidImplementation = null;
  return uuidImplementation;
}

/**
 * Creates a collision-resistant unique identifier (UUID v4).
 *
 * @throws {Error} When the runtime exposes no cryptographic randomness source.
 * In that environment persistence cannot be made reliable, so failing loudly is
 * preferable to silently emitting non-unique ids.
 */
export function createEntityId(): string {
  const implementation = resolveUuidImplementation();

  if (implementation === null) {
    throw new Error(
      'createEntityId: no cryptographic random source is available on this runtime. ' +
        'A secure context with window.crypto is required to generate entity ids.',
    );
  }

  return implementation();
}

/** Narrows an arbitrary value to a well-formed UUID v4 identifier string. */
export function isEntityId(value: unknown): value is string {
  return typeof value === 'string' && UUID_V4_PATTERN.test(value);
}

/**
 * Returns a stable, human-readable id derived from a name, suffixed with a
 * short random token. Used for deterministic seed ids (shipped presets) where a
 * readable identifier is more valuable than full UUID entropy, while still
 * guaranteeing uniqueness across regenerations.
 */
export function createSlugId(seed: string): string {
  const slug =
    seed
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || 'item';

  return `${slug}-${createEntityId().slice(0, 8)}`;
}
