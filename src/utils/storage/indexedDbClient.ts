/**
 * IndexedDB persistence client.
 *
 * SCHEMA
 *   database : "pixel-art-studio" (version 1)
 *   store    : "projects"        keyPath "id"
 *   store    : "project_layers"  keyPath "id", index "by_project" -> "projectId"
 *
 * BUFFER FIDELITY RULE
 * Layer raster data is stored and retrieved as raw `Uint32Array` values through
 * IndexedDB's structured clone. `JSON.stringify` / `JSON.parse` must NEVER touch
 * a layer buffer: JSON has no typed-array representation, so a round trip
 * through JSON silently degrades a `Uint32Array` into `{"0":0,"1":4278190080,...}`
 * — a plain object that is no longer a valid buffer. Every read therefore
 * performs the runtime guard `record.data instanceof Uint32Array` and rejects
 * anything else with `IndexedDbError("invalid-record")`.
 */

import type {
  BlendMode,
  IndexedDbErrorCode,
  IndexedDbStoreName,
  PixelLayer,
  ProjectMetadata,
  StorageUsageEstimate,
} from '../../types';

/** Database name shared by every store in this application. */
export const DATABASE_NAME = 'pixel-art-studio';

/** Schema version. Increment only together with an upgrade path in `upgradeSchema`. */
export const DATABASE_VERSION = 1;

/** Object store holding one `ProjectMetadata` record per project. */
export const PROJECT_STORE_NAME: IndexedDbStoreName = 'projects';

/** Object store holding one `PixelLayer` record per layer. */
export const LAYER_STORE_NAME: IndexedDbStoreName = 'project_layers';

/** Index on `project_layers.projectId` used to query a project's layers. */
export const LAYER_PROJECT_INDEX = 'by_project';

/** Matches the Base64 image Data URL form used for project thumbnails. */
export const THUMBNAIL_DATA_URL_PATTERN =
  /^data:image\/(?:png|jpeg|jpg|webp|gif);base64,[A-Za-z0-9+/]+={0,2}$/;

/** Transaction modes used by this client (schema upgrades are handled internally). */
type DataTransactionMode = 'readonly' | 'readwrite';

/** Every blend mode accepted by `PixelLayer.blendMode`, used for validation. */
const VALID_BLEND_MODES: readonly BlendMode[] = [
  'source-over',
  'multiply',
  'screen',
  'overlay',
  'darken',
  'lighten',
];

/**
 * Typed persistence failure.
 *
 * Callers switch on `code` to render precise error states (e.g. a private-mode
 * browser reporting `unsupported`, or a storage-full workspace reporting
 * `quota-exceeded`) instead of pattern-matching on message strings.
 */
export class IndexedDbError extends Error {
  public readonly code: IndexedDbErrorCode;

  public constructor(code: IndexedDbErrorCode, message: string, cause?: unknown) {
    super(message, cause === undefined ? undefined : { cause });
    this.name = 'IndexedDbError';
    this.code = code;
  }
}

/* ------------------------------------------------------------------ *
 * Environment probing
 * ------------------------------------------------------------------ */

/**
 * Reports whether a usable IndexedDB implementation is reachable. Accessing
 * `indexedDB` can itself throw in hardened/private browsing modes, so the probe
 * is defensive.
 */
export function isIndexedDbAvailable(): boolean {
  try {
    return typeof globalThis.indexedDB !== 'undefined' && globalThis.indexedDB !== null;
  } catch {
    return false;
  }
}

/** True when a string is a Base64 image Data URL suitable for `thumbnailUrl`. */
export function isBase64ImageDataUrl(value: unknown): value is string {
  return typeof value === 'string' && THUMBNAIL_DATA_URL_PATTERN.test(value);
}

function isQuotaExceededError(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) {
    return false;
  }

  const candidate = error as { name?: unknown };

  return (
    candidate.name === 'QuotaExceededError' ||
    candidate.name === 'NS_ERROR_DOM_QUOTA_REACHED'
  );
}

