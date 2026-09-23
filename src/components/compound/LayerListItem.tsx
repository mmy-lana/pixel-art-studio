import type { BlendMode, Dimensions, PixelLayer } from '../../types';
import {
  ArrowDownToLine,
  ChevronDown,
  ChevronUp,
  Copy,
  Eye,
  EyeOff,
  GripVertical,
  Lock,
  LockOpen,
  Trash,
} from 'lucide-react';
import type { KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent } from 'react';
import { useEffect, useRef, useState } from 'react';
import { cx } from '../../utils/classNames';
import { ArcadeButton } from '../primitives/ArcadeButton';
import { ArcadeInput } from '../primitives/ArcadeInput';
import { ArcadeSelect } from '../primitives/ArcadeSelect';
import { ArcadeSlider } from '../primitives/ArcadeSlider';
import { ArcadeTooltip } from '../primitives/ArcadeTooltip';

/** Blend modes offered by the layer row, in menu order. */
const BLEND_MODE_OPTIONS: readonly { value: BlendMode; label: string }[] = [
  { value: 'source-over', label: 'Normal' },
  { value: 'multiply', label: 'Multiply' },
  { value: 'screen', label: 'Screen' },
  { value: 'overlay', label: 'Overlay' },
  { value: 'darken', label: 'Darken' },
  { value: 'lighten', label: 'Lighten' },
];

/** Where a dragged row would be inserted relative to the hovered row. */
export type LayerDropPosition = 'above' | 'below';

export interface LayerListItemProps {
  layer: PixelLayer;
  /** Project dimensions, used to size the thumbnail and validate the buffer. */
  dimensions: Dimensions;
  /** Position in the rendered stack, 0 = top of the list. */
  index: number;
  /** Total number of layers, used to disable the move caps at the ends. */
  total: number;
  isActive: boolean;
  /** False when this is the only layer (deletion is blocked, plan §Phase 3). */
  canDelete: boolean;
  /** False for the bottom layer (nothing to merge into). */
  canMergeDown: boolean;
  isDragging: boolean;
  /** Non-null while a drag hovers this row. */
  dropPosition: LayerDropPosition | null;
  onSelect: (layerId: string) => void;
  onToggleVisible: (layerId: string) => void;
  onToggleLocked: (layerId: string) => void;
  /** Receives the 0-1 opacity value. */
  onOpacityChange: (layerId: string, opacity: number) => void;
  onChangeBlendMode: (layerId: string, blendMode: BlendMode) => void;
  onRename: (layerId: string, name: string) => void;
  onDuplicate: (layerId: string) => void;
  onMergeDown: (layerId: string) => void;
  onDelete: (layerId: string) => void;
  /** Moves the layer one slot up (toward the top of the stack). */
  onMoveUp: (layerId: string) => void;
  /** Moves the layer one slot down (toward the bottom of the stack). */
  onMoveDown: (layerId: string) => void;
  onDragStart: (layerId: string) => void;
  onDragOverRow: (layerId: string, position: LayerDropPosition) => void;
  onDropRow: (layerId: string, position: LayerDropPosition) => void;
  onDragEnd: () => void;
}

/**
 * Renders a layer's raw buffer into a small preview canvas.
 *
 * Reads the `Uint32Array` directly with the canonical packing contract, so the
 * thumbnail stays correct even while the layer is hidden.
 */
function LayerThumbnail({
  layer,
  dimensions,
}: {
  layer: PixelLayer;
  dimensions: Dimensions;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext('2d');

    if (!canvas || !context) {
      return;
    }

    const { width, height } = dimensions;
    const pixels = width * height;

    if (layer.data.length < pixels) {
      // Corrupt or mismatched buffer: clear rather than paint garbage.
      context.clearRect(0, 0, canvas.width, canvas.height);
      return;
    }

    const imageData = context.createImageData(width, height);
    const target = imageData.data;

    for (let index = 0; index < pixels; index += 1) {
      const packed = layer.data[index];
      const offset = index * 4;

      target[offset] = (packed >>> 0) & 0xff;
      target[offset + 1] = (packed >>> 8) & 0xff;
      target[offset + 2] = (packed >>> 16) & 0xff;
      target[offset + 3] = (packed >>> 24) & 0xff;
    }

    context.putImageData(imageData, 0, 0);
  }, [layer.data, dimensions]);

  return (
    <canvas
      ref={canvasRef}
      width={dimensions.width}
      height={dimensions.height}
      aria-hidden="true"
      className="arcade-checker h-10 w-10 flex-none border-2 border-black"
      style={{
        imageRendering: 'pixelated',
        opacity: layer.visible ? 1 : 0.35,
      }}
    />
  );
}

