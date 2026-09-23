/**
 * Minimal observable store primitive.
 *
 * A hand-rolled store keeps the cabinet dependency-free and gives the editor
 * exact control over the immutability contract; React is bound through
 * `useSyncExternalStore` so concurrent rendering stays correct.
 */

import { useCallback, useRef, useSyncExternalStore } from 'react';

/** Partial state, or a function producing one from the current state. */
export type StateUpdater<TState extends object> =
  | Partial<TState>
  | ((state: TState) => Partial<TState>);

export interface Store<TState extends object> {
  /** Current state snapshot. Always referentially stable until it changes. */
  getState: () => TState;
  /** Merges a partial update (or the result of an updater function) into state. */
  setState: (updater: StateUpdater<TState>) => void;
  /** Registers a change listener. Returns an unsubscribe function. */
  subscribe: (listener: () => void) => () => void;
}

/** Creates a store holding `initialState`. */
export function createStore<TState extends object>(initialState: TState): Store<TState> {
  let state = initialState;
  const listeners = new Set<() => void>();

  const getState = (): TState => state;

  const setState = (updater: StateUpdater<TState>): void => {
    const patch = typeof updater === 'function' ? updater(state) : updater;

    // Skip the notification entirely when nothing actually changed, so
    // `useSyncExternalStore` consumers do not re-render needlessly.
    let hasChange = false;

    for (const key of Object.keys(patch) as (keyof TState)[]) {
      if (!Object.is(state[key], patch[key])) {
        hasChange = true;
        break;
      }
    }

    if (!hasChange) {
      return;
    }

    state = { ...state, ...patch };

    for (const listener of listeners) {
      listener();
    }
  };

  const subscribe = (listener: () => void): (() => void) => {
    listeners.add(listener);

    return () => {
      listeners.delete(listener);
    };
  };

  return { getState, setState, subscribe };
}

/**
 * Subscribes a component to a slice of store state.
 *
 * The selection is memoised per state snapshot: a selector that derives a new
 * object on every call would otherwise make `useSyncExternalStore` loop. Prefer
 * selecting primitives or stable references, and call the hook several times
 * when a component needs several fields.
 */
export function useStoreSelector<TState extends object, TSelection>(
  store: Store<TState>,
  selector: (state: TState) => TSelection,
): TSelection {
  const lastStateRef = useRef<TState>(store.getState());
  const lastSelectorRef = useRef(selector);
  const lastSelectionRef = useRef<TSelection>(selector(lastStateRef.current));

  const getSnapshot = useCallback((): TSelection => {
    const nextState = store.getState();

    if (
      !Object.is(nextState, lastStateRef.current) ||
      !Object.is(selector, lastSelectorRef.current)
    ) {
      lastStateRef.current = nextState;
      lastSelectorRef.current = selector;
      lastSelectionRef.current = selector(nextState);
    }

    return lastSelectionRef.current;
  }, [store, selector]);

  return useSyncExternalStore(store.subscribe, getSnapshot, getSnapshot);
}