function toIndexedDbError(
  error: unknown,
  fallbackMessage: string,
): IndexedDbError {
  if (error instanceof IndexedDbError) {
    return error;
  }

  if (isQuotaExceededError(error)) {
    return new IndexedDbError(
      'quota-exceeded',
      'Browser storage quota exceeded. Delete unused projects to free space.',
      error,
    );
  }

  if (error instanceof Error && error.message.trim().length > 0) {
    return new IndexedDbError('transaction-failed', `${fallbackMessage} (${error.message})`, error);
  }

  return new IndexedDbError('transaction-failed', fallbackMessage, error);
}

/* ------------------------------------------------------------------ *
 * Connection management
 * ------------------------------------------------------------------ */

let databasePromise: Promise<IDBDatabase> | null = null;

function upgradeSchema(database: IDBDatabase): void {
  if (!database.objectStoreNames.contains(PROJECT_STORE_NAME)) {
    database.createObjectStore(PROJECT_STORE_NAME, { keyPath: 'id' });
  }

  if (!database.objectStoreNames.contains(LAYER_STORE_NAME)) {
    const layerStore = database.createObjectStore(LAYER_STORE_NAME, { keyPath: 'id' });
    layerStore.createIndex(LAYER_PROJECT_INDEX, 'projectId', { unique: false });
  }
}

/**
 * Opens (and caches) the shared database connection.
 *
 * The connection is closed automatically when another tab requests a schema
 * upgrade, and the cached promise is dropped so the next call reconnects at the
 * newer version.
 */
export function openDatabase(): Promise<IDBDatabase> {
  if (databasePromise) {
    return databasePromise;
  }

  const pending = new Promise<IDBDatabase>((resolve, reject) => {
    if (!isIndexedDbAvailable()) {
      reject(
        new IndexedDbError(
          'unsupported',
          'IndexedDB is unavailable in this environment, so projects cannot be saved locally.',
        ),
      );
      return;
    }

    let request: IDBOpenDBRequest;

    try {
      request = globalThis.indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    } catch (error) {
      reject(
        new IndexedDbError(
          'open-failed',
          `Opening the "${DATABASE_NAME}" database threw an exception.`,
          error,
        ),
      );
      return;
    }

    request.onupgradeneeded = () => {
      upgradeSchema(request.result);
    };

    request.onsuccess = () => {
      const database = request.result;

      database.onversionchange = () => {
        database.close();
        databasePromise = null;
      };

      resolve(database);
    };

    request.onerror = () => {
      reject(
        new IndexedDbError(
          'open-failed',
          `Could not open the "${DATABASE_NAME}" database.`,
          request.error,
        ),
      );
    };

    request.onblocked = () => {
      reject(
        new IndexedDbError(
          'blocked',
          'Another tab is holding an older version of the workspace database open. Close it and retry.',
        ),
      );
    };
  }).catch((error: unknown) => {
    databasePromise = null;
    throw error instanceof IndexedDbError
      ? error
      : new IndexedDbError('open-failed', 'Database connection failed.', error);
  });

  databasePromise = pending;

  return pending;
}

/**
 * Closes the cached connection. Used when tearing the app down and by tests; the
 * next data call transparently reconnects.
 */
export function closeDatabase(): void {
  const current = databasePromise;
  databasePromise = null;

  if (!current) {
    return;
  }

  void current
    .then((database) => {
      database.close();
    })
    .catch(() => {
      // The connection never opened; there is nothing to close.
    });
}

/* ------------------------------------------------------------------ *
 * Request / transaction plumbing
 * ------------------------------------------------------------------ */

function requestToPromise<T>(request: IDBRequest<T>, operationName: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => {
      resolve(request.result);
    };

    request.onerror = () => {
      reject(toIndexedDbError(request.error, `Request failed during ${operationName}.`));
    };
  });
}

/**
 * Runs `executor` inside a single transaction and resolves only once the
 * transaction has committed.
 *
 * The executor must await only IndexedDB request promises: those resolve as
 * microtasks inside the success event's task, which keeps the transaction alive.
 * Yielding to a macrotask (timers, fetch, `requestIdleCallback`) would let the
 * transaction auto-commit early, so callers must not do that here.
 */
