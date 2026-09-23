/**
 * Project persistence hook (plan §Phase 4).
 *
 * AUTOSAVE CONTRACT
 *   - Debounced by 400ms, so a burst of strokes coalesces into one write.
 *   - Triggered strictly by a change of `documentRevision`, which the editor
 *     store only bumps on committed edits. Pointer movement never marks the
 *     document dirty, so no write can be scheduled from `pointermove`.
 *   - Serialised by an in-flight lock: a revision that lands while a transaction
 *     is open sets a pending flag and re-runs once it settles, so two concurrent
 *     IndexedDB transactions are impossible.
 *   - Layer buffers reach IndexedDB through structured clone only.
 */

import { useCallback, useEffect, useRef } from 'react';
import type { ProjectMetadata, StorageUsageEstimate } from '../types';
import { editorStore, useEditorStore } from '../store/editorStore';
import { projectStore, useProjectStore } from '../store/projectStore';
import type { PersistenceStatus } from '../store/projectStore';
import {
  IndexedDbError,
  clearAllData,
  deleteProject as deleteProjectRecord,
  estimateStorageUsage,
  getAllProjects,
  getLayersByProject,
  getProject,
  saveProjectWithLayers,
} from '../utils/storage/indexedDbClient';
import { createEntityId } from '../utils/id/createEntityId';

/** Debounce window for autosave, in milliseconds. */
export const AUTOSAVE_DEBOUNCE_MS = 400;

export interface PixelProjectStorageApi {
  projects: ProjectMetadata[];
  status: PersistenceStatus;
  lastError: string | null;
  lastSavedAt: number | null;
  storageEstimate: StorageUsageEstimate | null;
  isWriteInFlight: boolean;
  /** True while the document holds edits that have not been written yet. */
  hasUnsavedChanges: boolean;
  /** Persists the current document immediately, bypassing the debounce. */
  saveNow: () => Promise<boolean>;
  /** Loads a project and its layers from IndexedDB into the editor. */
  loadProjectById: (projectId: string) => Promise<boolean>;
  /** Deletes a project plus its layers. Refuses to delete the open project. */
  deleteProjectById: (projectId: string) => Promise<boolean>;
  /** Deep-copies a stored project, including every layer buffer. */
  duplicateProjectById: (projectId: string) => Promise<ProjectMetadata | null>;
  /** Re-reads the project library. */
  refreshLibrary: () => Promise<void>;
  /** Empties the workspace database. */
  clearWorkspace: () => Promise<void>;
}

