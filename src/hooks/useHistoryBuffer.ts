/**
 * History buffer hook.
 *
 * The buffer itself lives in `editorStore` (so any module can commit a record
 * without importing this hook — sibling hooks must not depend on each other);
 * this hook is the read/command surface for the history UI.
 *
 * Circular-buffer discipline: 50 records maximum, and any new paint action
 * executed after `undo()` truncates the redo tail (plan §Phase 4).
 */

import { useCallback } from 'react';
import { HISTORY_LIMIT, editorStore, useEditorStore } from '../store/editorStore';
import { retroAudioEngine } from '../utils/audio/soundSynth';

export interface HistoryBufferApi {
  canUndo: boolean;
  canRedo: boolean;
  /** Action name that undo would revert, e.g. `"Pencil"`. */
  undoActionName: string | null;
  /** Action name that redo would reapply. */
  redoActionName: string | null;
  /** Records currently retained. */
  historyDepth: number;
  /** Buffer capacity. */
  historyLimit: number;
  /** Steps available behind the cursor. */
  undoDepth: number;
  /** Steps available ahead of the cursor. */
  redoDepth: number;
  undo: () => boolean;
  redo: () => boolean;
  clear: () => void;
}

/**
 * Subscribes to the editor history and exposes undo/redo commands with audio
 * feedback. `canUndo`/`canRedo` are derived from the cursor position, not from
 * array length, so a partially undone buffer reports correctly.
 */
export function useHistoryBuffer(): HistoryBufferApi {
  const records = useEditorStore((state) => state.history.records);
  const index = useEditorStore((state) => state.history.index);
  const limit = useEditorStore((state) => state.history.limit);

  const canUndo = index > 0;
  const canRedo = index < records.length;

  const undoActionName = canUndo ? records[index - 1].actionName : null;
  const redoActionName = canRedo ? records[index].actionName : null;

  const undo = useCallback((): boolean => {
    const applied = editorStore.undo();

    if (applied) {
      retroAudioEngine.playHistoryStep('undo');
    }

    return applied;
  }, []);

  const redo = useCallback((): boolean => {
    const applied = editorStore.redo();

    if (applied) {
      retroAudioEngine.playHistoryStep('redo');
    }

    return applied;
  }, []);

  const clear = useCallback((): void => {
    editorStore.clearHistory();
  }, []);

  return {
    canUndo,
    canRedo,
    undoActionName,
    redoActionName,
    historyDepth: records.length,
    historyLimit: limit > 0 ? limit : HISTORY_LIMIT,
    undoDepth: index,
    redoDepth: records.length - index,
    undo,
    redo,
    clear,
  };
}