async function runTransaction<T>(
  storeNames: readonly IndexedDbStoreName[],
  mode: DataTransactionMode,
  operationName: string,
  executor: (transaction: IDBTransaction) => Promise<T>,
): Promise<T> {
  const database = await openDatabase();

  let transaction: IDBTransaction;

  try {
    transaction = database.transaction([...storeNames], mode);
  } catch (error) {
    throw toIndexedDbError(error, `Could not start the ${operationName} transaction.`);
  }

  const completion = new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => {
      resolve();
    };

    transaction.onabort = () => {
      reject(toIndexedDbError(transaction.error, `The ${operationName} transaction was aborted.`));
    };

    transaction.onerror = () => {
      reject(toIndexedDbError(transaction.error, `The ${operationName} transaction failed.`));
    };
  });

  // The executor may reject first; keep the completion promise from surfacing as
  // an unhandled rejection in that case.
  completion.catch(() => undefined);

  try {
    const result = await executor(transaction);
    await completion;
    return result;
  } catch (error) {
    try {
      transaction.abort();
    } catch {
      // Transaction already finished; nothing to abort.
    }

    throw toIndexedDbError(error, `The ${operationName} operation failed.`);
  }
}

/* ------------------------------------------------------------------ *
 * Record validation
 * ------------------------------------------------------------------ */

function invalidRecord(message: string): IndexedDbError {
  return new IndexedDbError('invalid-record', message);
}

function assertNonEmptyString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw invalidRecord(`Persisted record is missing a valid "${field}" string.`);
  }

  return value;
}

function assertFiniteNumber(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw invalidRecord(`Persisted record is missing a valid numeric "${field}".`);
  }

  return value;
}

function assertBoolean(value: unknown, field: string): boolean {
  if (typeof value !== 'boolean') {
    throw invalidRecord(`Persisted record is missing a boolean "${field}".`);
  }

  return value;
}

function assertProjectRecord(record: unknown): ProjectMetadata {
  if (typeof record !== 'object' || record === null) {
    throw invalidRecord('Project record is not an object.');
  }

  const candidate = record as Partial<ProjectMetadata>;

  const width = assertFiniteNumber(candidate.width, 'width');
  const height = assertFiniteNumber(candidate.height, 'height');
  const fps = assertFiniteNumber(candidate.fps, 'fps');

  if (!Number.isInteger(width) || width <= 0 || !Number.isInteger(height) || height <= 0) {
    throw invalidRecord('Project record has non-positive or non-integer dimensions.');
  }

  if (fps <= 0) {
    throw invalidRecord('Project record has a non-positive frame rate.');
  }

  const thumbnailUrl = candidate.thumbnailUrl;

  if (thumbnailUrl !== null && !isBase64ImageDataUrl(thumbnailUrl)) {
    throw invalidRecord(
      'Project thumbnailUrl must be null or a Base64 image Data URL string.',
    );
  }

  return {
    id: assertNonEmptyString(candidate.id, 'id'),
    title: typeof candidate.title === 'string' ? candidate.title : '',
    width,
    height,
    fps,
    createdAt: assertFiniteNumber(candidate.createdAt, 'createdAt'),
    updatedAt: assertFiniteNumber(candidate.updatedAt, 'updatedAt'),
    thumbnailUrl: thumbnailUrl as string | null,
  };
}

