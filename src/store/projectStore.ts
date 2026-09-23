/**
 * Project store — the persistence-facing half of application state.
 *
 * It holds the local project library, the autosave status surface and the
 * in-flight write lock. All IndexedDB traffic itself lives in the
 * `usePixelProjectStorage` hook; this store only records outcomes, which keeps
 * the hook free of UI wiring and keeps components free of IndexedDB calls.
 */

import type { ProjectMetadata, StorageUsageEstimate } from '../types';
import { createStore, useStoreSelector } from './createStore';
import type { Store } from './createStore';

/** Lifecycle of the persistence layer, as shown in the status bar. */
export type PersistenceStatus =
  /** No write has happened in this session yet. */
  | 'idle'
  /** Reading the project library from IndexedDB. */
  | 'loading'
  /** A debounced write is pending or in flight. */
  | 'saving'
  /** The last write committed successfully. */
  | 'saved'
  /** The last operation failed; `lastError` explains why. */
  | 'error';

export interface ProjectStoreState {
  /** Every saved project, most recently updated first. */
  projects: ProjectMetadata[];
  status: PersistenceStatus;
  /** Human-readable failure message for the last failed operation. */
  lastError: string | null;
  /** Timestamp of the last successful write. */
  lastSavedAt: number | null;
  /** Origin storage pressure, or `null` when the browser cannot estimate it. */
  storageEstimate: StorageUsageEstimate | null;
  /**
   * True while an IndexedDB transaction is open. Autosave must not start a second
   * concurrent write, so this doubles as the transaction lock.
   */
  isWriteInFlight: boolean;
  /** True once the library has been read at least once. */
  hasLoadedLibrary: boolean;
}

export interface ProjectActions {
  /** Replaces the whole library list. */
  setProjects: (projects: readonly ProjectMetadata[]) => void;
  /** Inserts or replaces one entry, keeping the list sorted by recency. */
  upsertProject: (project: ProjectMetadata) => void;
  /** Removes one entry from the cached list. */
  removeProject: (projectId: string) => void;
  setStatus: (status: PersistenceStatus) => void;
  /** Records a failure and switches the status to `error`. */
  setError: (message: string) => void;
  /** Clears the error and returns the status to `idle`. */
  clearError: () => void;
  setStorageEstimate: (estimate: StorageUsageEstimate | null) => void;
  /** Marks a write as started and the status as `saving`. */
  beginWrite: () => void;
  /** Marks a write as finished; `success` selects the resulting status. */
  endWrite: (success: boolean) => void;
  setHasLoadedLibrary: (loaded: boolean) => void;
}

export type ProjectStore = Store<ProjectStoreState> & ProjectActions;

const INITIAL_STATE: ProjectStoreState = {
  projects: [],
  status: 'idle',
  lastError: null,
  lastSavedAt: null,
  storageEstimate: null,
  isWriteInFlight: false,
  hasLoadedLibrary: false,
};

const baseStore = createStore<ProjectStoreState>(INITIAL_STATE);

const actions: ProjectActions = {
  setProjects: (projects) => {
    baseStore.setState({
      projects: [...projects].sort((a, b) => b.updatedAt - a.updatedAt),
      hasLoadedLibrary: true,
    });
  },

  upsertProject: (project) => {
    const state = baseStore.getState();
    const existingIndex = state.projects.findIndex((entry) => entry.id === project.id);

    const next =
      existingIndex >= 0
        ? state.projects.map((entry) => (entry.id === project.id ? project : entry))
        : [...state.projects, project];

    baseStore.setState({
      projects: next.sort((a, b) => b.updatedAt - a.updatedAt),
      hasLoadedLibrary: true,
    });
  },

  removeProject: (projectId) => {
    const state = baseStore.getState();

    baseStore.setState({
      projects: state.projects.filter((project) => project.id !== projectId),
    });
  },

  setStatus: (status) => {
    baseStore.setState({ status, lastError: status === 'error' ? baseStore.getState().lastError : null });
  },

  setError: (message) => {
    baseStore.setState({ status: 'error', lastError: message });
  },

  clearError: () => {
    baseStore.setState({ status: 'idle', lastError: null });
  },

  setStorageEstimate: (estimate) => {
    baseStore.setState({ storageEstimate: estimate });
  },

  beginWrite: () => {
    baseStore.setState({ isWriteInFlight: true, status: 'saving' });
  },

  endWrite: (success) => {
    baseStore.setState(
      success
        ? {
            isWriteInFlight: false,
            status: 'saved',
            lastSavedAt: Date.now(),
            lastError: null,
          }
        : { isWriteInFlight: false, status: 'error' },
    );
  },

  setHasLoadedLibrary: (loaded) => {
    baseStore.setState({ hasLoadedLibrary: loaded });
  },
};

/** The project store singleton. */
export const projectStore: ProjectStore = { ...baseStore, ...actions };

/** Subscribes a component to a slice of project/persistence state. */
export function useProjectStore<TSelection>(
  selector: (state: ProjectStoreState) => TSelection,
): TSelection {
  return useStoreSelector(baseStore, selector);
}