/** Turns any thrown value into a user-facing sentence. */
function describeError(error: unknown): string {
  if (error instanceof IndexedDbError) {
    return error.message;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return 'An unknown storage error occurred.';
}

/**
 * Wires the editor document to IndexedDB.
 *
 * @param autoRestore When true (default), the most recently updated project is
 * loaded once on mount so a reload restores the workspace.
 */
export function usePixelProjectStorage(autoRestore: boolean = true): PixelProjectStorageApi {
  const documentRevision = useEditorStore((state) => state.documentRevision);
  const savedRevision = useEditorStore((state) => state.savedRevision);
  const isHydrated = useEditorStore((state) => state.isHydrated);

  const projects = useProjectStore((state) => state.projects);
  const status = useProjectStore((state) => state.status);
  const lastError = useProjectStore((state) => state.lastError);
  const lastSavedAt = useProjectStore((state) => state.lastSavedAt);
  const storageEstimate = useProjectStore((state) => state.storageEstimate);
  const isWriteInFlight = useProjectStore((state) => state.isWriteInFlight);

  const debounceTimerRef = useRef<number | null>(null);
  /** Set when a revision arrives while a write is already in flight. */
  const pendingWriteRef = useRef(false);
  const restoreAttemptedRef = useRef(false);

  const clearDebounceTimer = useCallback((): void => {
    if (debounceTimerRef.current !== null) {
      window.clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
  }, []);

  /** Writes the current document and layer stack in a single transaction. */
  const writeSnapshot = useCallback(async (): Promise<boolean> => {
    const state = editorStore.getState();

    if (state.savedRevision === state.documentRevision) {
      return true;
    }

    if (projectStore.getState().isWriteInFlight) {
      // Serialise: retry as soon as the open transaction settles.
      pendingWriteRef.current = true;
      return false;
    }

    const revisionBeingSaved = state.documentRevision;

    projectStore.beginWrite();

    try {
      await saveProjectWithLayers(state.currentProject, state.layers);

      editorStore.markSaved(revisionBeingSaved);
      projectStore.upsertProject(state.currentProject);
      projectStore.endWrite(true);
      projectStore.setStorageEstimate(await estimateStorageUsage());

      return true;
    } catch (error) {
      projectStore.endWrite(false);
      projectStore.setError(
        `Could not save "${state.currentProject.title}": ${describeError(error)}`,
      );
      return false;
    } finally {
      if (pendingWriteRef.current) {
        pendingWriteRef.current = false;

        // A newer revision arrived mid-write: schedule another pass.
        clearDebounceTimer();
        debounceTimerRef.current = window.setTimeout(() => {
          debounceTimerRef.current = null;
          void writeSnapshot();
        }, AUTOSAVE_DEBOUNCE_MS);
      }
    }
  }, [clearDebounceTimer]);

  const saveNow = useCallback(async (): Promise<boolean> => {
    clearDebounceTimer();
    return writeSnapshot();
  }, [clearDebounceTimer, writeSnapshot]);

  const refreshLibrary = useCallback(async (): Promise<void> => {
    try {
      projectStore.setProjects(await getAllProjects());
      projectStore.setStorageEstimate(await estimateStorageUsage());
    } catch (error) {
      projectStore.setError(`Could not read the project library: ${describeError(error)}`);
    }
  }, []);

  const loadProjectById = useCallback(async (projectId: string): Promise<boolean> => {
    projectStore.setStatus('loading');

    try {
      const project = await getProject(projectId);

      if (!project) {
        projectStore.setError(`Project "${projectId}" no longer exists in local storage.`);
        return false;
      }

      const layers = await getLayersByProject(projectId);

      if (layers.length === 0) {
        projectStore.setError(
          `Project "${project.title}" has no layers stored, so it cannot be opened.`,
        );
        return false;
      }

      editorStore.loadProject(project, layers);
      projectStore.setStatus('idle');

      return true;
    } catch (error) {
      projectStore.setError(`Could not open the project: ${describeError(error)}`);
      return false;
    }
  }, []);

  const deleteProjectById = useCallback(async (projectId: string): Promise<boolean> => {
    if (projectId === editorStore.getState().currentProject.id) {
      // Deleting the open document would leave the editor pointing at a record
      // that no longer exists; the library UI blocks this and so do we.
      projectStore.setError('Close or replace the open project before deleting it.');
      return false;
    }

    try {
      await deleteProjectRecord(projectId);
      projectStore.removeProject(projectId);
      projectStore.setStorageEstimate(await estimateStorageUsage());

      return true;
    } catch (error) {
      projectStore.setError(`Could not delete the project: ${describeError(error)}`);
      return false;
    }
  }, []);

  const duplicateProjectById = useCallback(
    async (projectId: string): Promise<ProjectMetadata | null> => {
      try {
        const source = await getProject(projectId);

        if (!source) {
          projectStore.setError('That project no longer exists in local storage.');
          return null;
        }

        const sourceLayers = await getLayersByProject(projectId);

        if (sourceLayers.length === 0) {
          projectStore.setError('That project has no layers to copy.');
          return null;
        }

        const now = Date.now();
        const copyId = createEntityId();

        const copy: ProjectMetadata = {
          ...source,
          id: copyId,
          title: `${source.title} copy`,
          createdAt: now,
          updatedAt: now,
        };

        const copiedLayers = sourceLayers.map((layer) => ({
          ...layer,
          id: createEntityId(),
          projectId: copyId,
          // Fresh buffers: the copy must never share typed-array storage with the
          // original, or painting one would corrupt the other.
          data: new Uint32Array(layer.data),
          updatedAt: now,
        }));

        await saveProjectWithLayers(copy, copiedLayers);
        projectStore.upsertProject(copy);

        return copy;
      } catch (error) {
        projectStore.setError(`Could not duplicate the project: ${describeError(error)}`);
        return null;
      }
    },
    [],
  );

  const clearWorkspace = useCallback(async (): Promise<void> => {
    try {
      await clearAllData();
      projectStore.setProjects([]);
      projectStore.setStorageEstimate(await estimateStorageUsage());
    } catch (error) {
      projectStore.setError(`Could not clear local storage: ${describeError(error)}`);
    }
  }, []);

  /* ---------------- restore the last session once ---------------- */

  useEffect(() => {
    if (!autoRestore || restoreAttemptedRef.current) {
      return;
    }

    restoreAttemptedRef.current = true;

    const restore = async (): Promise<void> => {
      try {
        const records = await getAllProjects();
        projectStore.setProjects(records);

        if (records.length > 0) {
          const layers = await getLayersByProject(records[0].id);

          if (layers.length > 0) {
            editorStore.loadProject(records[0], layers);
          } else {
            // Partially written project: start clean rather than leaving the
            // editor in a half-loaded state.
            editorStore.setHydrated(true);
          }
        } else {
          editorStore.setHydrated(true);
        }

        projectStore.setStorageEstimate(await estimateStorageUsage());
      } catch (error) {
        projectStore.setError(`Could not restore the last session: ${describeError(error)}`);
        editorStore.setHydrated(true);
      }
    };

    void restore();
  }, [autoRestore]);

  /* ---------------- debounced autosave ---------------- */

  useEffect(() => {
    if (!isHydrated) {
      return;
    }

    if (documentRevision === savedRevision) {
      // Nothing to write; also cancels a stale timer after an explicit save or a
      // project load.
      clearDebounceTimer();
      return;
    }

    clearDebounceTimer();

    debounceTimerRef.current = window.setTimeout(() => {
      debounceTimerRef.current = null;
      void writeSnapshot();
    }, AUTOSAVE_DEBOUNCE_MS);

    return clearDebounceTimer;
  }, [documentRevision, savedRevision, isHydrated, writeSnapshot, clearDebounceTimer]);

  /* ---------------- flush before the tab goes away ---------------- */

  useEffect(() => {
    const handlePageHide = (): void => {
      const state = editorStore.getState();

      if (state.documentRevision === state.savedRevision || !state.isHydrated) {
        return;
      }

      // Best-effort kick: the browser usually finishes the queued IndexedDB
      // transaction during unload.
      clearDebounceTimer();
      void writeSnapshot();
    };

    window.addEventListener('pagehide', handlePageHide);

    return () => {
      window.removeEventListener('pagehide', handlePageHide);
      clearDebounceTimer();
    };
  }, [writeSnapshot, clearDebounceTimer]);

  return {
    projects,
    status,
    lastError,
    lastSavedAt,
    storageEstimate,
    isWriteInFlight,
    hasUnsavedChanges: documentRevision !== savedRevision,
    saveNow,
    loadProjectById,
    deleteProjectById,
    duplicateProjectById,
    refreshLibrary,
    clearWorkspace,
  };
}