function assertLayerRecord(record: unknown): PixelLayer {
  if (typeof record !== 'object' || record === null) {
    throw invalidRecord('Layer record is not an object.');
  }

  const candidate = record as Partial<PixelLayer>;

  // Buffer fidelity guard: reject anything that is not a live Uint32Array. This
  // is what catches a layer that was corrupted by a JSON round trip.
  if (!(candidate.data instanceof Uint32Array)) {
    throw invalidRecord(
      `Layer "${String(candidate.id)}" has no Uint32Array buffer. ` +
        'Layer rasters must be persisted through structured clone, never JSON.',
    );
  }

  if (candidate.data.length === 0) {
    throw invalidRecord(`Layer "${String(candidate.id)}" has an empty pixel buffer.`);
  }

  const opacity = assertFiniteNumber(candidate.opacity, 'opacity');

  if (opacity < 0 || opacity > 1) {
    throw invalidRecord(`Layer "${String(candidate.id)}" has an opacity outside 0..1.`);
  }

  const order = assertFiniteNumber(candidate.order, 'order');

  if (!Number.isInteger(order) || order < 0) {
    throw invalidRecord(`Layer "${String(candidate.id)}" has an invalid order index.`);
  }

  const blendMode = candidate.blendMode;

  if (typeof blendMode !== 'string' || !VALID_BLEND_MODES.includes(blendMode as BlendMode)) {
    throw invalidRecord(`Layer "${String(candidate.id)}" has an unsupported blend mode.`);
  }

  return {
    id: assertNonEmptyString(candidate.id, 'id'),
    projectId: assertNonEmptyString(candidate.projectId, 'projectId'),
    name: typeof candidate.name === 'string' ? candidate.name : 'Layer',
    order,
    visible: assertBoolean(candidate.visible, 'visible'),
    locked: assertBoolean(candidate.locked, 'locked'),
    opacity,
    blendMode: blendMode as BlendMode,
    data: candidate.data,
    createdAt: assertFiniteNumber(candidate.createdAt, 'createdAt'),
    updatedAt: assertFiniteNumber(candidate.updatedAt, 'updatedAt'),
  };
}

/** Validates and returns a project record. Throws `IndexedDbError` when malformed. */
export function validateProjectRecord(record: unknown): ProjectMetadata {
  return assertProjectRecord(record);
}

/** Validates and returns a layer record. Throws `IndexedDbError` when malformed. */
export function validateLayerRecord(record: unknown): PixelLayer {
  return assertLayerRecord(record);
}

/* ------------------------------------------------------------------ *
 * Project operations
 * ------------------------------------------------------------------ */

/** Inserts or replaces a project record. */
export async function saveProject(project: ProjectMetadata): Promise<void> {
  const record = assertProjectRecord(project);

  await runTransaction(
    [PROJECT_STORE_NAME],
    'readwrite',
    'saveProject',
    async (transaction) => {
      const store = transaction.objectStore(PROJECT_STORE_NAME);
      await requestToPromise(store.put(record), 'saveProject');
    },
  );
}

/**
 * Loads a single project.
 *
 * @returns The project, or `null` when no record has that id.
 */
export async function getProject(projectId: string): Promise<ProjectMetadata | null> {
  assertNonEmptyString(projectId, 'projectId');

  return runTransaction(
    [PROJECT_STORE_NAME],
    'readonly',
    'getProject',
    async (transaction) => {
      const store = transaction.objectStore(PROJECT_STORE_NAME);
      const result = await requestToPromise<unknown>(
        store.get(projectId),
        'getProject',
      );

      if (typeof result === 'undefined') {
        return null;
      }

      return assertProjectRecord(result);
    },
  );
}

/** Loads every saved project, most recently updated first. */
export async function getAllProjects(): Promise<ProjectMetadata[]> {
  return runTransaction(
    [PROJECT_STORE_NAME],
    'readonly',
    'getAllProjects',
    async (transaction) => {
      const store = transaction.objectStore(PROJECT_STORE_NAME);
      const result = await requestToPromise<unknown[]>(
        store.getAll(),
        'getAllProjects',
      );

      return result
        .map((record) => assertProjectRecord(record))
        .sort((a, b) => b.updatedAt - a.updatedAt);
    },
  );
}

/**
 * Deletes a project together with every layer that belongs to it.
 *
 * The project record and its layers are removed inside one `readwrite`
 * transaction so an interrupted delete can never leave orphaned layer buffers
 * consuming quota.
 */
export async function deleteProject(projectId: string): Promise<void> {
  assertNonEmptyString(projectId, 'projectId');

  await runTransaction(
    [PROJECT_STORE_NAME, LAYER_STORE_NAME],
    'readwrite',
    'deleteProject',
    async (transaction) => {
      const projectStore = transaction.objectStore(PROJECT_STORE_NAME);
      const layerStore = transaction.objectStore(LAYER_STORE_NAME);
      const index = layerStore.index(LAYER_PROJECT_INDEX);

      const keys = await requestToPromise<IDBValidKey[]>(
        index.getAllKeys(IDBKeyRange.only(projectId)),
        'deleteProject',
      );

      await requestToPromise(projectStore.delete(projectId), 'deleteProject');

      for (const key of keys) {
        await requestToPromise(layerStore.delete(key), 'deleteProject');
      }
    },
  );
}

