import type { ToolType } from '../../types';
import { Layers, Palette } from 'lucide-react';
import { cx } from '../../utils/classNames';
import { TOOL_DEFINITIONS } from '../../utils/tools/toolDefinitions';
import { ArcadeButton } from '../primitives/ArcadeButton';
import { ArcadeToggle } from '../primitives/ArcadeToggle';
import { ArcadeTooltip } from '../primitives/ArcadeTooltip';
import { HistoryControls } from '../compound/HistoryControls';

/** Which drawer panel a dock cap opens. */
export type MobileDockTarget = 'tools' | 'colours' | 'layers';

export interface MobileToolCarouselProps {
  activeTool: ToolType;
  onSelectTool: (tool: ToolType) => void;
  primaryColor: string;
  secondaryColor: string;
  /** Swaps primary and secondary, fired from the colour chip. */
  onSwapColors: () => void;
  /** Opens the control drawer on the given tab. */
  onOpenDrawer: (target: MobileDockTarget) => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  /** Opens the project library. */
  onOpenLibrary: () => void;
  layerCount: number;
  /** Mirrors the layer panel's active flag on the layers cap. */
  layersPanelOpen: boolean;
  className?: string;
}

/**
 * Mobile bottom dock (plan §4.1).
 *
 * The caps are ordered by dock priority (pencil, eraser, fill, picker, then the
 * geometry tools), so the four primary tools are always on screen at 360px and
 * the remainder scroll horizontally instead of overflowing. Zoom controls are
 * deliberately NOT here — the plan requires them inside the pull-up drawer.
 */
export function MobileToolCarousel({
  activeTool,
  onSelectTool,
  primaryColor,
  secondaryColor,
  onSwapColors,
  onOpenDrawer,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onOpenLibrary,
  layerCount,
  layersPanelOpen,
  className,
}: MobileToolCarouselProps) {
  return (
    <nav
      className={cx(
        'relative z-30 flex flex-none items-center gap-1.5 border-t-2 border-black bg-arcade-surface px-2 py-1.5',
        className,
      )}
      style={{ paddingBottom: 'max(0.375rem, env(safe-area-inset-bottom, 0px))' }}
      aria-label="Tools and actions"
    >
      {/* Undo / redo: inline on the dock, promoted to a floating overlay at 430px. */}
      <HistoryControls
        canUndo={canUndo}
        canRedo={canRedo}
        undoActionName={null}
        redoActionName={null}
        onUndo={onUndo}
        onRedo={onRedo}
        historyDepth={0}
        variant="compact"
        className="phone:hidden"
      />

      {/* Tool caps: 44px minimum, horizontally scrollable. */}
      <ul className="no-scrollbar flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto">
        {TOOL_DEFINITIONS.map((definition) => {
          const Icon = definition.icon;
          const isActive = definition.id === activeTool;

          return (
            <li key={definition.id} className="flex-none">
              <ArcadeButton
                size="icon"
                variant={isActive ? 'primary' : 'secondary'}
                active={isActive}
                aria-pressed={isActive}
                aria-label={`${definition.label} tool${definition.hotkey !== null ? ` (${definition.hotkey})` : ''}`}
                onClick={() => {
                  onSelectTool(definition.id);
                }}
              >
                <span className="relative flex items-center justify-center">
                  <Icon aria-hidden="true" className="h-5 w-5" strokeWidth={2.5} />
                  {isActive && (
                    <span aria-hidden="true" className="led led-green absolute -right-2 -top-2" />
                  )}
                </span>
              </ArcadeButton>
            </li>
          );
        })}
      </ul>

      {/* Colour chip: primary over secondary, tap to open the picker. */}
      <ArcadeTooltip label="Colours — tap to open the palette">
        <button
          type="button"
          aria-label="Open the colour panel"
          onClick={() => {
            onOpenDrawer('colours');
          }}
          className="pixel-border-outset relative h-11 w-11 flex-none border-2 border-arcade-border-light bg-arcade-surface-raised"
        >
          <span
            aria-hidden="true"
            className="absolute bottom-1 right-1 h-4 w-4 border-2 border-black"
            style={{ backgroundColor: secondaryColor.slice(0, 7) }}
          />
          <span
            aria-hidden="true"
            className="absolute left-1 top-1 h-5 w-5 border-2 border-black"
            style={{ backgroundColor: primaryColor.slice(0, 7) }}
          />
        </button>
      </ArcadeTooltip>

      {/* Wrapper owns the responsive display: the caps themselves are always flex. */}
      <span className="hidden phone:inline-flex">
        <ArcadeToggle
          checked={layersPanelOpen}
          onChange={() => {
            onOpenDrawer('layers');
          }}
          size="sm"
          ledColor="cyan"
          aria-label="Toggle the layers drawer"
        />
      </span>

      <ArcadeTooltip label="Layers">
        <ArcadeButton
          size="icon"
          variant={layersPanelOpen ? 'primary' : 'secondary'}
          active={layersPanelOpen}
          aria-label={`Open layers (${layerCount})`}
          onClick={() => {
            onOpenDrawer('layers');
          }}
        >
          <span className="relative flex items-center justify-center">
            <Layers aria-hidden="true" className="h-4 w-4" strokeWidth={2.5} />
            <span
              aria-hidden="true"
              className="absolute -bottom-1 -right-1 bg-arcade-ink px-0.5 text-pixel-xs leading-none text-arcade-cyan"
            >
              {layerCount}
            </span>
          </span>
        </ArcadeButton>
      </ArcadeTooltip>

      <ArcadeTooltip label="Palette and colours">
        <ArcadeButton
          size="icon"
          aria-label="Open the palette manager"
          onClick={() => {
            onOpenDrawer('colours');
          }}
        >
          <Palette aria-hidden="true" className="h-4 w-4" strokeWidth={2.5} />
        </ArcadeButton>
      </ArcadeTooltip>

      <span className="hidden phone:inline-flex">
        <ArcadeButton size="icon" aria-label="Project library" onClick={onOpenLibrary}>
          <span aria-hidden="true" className="text-pixel-xs">
            LIB
          </span>
        </ArcadeButton>
      </span>

      <span className="hidden xs:inline-flex">
        <ArcadeButton
          size="icon"
          variant="ghost"
          aria-label="Swap primary and secondary colours"
          onClick={onSwapColors}
        >
          <span aria-hidden="true" className="text-pixel-xs">
            ⇄
          </span>
        </ArcadeButton>
      </span>
    </nav>
  );
}
