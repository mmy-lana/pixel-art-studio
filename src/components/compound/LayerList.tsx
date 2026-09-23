import type { BlendMode, Dimensions, PixelLayer } from '../../types';
import { Layers, Plus } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import { cx } from '../../utils/classNames';
import { retroAudioEngine } from '../../utils/audio/soundSynth';
import { ArcadeButton } from '../primitives/ArcadeButton';
import { ArcadeTooltip } from '../primitives/ArcadeTooltip';
import { LayerListItem } from './LayerListItem';
import type { LayerDropPosition } from './LayerListItem';

export interface LayerListProps {
  /**
   * Layers in stored order: `order` 0 is the BOTTOM of the stack. The list
   * renders them reversed so the top layer appears first, matching every other
   * raster editor.
   */
  layers: readonly PixelLayer[];
  activeLayerId: string;
  /** Project dimensions, forwarded to each row's thumbnail. */
  dimensions: Dimensions;
  onSelectLayer: (layerId: string) => void;
  onAddLayer: () => void;
  onDuplicateLayer: (layerId: string) => void;
  onMergeDown: (layerId: string) => void;
  onDeleteLayer: (layerId: string) => void;
  /**
   * Commits a reorder. `newOrder` is the stored stack position (0 = bottom) the
   * dragged layer should end up at; the caller rewrites sibling order values
   * sequentially and persists them in one batched transaction.
   */
  onReorderLayer: (layerId: string, newOrder: number) => void;
  onToggleVisible: (layerId: string) => void;
  onToggleLocked: (layerId: string) => void;
  onOpacityChange: (layerId: string, opacity: number) => void;
  onChangeBlendMode: (layerId: string, blendMode: BlendMode) => void;
  onRenameLayer: (layerId: string, name: string) => void;
  /** Blocks "add" once the stack is full. Defaults to `12`. */
  maxLayers?: number;
  className?: string;
}

/**
 * Layer stack module.
 *
 * Owns stack ordering, the add/duplicate/merge/delete actions and the deletion
 * guard from plan §Phase 3. Reordering is exposed two ways: pointer drag between
 * rows, and the per-row up/down caps (with Alt+Arrow support on the drag
 * handle) so touch and keyboard users can reorder without a drag gesture.
 */
