import type { ReactNode } from 'react';
import type { PersistenceStatus } from '../../store/projectStore';
import type { Dimensions, ToolType } from '../../types';
import { PanelRightClose, PanelRightOpen } from 'lucide-react';
import { cx } from '../../utils/classNames';
import { getToolDefinition } from '../../utils/tools/toolDefinitions';
import { ArcadeButton } from '../primitives/ArcadeButton';
import { ArcadeTooltip } from '../primitives/ArcadeTooltip';

/** Values rendered in the cabinet's status bar. */
export interface WorkbenchStatus {
  dimensions: Dimensions;
  activeTool: ToolType;
  /** Brush diameter in pixels. */
  brushSize: number;
  zoom: number;
  historyDepth: number;
  historyLimit: number;
  layerCount: number;
  saveStatus: PersistenceStatus;
  hasUnsavedChanges: boolean;
}

export interface MainWorkbenchProps {
  /** Tool rail content (tablet and desktop only). */
  toolRail: ReactNode;
  /** The canvas engine. */
  canvas: ReactNode;
  /** Right-hand panel stack. */
  rightPanel: ReactNode;
  /** Controls pinned to the bottom of the right panel. */
  rightPanelFooter?: ReactNode;
  /** Status readout values. */
  status: WorkbenchStatus;
  /** Whether the right panel is expanded. */
  panelOpen: boolean;
  onTogglePanel: () => void;
  className?: string;
}

const STATUS_LABEL: Record<PersistenceStatus, string> = {
  idle: 'READY',
  loading: 'READING',
  saving: 'SAVING',
  saved: 'SAVED',
  error: 'ERROR',
};

/**
 * Tablet and desktop workbench frame (plan §4.1).
 *
 * Two-column layout from 768px (48px rail, flexible canvas, collapsible 260px
 * drawer) widening to the arcade cabinet at 1024px (64px rail, 320px panel, with
 * the CRT scanline toggle living in the header). The status bar is part of the
 * frame, exactly like the marquee of a real cabinet.
 */
export function MainWorkbench({
  toolRail,
  canvas,
  rightPanel,
  rightPanelFooter,
  status,
  panelOpen,
  onTogglePanel,
  className,
}: MainWorkbenchProps) {
  const tool = getToolDefinition(status.activeTool);

  return (
    <div className={cx('flex min-h-0 flex-1 flex-col', className)}>
      <div className="flex min-h-0 flex-1">
        {/* Tool rail: 48px on tablet, 64px from 1024px. */}
        <aside
          className="arcade-border-arcade hidden flex-none flex-col items-center gap-2 border-r-2 border-black bg-arcade-surface py-2 tablet:flex tablet:w-rail-tablet desktop:w-rail-desktop"
          aria-label="Tools"
        >
          {toolRail}
        </aside>

        {/* Canvas deck. */}
        <main className="relative flex min-h-0 min-w-0 flex-1 flex-col bg-arcade-ink">
          <div className="relative min-h-0 flex-1">{canvas}</div>
        </main>

        {/* Right drawer: 260px on tablet, 320px from 1024px. */}
        <aside
          className={cx(
            'hidden flex-none flex-col border-l-2 border-black bg-arcade-surface tablet:flex',
            panelOpen ? 'tablet:w-[260px] desktop:w-[320px]' : 'tablet:w-11',
          )}
          aria-label="Panels"
        >
          <div className="flex flex-none items-center justify-between gap-1 border-b-2 border-arcade-border px-1 py-1">
            {panelOpen && (
              <span className="truncate pl-1 text-pixel-xs uppercase text-arcade-muted">
                Controls
              </span>
            )}

            <ArcadeTooltip
              label={panelOpen ? 'Collapse the panel column' : 'Expand the panel column'}
            >
              <ArcadeButton
                size="icon-sm"
                aria-label={panelOpen ? 'Collapse panels' : 'Expand panels'}
                aria-expanded={panelOpen}
                className="ml-auto"
                onClick={onTogglePanel}
              >
                {panelOpen ? (
                  <PanelRightClose aria-hidden="true" className="h-4 w-4" strokeWidth={2.5} />
                ) : (
                  <PanelRightOpen aria-hidden="true" className="h-4 w-4" strokeWidth={2.5} />
                )}
              </ArcadeButton>
            </ArcadeTooltip>
          </div>

          {panelOpen && (
            <>
              <div className="arcade-scroll min-h-0 flex-1 overflow-y-auto p-2">{rightPanel}</div>

              {rightPanelFooter !== undefined && (
                <div className="flex-none border-t-2 border-arcade-border p-2">
                  {rightPanelFooter}
                </div>
              )}
            </>
          )}
        </aside>
      </div>

      {/* Persistent status bar. */}
      <footer
        className="flex flex-none flex-wrap items-center gap-x-3 gap-y-1 border-t-2 border-black bg-arcade-surface px-2 py-1.5 text-pixel-xs uppercase text-arcade-muted"
        style={{ paddingBottom: 'max(0.375rem, env(safe-area-inset-bottom, 0px))' }}
      >
        <span className="flex items-center gap-1.5">
          <span aria-hidden="true" className="led led-green" />
          {STATUS_LABEL[status.saveStatus]}
        </span>

        <span className="tabular-nums text-arcade-cyan">
          {status.dimensions.width}×{status.dimensions.height}
        </span>

        <span className="text-arcade-text">{tool.label}</span>
        <span className="tabular-nums">BRUSH {status.brushSize} PX</span>
        <span className="tabular-nums text-arcade-cyan">{Math.round(status.zoom * 100)}%</span>
        <span className="tabular-nums">
          LAYERS {status.layerCount}
        </span>
        <span className="tabular-nums">
          HIST {status.historyDepth}/{status.historyLimit}
        </span>

        {status.hasUnsavedChanges && (
          <span className="ml-auto text-arcade-amber">UNSAVED</span>
        )}
      </footer>
    </div>
  );
}