/* ------------------------------------------------------------------ *
 * Layer operations
 * ------------------------------------------------------------------ */

/** Inserts or replaces a single layer record. */
export async function saveLayer(layer: PixelLayer): Promise<void> {
  const record = assertLayerRecord(layer);

  await runTransaction(
    [LAYER_STORE_NAME],
    'readwrite',
    'saveLayer',
    async (transaction) => {
      const store = transaction.objectStore(LAYER_STORE_NAME);
      await requestToPromise(store.put(record), 'saveLayer');
    },
  );
}

/**
 * Inserts or replaces many layers in one batched transaction.
 *
 * Layer reordering uses this to persist the rewritten `order` values for every
 * sibling at once, which keeps the stored stack consistent even if the browser
 * closes mid-write.
 */
export async function saveLayers(layers: readonly PixelLayer[]): Promise<void> {
  if (layers.length === 0) {
    return;
  }

  const records = layers.map((layer) => assertLayerRecord(layer));

  await runTransaction(
    [LAYER_STORE_NAME],
    'readwrite',
    'saveLayers',
    async (transaction) => {
      const store = transaction.objectStore(LAYER_STORE_NAME);

      for (const record of records) {
        await requestToPromise(store.put(record), 'saveLayers');
      }
    },
  );
}

/** Persists a project record and its full layer stack in one transaction. */
export async function saveProjectWithLayers(
  project: ProjectMetadata,
  layers: readonly PixelLayer[],
): Promise<void> {
  const projectRecord = assertProjectRecord(project);
  const layerRecords = layers.map((layer) => assertLayerRecord(layer));
  const currentLayerIds = new Set(layerRecords.map((layer) => layer.id));

  await runTransaction(
    [PROJECT_STORE_NAME, LAYER_STORE_NAME],
    'readwrite',
    'saveProjectWithLayers',
    async (transaction) => {
      const projectStore = transaction.objectStore(PROJECT_STORE_NAME);
      const layerStore = transaction.objectStore(LAYER_STORE_NAME);
      const index = layerStore.index(LAYER_PROJECT_INDEX);

      const existingKeys = await requestToPromise<IDBValidKey[]>(
        index.getAllKeys(IDBKeyRange.only(project.id)),
        'saveProjectWithLayers:queryKeys',
      );

      for (const key of existingKeys) {
        if (!currentLayerIds.has(String(key))) {
          await requestToPromise(layerStore.delete(key), 'saveProjectWithLayers:deleteOrphan');
        }
      }

      await requestToPromise(projectStore.put(projectRecord), 'saveProjectWithLayers:saveProject');

      for (const record of layerRecords) {
        await requestToPromise(layerStore.put(record), 'saveProjectWithLayers:saveLayer');
      }
    },
  );
}

/**
 * Replaces a project's entire layer stack: existing layers are deleted and the
 * supplied snapshot is written, all inside one transaction. Used when
 * duplicating a project and when a stack structure changes wholesale.
 */
export async function replaceLayers(
  projectId: string,
  layers: readonly PixelLayer[],
): Promise<void> {
  assertNonEmptyString(projectId, 'projectId');

  const records = layers.map((layer) => {
    const record = assertLayerRecord(layer);

    if (record.projectId !== projectId) {
      throw invalidRecord(
        `Layer "${record.id}" belongs to project "${record.projectId}" but was written to "${projectId}".`,
      );
    }

    return record;
  });

  await runTransaction(
    [LAYER_STORE_NAME],
    'readwrite',
    'replaceLayers',
    async (transaction) => {
      const store = transaction.objectStore(LAYER_STORE_NAME);
      const index = store.index(LAYER_PROJECT_INDEX);

      const keys = await requestToPromise<IDBValidKey[]>(
        index.getAllKeys(IDBKeyRange.only(projectId)),
        'replaceLayers',
      );

      for (const key of keys) {
        await requestToPromise(store.delete(key), 'replaceLayers');
      }

      for (const record of records) {
        await requestToPromise(store.put(record), 'replaceLayers');
      }
    },
  );
}