export function LayerList({
  layers,
  activeLayerId,
  dimensions,
  onSelectLayer,
  onAddLayer,
  onDuplicateLayer,
  onMergeDown,
  onDeleteLayer,
  onReorderLayer,
  onToggleVisible,
  onToggleLocked,
  onOpacityChange,
  onChangeBlendMode,
  onRenameLayer,
  maxLayers = 12,
  className,
}: LayerListProps) {
  const [draggedLayerId, setDraggedLayerId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<{
    layerId: string;
    position: LayerDropPosition;
  } | null>(null);

  /**
   * Mirror of `draggedLayerId` kept in a ref.
   *
   * `dragstart`, `dragover` and `drop` can be delivered inside a single React
   * batch on some browsers, in which case the drop handler's closure would still
   * observe the pre-drag state. The ref is written synchronously by dragstart, so
   * the drop always sees the row that is actually being dragged.
   */
  const draggedLayerIdRef = useRef<string | null>(null);

  /** Top-first render order, derived deterministically from stored `order`. */
  const renderedLayers = useMemo(
    () =>
      [...layers].sort((a, b) =>
        b.order === a.order ? a.id.localeCompare(b.id) : b.order - a.order,
      ),
    [layers],
  );

  const total = renderedLayers.length;
  const canDelete = total > 1;
  const isFull = total >= maxLayers;

  /**
   * Converts a visual insertion point into a stored stack position.
   *
   * The rendered list is the reverse of the stored list, so rendered index `k`
   * maps to stored order `total - 1 - k`.
   */
  const commitDrop = (targetLayerId: string, position: LayerDropPosition): void => {
    const sourceId = draggedLayerIdRef.current;

    draggedLayerIdRef.current = null;
    setDraggedLayerId(null);
    setDropTarget(null);

    if (sourceId === null || sourceId === targetLayerId) {
      return;
    }

    const sourceIndex = renderedLayers.findIndex((layer) => layer.id === sourceId);
    const targetIndex = renderedLayers.findIndex((layer) => layer.id === targetLayerId);

    if (sourceIndex < 0 || targetIndex < 0) {
      return;
    }

    // Index the dragged row would occupy in the rendered list after removal.
    const reordered = renderedLayers.filter((layer) => layer.id !== sourceId);
    const rawIndex = reordered.findIndex((layer) => layer.id === targetLayerId);
    const insertionIndex = position === 'above' ? rawIndex : rawIndex + 1;

    reordered.splice(insertionIndex, 0, renderedLayers[sourceIndex]);

    const newOrder = total - 1 - insertionIndex;

    if (newOrder === renderedLayers[sourceIndex].order) {
      return;
    }

    retroAudioEngine.playToolSelect();
    onReorderLayer(sourceId, newOrder);
  };

  /**
   * Moves a layer one slot visually. `direction` is expressed in screen terms so
   * the caps and the Alt+Arrow shortcuts stay intuitive.
   */
  const handleMove = (layerId: string, direction: 'up' | 'down'): void => {
    const currentIndex = renderedLayers.findIndex((layer) => layer.id === layerId);
    const targetIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;

    if (currentIndex < 0 || targetIndex < 0 || targetIndex >= total) {
      return;
    }

    retroAudioEngine.playToolSelect();
    onReorderLayer(layerId, total - 1 - targetIndex);
  };

  return (
    <div className={cx('flex min-h-0 flex-col gap-2', className)}>
      {/* Action bar ------------------------------------------------------- */}
      <div className="flex items-center gap-1.5">
        <ArcadeTooltip
          label={isFull ? `Stack limit of ${maxLayers} layers reached` : 'Add a new empty layer'}
        >
          <ArcadeButton
            size="sm"
            variant="primary"
            disabled={isFull}
            leadingIcon={<Plus aria-hidden="true" className="h-3.5 w-3.5" strokeWidth={3} />}
            onClick={() => {
              onAddLayer();
            }}
          >
            Add
          </ArcadeButton>
        </ArcadeTooltip>

        <span className="arcade-badge ml-auto px-1.5 py-1 text-pixel-xs uppercase">
          {total} / {maxLayers}
        </span>
      </div>

      {/* Stack ------------------------------------------------------------ */}
      {total === 0 ? (
        <div className="flex flex-col items-center gap-2 border-2 border-dashed border-arcade-border px-3 py-6 text-center">
          <Layers aria-hidden="true" className="h-6 w-6 text-arcade-border-light" strokeWidth={2} />
          <p className="text-pixel-xs normal-case leading-relaxed text-arcade-muted">
            No layers in this project. Add one to start drawing.
          </p>
          <ArcadeButton size="sm" variant="primary" onClick={onAddLayer}>
            Create layer
          </ArcadeButton>
        </div>
      ) : (
        <ul
          className="arcade-scroll flex min-h-0 flex-col gap-1.5 overflow-y-auto pr-0.5"
          aria-label="Layer stack, topmost first"
        >
          {renderedLayers.map((layer, index) => (
            <LayerListItem
              key={layer.id}
              layer={layer}
              dimensions={dimensions}
              index={index}
              total={total}
              isActive={layer.id === activeLayerId}
              canDelete={canDelete}
              canMergeDown={index < total - 1}
              isDragging={draggedLayerId === layer.id}
              dropPosition={
                dropTarget !== null && dropTarget.layerId === layer.id && draggedLayerId !== layer.id
                  ? dropTarget.position
                  : null
              }
              onSelect={onSelectLayer}
              onToggleVisible={onToggleVisible}
              onToggleLocked={onToggleLocked}
              onOpacityChange={onOpacityChange}
              onChangeBlendMode={onChangeBlendMode}
              onRename={onRenameLayer}
              onDuplicate={onDuplicateLayer}
              onMergeDown={onMergeDown}
              onDelete={onDeleteLayer}
              onMoveUp={(layerId) => {
                handleMove(layerId, 'up');
              }}
              onMoveDown={(layerId) => {
                handleMove(layerId, 'down');
              }}
              onDragStart={(layerId) => {
                draggedLayerIdRef.current = layerId;
                setDraggedLayerId(layerId);
              }}
              onDragOverRow={(layerId, position) => {
                setDropTarget((current) =>
                  current !== null &&
                  current.layerId === layerId &&
                  current.position === position
                    ? current
                    : { layerId, position },
                );
              }}
              onDropRow={commitDrop}
              onDragEnd={() => {
                draggedLayerIdRef.current = null;
                setDraggedLayerId(null);
                setDropTarget(null);
              }}
            />
          ))}
        </ul>
      )}

      {!canDelete && total === 1 && (
        <p className="text-pixel-xs normal-case leading-relaxed text-arcade-muted">
          Deletion is blocked while only one layer exists.
        </p>
      )}
    </div>
  );
}
