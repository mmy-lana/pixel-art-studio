import type { ToolType } from '../../types';
import { ArcadeButton } from '../primitives/ArcadeButton';
import { ArcadeSlider } from '../primitives/ArcadeSlider';
import { ArcadeTooltip } from '../primitives/ArcadeTooltip';
import { cx } from '../../utils/classNames';
import { TOOL_DEFINITIONS } from '../../utils/tools/toolDefinitions';

/** Layout arrangement of the tool caps. */
export type ToolsetLayout = 'rail' | 'grid' | 'carousel';

export interface ToolsetPanelProps {
  /** Currently selected tool. */
  activeTool: ToolType;
  onSelectTool: (tool: ToolType) => void;
  /** Brush diameter in pixels, 1-`maxBrushSize`. */
  brushSize: number;
  onBrushSizeChange: (size: number) => void;
  /** Upper bound for the brush slider. Defaults to `8`. */
  maxBrushSize?: number;
  /**
   * `rail` renders the vertical desktop rail, `grid` the tablet/drawer grid and
   * `carousel` the horizontally scrolling mobile dock.
   */
  layout?: ToolsetLayout;
  /**
   * Caps the number of rendered caps. Plan §4.1 requires four primary tools on
   * 360-389px phones, five on 390-429px, and the full set above that.
   */
  maxTools?: number;
  /** Renders the brush-size slider under the caps. Defaults to `true`. */
  showBrushSize?: boolean;
  /** Restricts the caps to the four tools that fit the smallest phone dock. */
  compact?: boolean;
  /** Extra classes for the wrapper. */
  className?: string;
}

const LAYOUT_CLASSES: Record<ToolsetLayout, string> = {
  rail: 'flex flex-col items-center gap-1.5',
  grid: 'grid grid-cols-4 gap-1.5',
  carousel: 'flex flex-row items-center gap-1.5',
};

const CAP_SIZE_BY_LAYOUT: Record<ToolsetLayout, 'icon' | 'icon' | 'icon'> = {
  rail: 'icon',
  grid: 'icon',
  carousel: 'icon',
};

const TOOL_GROUPS: readonly (readonly ToolType[])[] = [
  ['pencil', 'eraser', 'bucket', 'eyedropper'],
  ['line', 'rectangle', 'circle'],
  ['select', 'pan'],
];

/**
 * Tool selection module.
 *
 * Every cap carries an LED that lights while its tool is active, plus a tooltip
 * showing the tool name, a one-line explanation and its keyboard shortcut, so
 * the shortcut never has to be discovered by trial and error.
 */
export function ToolsetPanel({
  activeTool,
  onSelectTool,
  brushSize,
  onBrushSizeChange,
  maxBrushSize = 8,
  layout = 'rail',
  maxTools,
  showBrushSize = true,
  compact = false,
  className,
}: ToolsetPanelProps) {
  const available = compact
    ? TOOL_DEFINITIONS.filter((definition) => definition.compactDock)
    : TOOL_DEFINITIONS;

  const tools = typeof maxTools === 'number' ? available.slice(0, Math.max(1, maxTools)) : available;

  return (
    <div className={cx('flex flex-col gap-3', className)}>
      {layout === 'rail' ? (
        <div className="flex flex-col items-center gap-2" role="group" aria-label="Drawing tools">
          {TOOL_GROUPS.map((group, groupIndex) => (
            <div key={`group-${groupIndex}`} className="flex flex-col items-center gap-1.5">
              {groupIndex > 0 && <span aria-hidden="true" className="arcade-divider my-0.5 w-7" />}
              {group.map((toolId) => {
                const definition = tools.find((tool) => tool.id === toolId);
                if (!definition) return null;
                const Icon = definition.icon;
                const isActive = definition.id === activeTool;

                return (
                  <ArcadeTooltip
                    key={definition.id}
                    label={`${definition.label} — ${definition.description}`}
                    hotkey={definition.hotkey ?? undefined}
                    placement="right"
                  >
                    <ArcadeButton
                      size={CAP_SIZE_BY_LAYOUT[layout]}
                      variant={isActive ? 'primary' : 'secondary'}
                      active={isActive}
                      aria-pressed={isActive}
                      aria-label={`${definition.label} tool${definition.hotkey !== null ? ` (${definition.hotkey})` : ''}`}
                      onClick={() => {
                        onSelectTool(definition.id);
                      }}
                      className={cx(
                        'relative transition-all',
                        isActive && 'ring-2 ring-arcade-cyan shadow-[0_0_8px_rgba(0,255,102,0.6)]'
                      )}
                    >
                      <span className="relative flex items-center justify-center">
                        <Icon aria-hidden="true" className="h-5 w-5" strokeWidth={2.5} />
                        {isActive && (
                          <span
                            aria-hidden="true"
                            className="led led-green absolute -right-2 -top-2"
                          />
                        )}
                      </span>
                    </ArcadeButton>
                  </ArcadeTooltip>
                );
              })}
            </div>
          ))}
        </div>
      ) : (
        <div className={LAYOUT_CLASSES[layout]} role="group" aria-label="Drawing tools">
          {tools.map((definition) => {
            const Icon = definition.icon;
            const isActive = definition.id === activeTool;

            return (
              <ArcadeTooltip
                key={definition.id}
                label={`${definition.label} — ${definition.description}`}
                hotkey={definition.hotkey ?? undefined}
                placement="top"
              >
                <ArcadeButton
                  size={CAP_SIZE_BY_LAYOUT[layout]}
                  variant="secondary"
                  active={isActive}
                  aria-pressed={isActive}
                  aria-label={`${definition.label} tool${definition.hotkey !== null ? ` (${definition.hotkey})` : ''}`}
                  onClick={() => {
                    onSelectTool(definition.id);
                  }}
                  className="relative"
                >
                  <span className="relative flex items-center justify-center">
                    <Icon aria-hidden="true" className="h-5 w-5" strokeWidth={2.5} />

                    {isActive && (
                      <span
                        aria-hidden="true"
                        className="led led-green absolute -right-2 -top-2"
                      />
                    )}
                  </span>
                </ArcadeButton>
              </ArcadeTooltip>
            );
          })}
        </div>
      )}

      {showBrushSize && (
        <div className="px-0.5">
          <ArcadeSlider
            label="Brush"
            value={brushSize}
            min={1}
            max={maxBrushSize}
            step={1}
            showTicks={maxBrushSize <= 8}
            valueSuffix="PX"
            onChange={onBrushSizeChange}
          />
        </div>
      )}
    </div>
  );
}
