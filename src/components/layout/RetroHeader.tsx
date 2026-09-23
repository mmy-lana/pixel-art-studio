import type { ReactNode } from 'react';
import type { PersistenceStatus } from '../../store/projectStore';
import {
  FolderOpen,
  Grid3x3,
  ImageDown,
  Monitor,
  Plus,
  Save,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { cx } from '../../utils/classNames';
import { ArcadeButton } from '../primitives/ArcadeButton';
import { ArcadeInput } from '../primitives/ArcadeInput';
import { ArcadeTooltip } from '../primitives/ArcadeTooltip';

export interface RetroHeaderProps {
  projectTitle: string;
  dimensions: { width: number; height: number };
  /** Autosave lifecycle state, shown as a lamp plus a label. */
  saveStatus: PersistenceStatus;
  lastError: string | null;
  hasUnsavedChanges: boolean;
  scanlinesEnabled: boolean;
  soundEnabled: boolean;
  gridVisible: boolean;
  onToggleScanlines: () => void;
  onToggleSound: () => void;
  onToggleGrid: () => void;
  onNewProject: () => void;
  onOpenLibrary: () => void;
  onOpenExport: () => void;
  onRenameProject: (title: string) => void;
  /** Extra caps rendered beside the status lamp (mobile drawer toggles). */
  accessory?: ReactNode;
  className?: string;
}

const SAVE_STATUS_META: Record<
  PersistenceStatus,
  { label: string; ledClass: string; textClass: string }
> = {
  idle: { label: 'READY', ledClass: 'led-cyan', textClass: 'text-arcade-cyan' },
  loading: { label: 'READING', ledClass: 'led-amber led-pulse', textClass: 'text-arcade-amber' },
  saving: { label: 'SAVING', ledClass: 'led-amber led-pulse', textClass: 'text-arcade-amber' },
  saved: { label: 'SAVED', ledClass: 'led-green', textClass: 'text-arcade-neon-green' },
  error: { label: 'FAILED', ledClass: 'led-red led-pulse', textClass: 'text-arcade-red' },
};

/**
 * Cabinet marquee: identity, project title, autosave lamp and the global action
 * caps.
 *
 * The title field keeps a local draft and only commits on Enter/blur, so typing
 * never writes to the store (and therefore never schedules an autosave) on every
 * keystroke.
 */
export function RetroHeader({
  projectTitle,
  dimensions,
  saveStatus,
  lastError,
  hasUnsavedChanges,
  scanlinesEnabled,
  soundEnabled,
  gridVisible,
  onToggleScanlines,
  onToggleSound,
  onToggleGrid,
  onNewProject,
  onOpenLibrary,
  onOpenExport,
  onRenameProject,
  accessory,
  className,
}: RetroHeaderProps) {
  const [titleDraft, setTitleDraft] = useState(projectTitle);

  useEffect(() => {
    setTitleDraft(projectTitle);
  }, [projectTitle]);

  const statusMeta = lastError !== null ? SAVE_STATUS_META.error : SAVE_STATUS_META[saveStatus];

  const commitTitle = (next: string): void => {
    const trimmed = next.trim();

    if (trimmed.length === 0) {
      setTitleDraft(projectTitle);
      return;
    }

    if (trimmed !== projectTitle) {
      onRenameProject(trimmed);
    }
  };

  return (
    <header
      className={cx(
        'relative z-30 flex flex-none flex-col gap-1.5 border-b-2 border-black bg-arcade-surface px-2 py-2',
        className,
      )}
      style={{ paddingTop: 'max(0.5rem, env(safe-area-inset-top, 0px))' }}
    >
      <div className="flex items-center gap-2">
        <span className="flex-none text-pixel-sm uppercase text-arcade-neon-green">
          PIXEL ART STUDIO
        </span>

        <span className="arcade-badge hidden flex-none px-1.5 py-0.5 text-pixel-xs tabular-nums text-arcade-cyan phone:inline-block">
          {dimensions.width}×{dimensions.height}
        </span>

        <span
          className={cx(
            'ml-auto flex flex-none items-center gap-1.5 text-pixel-xs uppercase',
            statusMeta.textClass,
          )}
          role="status"
          aria-live="polite"
          title={lastError ?? undefined}
        >
          <span aria-hidden="true" className={cx('led', statusMeta.ledClass)} />
          {statusMeta.label}
        </span>

        {accessory}
      </div>

      <div className="flex items-center gap-1.5">
        <ArcadeInput
          value={titleDraft}
          ariaLabel="Project title"
          maxLength={48}
          onChange={setTitleDraft}
          onCommit={commitTitle}
          onEnter={() => {
            commitTitle(titleDraft);
          }}
          onEscape={() => {
            setTitleDraft(projectTitle);
          }}
          className="min-w-0 flex-1"
        />

        <ArcadeTooltip label="New project">
          <ArcadeButton size="icon" aria-label="New project" onClick={onNewProject}>
            <Plus aria-hidden="true" className="h-4 w-4" strokeWidth={3} />
          </ArcadeButton>
        </ArcadeTooltip>

        <ArcadeTooltip label="Project library">
          <ArcadeButton
            size="icon"
            aria-label="Open the project library"
            onClick={onOpenLibrary}
          >
            <FolderOpen aria-hidden="true" className="h-4 w-4" strokeWidth={2.5} />
          </ArcadeButton>
        </ArcadeTooltip>

        <ArcadeTooltip label="Export PNG, sheet or project file">
          <ArcadeButton
            size="icon"
            variant="primary"
            aria-label="Export"
            onClick={onOpenExport}
          >
            <ImageDown aria-hidden="true" className="h-4 w-4" strokeWidth={2.5} />
          </ArcadeButton>
        </ArcadeTooltip>

        {/* Wrapper owns the responsive display: the cap itself is always flex. */}
        <span className="hidden phone:inline-flex">
          <ArcadeTooltip label={gridVisible ? 'Hide the pixel grid' : 'Show the pixel grid'}>
            <ArcadeButton
              size="icon"
              variant={gridVisible ? 'secondary' : 'ghost'}
              active={gridVisible}
              aria-pressed={gridVisible}
              aria-label="Toggle the pixel grid"
              onClick={onToggleGrid}
            >
              <Grid3x3 aria-hidden="true" className="h-4 w-4" strokeWidth={2.5} />
            </ArcadeButton>
          </ArcadeTooltip>
        </span>

        <span className="hidden tablet:inline-flex">
          <ArcadeTooltip
            label={scanlinesEnabled ? 'Turn the CRT filter off' : 'Turn the CRT filter on'}
          >
            <ArcadeButton
              size="icon"
              variant={scanlinesEnabled ? 'secondary' : 'ghost'}
              active={scanlinesEnabled}
              aria-pressed={scanlinesEnabled}
              aria-label="Toggle the CRT scanline filter"
              onClick={onToggleScanlines}
            >
              <Monitor aria-hidden="true" className="h-4 w-4" strokeWidth={2.5} />
            </ArcadeButton>
          </ArcadeTooltip>
        </span>

        <ArcadeTooltip label={soundEnabled ? 'Mute sound effects' : 'Unmute sound effects'}>
          <ArcadeButton
            size="icon"
            variant={soundEnabled ? 'secondary' : 'ghost'}
            active={soundEnabled}
            aria-pressed={soundEnabled}
            aria-label="Toggle sound effects"
            onClick={onToggleSound}
          >
            {soundEnabled ? (
              <Volume2 aria-hidden="true" className="h-4 w-4" strokeWidth={2.5} />
            ) : (
              <VolumeX aria-hidden="true" className="h-4 w-4" strokeWidth={2.5} />
            )}
          </ArcadeButton>
        </ArcadeTooltip>
      </div>

      {hasUnsavedChanges && (
        <span className="flex items-center gap-1.5 text-pixel-xs uppercase text-arcade-amber">
          <Save aria-hidden="true" className="h-3 w-3" />
          Unsaved changes
        </span>
      )}
    </header>
  );
}