/**
 * A single row in the layer stack.
 *
 * Carries the visibility/lock caps, the thumbnail, the rename field, the blend
 * mode selector, the opacity slider, and the reorder controls. Reordering works
 * by pointer drag (HTML5 drag events) and, because that is not available on
 * touch hardware, by the up/down caps and the handle's Alt+Arrow shortcuts.
 */
export function LayerListItem({
  layer,
  dimensions,
  index,
  total,
  isActive,
  canDelete,
  canMergeDown,
  isDragging,
  dropPosition,
  onSelect,
  onToggleVisible,
  onToggleLocked,
  onOpacityChange,
  onChangeBlendMode,
  onRename,
  onDuplicate,
  onMergeDown,
  onDelete,
  onMoveUp,
  onMoveDown,
  onDragStart,
  onDragOverRow,
  onDropRow,
  onDragEnd,
}: LayerListItemProps) {
  const [nameDraft, setNameDraft] = useState(layer.name);
  const [isRenaming, setIsRenaming] = useState(false);

  useEffect(() => {
    setNameDraft(layer.name);
  }, [layer.name]);

  const commitRename = (): void => {
    const trimmed = nameDraft.trim();

    if (trimmed.length === 0) {
      setNameDraft(layer.name);
      setIsRenaming(false);
      return;
    }

    if (trimmed !== layer.name) {
      onRename(layer.id, trimmed);
    }

    setIsRenaming(false);
  };

  const cancelRename = (): void => {
    setNameDraft(layer.name);
    setIsRenaming(false);
  };

  const handleRowPointerDown = (event: ReactPointerEvent<HTMLLIElement>): void => {
    // Caps and form controls handle their own activation.
    if (event.target instanceof HTMLElement && event.target.closest('button, input, [role="listbox"], textarea') !== null) {
      return;
    }

    onSelect(layer.id);
  };

  const handleHandleKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>): void => {
    if (!event.altKey) {
      return;
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      onMoveUp(layer.id);
    } else if (event.key === 'ArrowDown') {
      event.preventDefault();
      onMoveDown(layer.id);
    }
  };

  const opacityPercent = Math.round(layer.opacity * 100);

  return (
    <li
      onPointerDown={handleRowPointerDown}
      onDragOver={(event) => {
        event.preventDefault();
        const rect = event.currentTarget.getBoundingClientRect();
        const isTopHalf = event.clientY < rect.top + rect.height / 2;
        onDragOverRow(layer.id, isTopHalf ? 'above' : 'below');
      }}
      onDrop={(event) => {
        event.preventDefault();
        const rect = event.currentTarget.getBoundingClientRect();
        const isTopHalf = event.clientY < rect.top + rect.height / 2;
        onDropRow(layer.id, isTopHalf ? 'above' : 'below');
      }}
      className={cx(
        'relative flex flex-col gap-2 border-2 px-2 py-2',
        isActive
          ? 'pixel-border-inset border-arcade-neon-green bg-arcade-surface-sunken'
          : 'pixel-border-flat border-arcade-border bg-arcade-surface',
        isDragging && 'arcade-row-dragging',
        dropPosition === 'above' && 'arcade-drop-above',
        dropPosition === 'below' && 'arcade-drop-below',
      )}
    >
      {/* Header row: handle, thumbnail, name, visibility, lock ------------- */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          aria-label={`Reorder ${layer.name}. Drag, or hold Alt and press Arrow Up or Arrow Down.`}
          onKeyDown={handleHandleKeyDown}
          draggable
          onDragStart={(event) => {
            event.dataTransfer.effectAllowed = 'move';
            event.dataTransfer.setData('text/plain', layer.id);
            onDragStart(layer.id);
          }}
          onDragEnd={onDragEnd}
          className="pixel-press flex h-9 w-6 flex-none cursor-grab items-center justify-center border-2 border-arcade-border bg-arcade-surface-raised text-arcade-muted active:cursor-grabbing"
        >
          <GripVertical aria-hidden="true" className="h-3.5 w-3.5" strokeWidth={2.5} />
        </button>

        <LayerThumbnail layer={layer} dimensions={dimensions} />

        <div className="min-w-0 flex-1">
          {isRenaming ? (
            <ArcadeInput
              value={nameDraft}
              ariaLabel="Layer name"
              maxLength={40}
              autoSelectOnFocus
              onChange={setNameDraft}
              onCommit={commitRename}
              onEnter={commitRename}
              onEscape={cancelRename}
            />
          ) : (
            <button
              type="button"
              onClick={() => {
                setIsRenaming(true);
              }}
              title="Rename layer"
              className="block w-full truncate text-left text-pixel-xs uppercase text-arcade-text hover:text-arcade-neon-green"
            >
              {layer.name}
            </button>
          )}

          <span className="mt-0.5 block truncate text-pixel-xs text-arcade-muted">
            {index === 0 ? 'TOP · ' : ''}
            {opacityPercent}% · {layer.blendMode === 'source-over' ? 'Normal' : layer.blendMode}
          </span>
        </div>

        <ArcadeTooltip label={layer.visible ? 'Hide layer' : 'Show layer'}>
          <ArcadeButton
            size="icon-sm"
            variant={layer.visible ? 'secondary' : 'ghost'}
            aria-pressed={layer.visible}
            aria-label={`${layer.visible ? 'Hide' : 'Show'} layer ${layer.name}`}
            onClick={() => {
              onToggleVisible(layer.id);
            }}
          >
            {layer.visible ? (
              <Eye aria-hidden="true" className="h-3.5 w-3.5" strokeWidth={2.5} />
            ) : (
              <EyeOff aria-hidden="true" className="h-3.5 w-3.5" strokeWidth={2.5} />
            )}
          </ArcadeButton>
        </ArcadeTooltip>

        <ArcadeTooltip
          label={layer.locked ? 'Unlock layer' : 'Lock layer (blocks all edits)'}
        >
          <ArcadeButton
            size="icon-sm"
            variant={layer.locked ? 'primary' : 'ghost'}
            active={layer.locked}
            aria-pressed={layer.locked}
            aria-label={`${layer.locked ? 'Unlock' : 'Lock'} layer ${layer.name}`}
            onClick={() => {
              onToggleLocked(layer.id);
            }}
          >
            {layer.locked ? (
              <Lock aria-hidden="true" className="h-3.5 w-3.5" strokeWidth={2.5} />
            ) : (
              <LockOpen aria-hidden="true" className="h-3.5 w-3.5" strokeWidth={2.5} />
            )}
          </ArcadeButton>
        </ArcadeTooltip>
      </div>

      {/* Blend + opacity -------------------------------------------------- */}
      <div className="flex items-end gap-2">
        <ArcadeSelect
          label="Blend"
          value={layer.blendMode}
          options={BLEND_MODE_OPTIONS}
          onChange={(next) => {
            onChangeBlendMode(layer.id, next);
          }}
          className="w-28 flex-none"
        />

        <ArcadeSlider
          label="Opacity"
          value={opacityPercent}
          min={0}
          max={100}
          step={1}
          valueSuffix="%"
          onChange={(next) => {
            onOpacityChange(layer.id, next / 100);
          }}
          className="min-w-0 flex-1"
        />
      </div>

      {/* Row actions ------------------------------------------------------ */}
      <div className="flex items-center gap-1">
        <ArcadeTooltip label="Move up one slot (Alt + Arrow Up)">
          <ArcadeButton
            size="icon-sm"
            aria-label={`Move ${layer.name} up`}
            disabled={index === 0}
            onClick={() => {
              onMoveUp(layer.id);
            }}
          >
            <ChevronUp aria-hidden="true" className="h-3.5 w-3.5" strokeWidth={3} />
          </ArcadeButton>
        </ArcadeTooltip>

        <ArcadeTooltip label="Move down one slot (Alt + Arrow Down)">
          <ArcadeButton
            size="icon-sm"
            aria-label={`Move ${layer.name} down`}
            disabled={index === total - 1}
            onClick={() => {
              onMoveDown(layer.id);
            }}
          >
            <ChevronDown aria-hidden="true" className="h-3.5 w-3.5" strokeWidth={3} />
          </ArcadeButton>
        </ArcadeTooltip>

        <ArcadeTooltip label="Duplicate layer">
          <ArcadeButton
            size="icon-sm"
            aria-label={`Duplicate ${layer.name}`}
            onClick={() => {
              onDuplicate(layer.id);
            }}
          >
            <Copy aria-hidden="true" className="h-3.5 w-3.5" strokeWidth={2.5} />
          </ArcadeButton>
        </ArcadeTooltip>

        <ArcadeTooltip
          label={
            canMergeDown
              ? 'Merge into the layer below'
              : 'The bottom layer has nothing to merge into'
          }
        >
          <ArcadeButton
            size="icon-sm"
            aria-label={`Merge ${layer.name} down`}
            disabled={!canMergeDown}
            onClick={() => {
              onMergeDown(layer.id);
            }}
          >
            <ArrowDownToLine
              aria-hidden="true"
              className="h-3.5 w-3.5"
              strokeWidth={2.5}
            />
          </ArcadeButton>
        </ArcadeTooltip>

        <ArcadeTooltip
          label={canDelete ? 'Delete layer' : 'At least one layer must remain'}
        >
          <ArcadeButton
            size="icon-sm"
            variant="danger"
            aria-label={`Delete ${layer.name}`}
            disabled={!canDelete}
            onClick={() => {
              onDelete(layer.id);
            }}
            className="ml-auto"
          >
            <Trash aria-hidden="true" className="h-3.5 w-3.5" strokeWidth={2.5} />
          </ArcadeButton>
        </ArcadeTooltip>
      </div>
    </li>
  );
}