/** Loads a single layer. Returns `null` when no record has that id. */
export async function getLayer(layerId: string): Promise<PixelLayer | null> {
  assertNonEmptyString(layerId, 'layerId');

  return runTransaction([LAYER_STORE_NAME], 'readonly', 'getLayer', async (transaction) => {
    const store = transaction.objectStore(LAYER_STORE_NAME);
    const result = await requestToPromise<unknown>(store.get(layerId), 'getLayer');

    if (typeof result === 'undefined') {
      return null;
    }

    return assertLayerRecord(result);
  });
}

/**
 * Loads every layer of a project through the `by_project` index, ordered from
 * the bottom of the stack (`order` 0) upward.
 */
export async function getLayersByProject(projectId: string): Promise<PixelLayer[]> {
  assertNonEmptyString(projectId, 'projectId');

  return runTransaction(
    [LAYER_STORE_NAME],
    'readonly',
    'getLayersByProject',
    async (transaction) => {
      const store = transaction.objectStore(LAYER_STORE_NAME);
      const index = store.index(LAYER_PROJECT_INDEX);

      const result = await requestToPromise<unknown[]>(
        index.getAll(IDBKeyRange.only(projectId)),
        'getLayersByProject',
      );

      return result
        .map((record) => assertLayerRecord(record))
        .sort((a, b) => a.order - b.order);
    },
  );
}

/** Deletes a single layer record. */
export async function deleteLayer(layerId: string): Promise<void> {
  assertNonEmptyString(layerId, 'layerId');

  await runTransaction([LAYER_STORE_NAME], 'readwrite', 'deleteLayer', async (transaction) => {
    const store = transaction.objectStore(LAYER_STORE_NAME);
    await requestToPromise(store.delete(layerId), 'deleteLayer');
  });
}

/** Deletes every layer that belongs to a project, leaving the project record. */
export async function deleteLayersByProject(projectId: string): Promise<void> {
  assertNonEmptyString(projectId, 'projectId');

  await runTransaction(
    [LAYER_STORE_NAME],
    'readwrite',
    'deleteLayersByProject',
    async (transaction) => {
      const store = transaction.objectStore(LAYER_STORE_NAME);
      const index = store.index(LAYER_PROJECT_INDEX);

      const keys = await requestToPromise<IDBValidKey[]>(
        index.getAllKeys(IDBKeyRange.only(projectId)),
        'deleteLayersByProject',
      );

      for (const key of keys) {
        await requestToPromise(store.delete(key), 'deleteLayersByProject');
      }
    },
  );
}

/* ------------------------------------------------------------------ *
 * Maintenance
 * ------------------------------------------------------------------ */

/** Empties both object stores without dropping the schema. */
export async function clearAllData(): Promise<void> {
  await runTransaction(
    [PROJECT_STORE_NAME, LAYER_STORE_NAME],
    'readwrite',
    'clearAllData',
    async (transaction) => {
      await requestToPromise(transaction.objectStore(PROJECT_STORE_NAME).clear(), 'clearAllData');
      await requestToPromise(transaction.objectStore(LAYER_STORE_NAME).clear(), 'clearAllData');
    },
  );
}

/**
 * Reports origin storage pressure so the UI can warn before autosave starts
 * failing with `quota-exceeded`.
 *
 * @returns Usage details, or `null` when `navigator.storage.estimate` is not
 * implemented by the browser.
 */
export async function estimateStorageUsage(): Promise<StorageUsageEstimate | null> {
  if (
    typeof navigator === 'undefined' ||
    typeof navigator.storage === 'undefined' ||
    typeof navigator.storage.estimate !== 'function'
  ) {
    return null;
  }

  try {
    const { usage, quota } = await navigator.storage.estimate();

    if (typeof quota !== 'number' || quota <= 0) {
      return null;
    }

    const usageBytes = typeof usage === 'number' ? usage : 0;
    const ratio = usageBytes / quota;

    return {
      usageBytes,
      quotaBytes: quota,
      percentUsed: ratio < 0 ? 0 : ratio > 1 ? 1 : ratio,
    };
  } catch {
    // Estimation is best-effort telemetry; it must never break a save path.
    return null;
  }
}
