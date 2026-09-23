import type { ProjectMetadata, StorageUsageEstimate } from '../../types';
import type { PersistenceStatus } from '../../store/projectStore';
import { Copy, FolderOpen, Upload } from 'lucide-react';
import { useRef, useState } from 'react';
import { cx } from '../../utils/classNames';
import { ProjectJsonError, parseProjectJson } from '../../utils/export/jsonExport';
import { retroAudioEngine } from '../../utils/audio/soundSynth';
import { ArcadeButton } from '../primitives/ArcadeButton';
import { ArcadeModal } from '../primitives/ArcadeModal';
import { ArcadeTooltip } from '../primitives/ArcadeTooltip';

export interface ProjectLibraryModalProps {
  open: boolean;
  onClose: () => void;
  /** Saved projects, most recently updated first. */
  projects: readonly ProjectMetadata[];
  /** Id of the project currently open in the editor. */
  activeProjectId: string;
  status: PersistenceStatus;
  lastError: string | null;
  storageEstimate: StorageUsageEstimate | null;
  onLoad: (projectId: string) => void;
  onDuplicate: (projectId: string) => void;
  onDelete: (projectId: string) => void;
  onRefresh: () => void;
  /**
   * Receives a validated parsed project plus the originating file name. The
   * modal performs the JSON parsing so the caller only has to persist and open
   * the result.
   */
  onImportProject: (payload: { project: ProjectMetadata; layers: ReturnType<typeof parseProjectJson>['layers'] }) => void;
  onClearError: () => void;
}

/** Formats a byte count for the storage gauge. */
function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }

  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }

  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Relative "last edited" label. */
function formatRelativeTime(timestamp: number): string {
  const deltaSeconds = Math.max(0, Math.round((Date.now() - timestamp) / 1000));

  if (deltaSeconds < 60) {
    return 'just now';
  }

  if (deltaSeconds < 3600) {
    return `${Math.round(deltaSeconds / 60)}m ago`;
  }

  if (deltaSeconds < 86400) {
    return `${Math.round(deltaSeconds / 3600)}h ago`;
  }

  return `${Math.round(deltaSeconds / 86400)}d ago`;
}

/**
 * Local project library.
 *
 * Lists everything in IndexedDB with its thumbnail, loads, duplicates and deletes
 * projects, imports an exported project file, and surfaces storage pressure. The
 * currently open project cannot be deleted (the store refuses it too), and every
 * destructive action asks for confirmation first.
 */
export function ProjectLibraryModal({
  open,
  onClose,
  projects,
  activeProjectId,
  status,
  lastError,
  storageEstimate,
  onLoad,
  onDuplicate,
  onDelete,
  onRefresh,
  onImportProject,
  onClearError,
}: ProjectLibraryModalProps) {
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const isBusy = status === 'loading' || status === 'saving';

  const handleImportFile = async (file: File): Promise<void> => {
    setImportError(null);
    onClearError();

    try {
      const text = await file.text();
      const payload = parseProjectJson(text);

      onImportProject(payload);
      retroAudioEngine.playActionSuccess();
    } catch (error) {
      setImportError(
        error instanceof ProjectJsonError
          ? error.message
          : `Could not read "${file.name}". It may not be a project file.`,
      );
      retroAudioEngine.playErrorBuzz();
    }
  };

  return (
    <ArcadeModal
      open={open}
      onClose={onClose}
      title="Project Library"
      description="Everything saved in this browser."
      size="lg"
      footer={
        <>
          <ArcadeButton size="md" variant="ghost" onClick={onRefresh} disabled={isBusy}>
            Refresh
          </ArcadeButton>

          <ArcadeButton
            size="md"
            variant="secondary"
            leadingIcon={<Upload aria-hidden="true" className="h-4 w-4" strokeWidth={2.5} />}
            disabled={isBusy}
            onClick={() => {
              fileInputRef.current?.click();
            }}
          >
            Import
          </ArcadeButton>

          <ArcadeButton size="md" variant="primary" onClick={onClose}>
            Close
          </ArcadeButton>
        </>
      }
    >
      <input
        ref={fileInputRef}
        type="file"
        accept="application/json,.json"
        className="sr-only"
        aria-label="Import a project file"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = '';

          if (file) {
            void handleImportFile(file);
          }
        }}
      />

      <div className="flex flex-col gap-3">
        {/* Storage gauge ------------------------------------------------- */}
        {storageEstimate !== null && (
          <div className="flex flex-col gap-1.5 border-2 border-arcade-border bg-arcade-surface-sunken px-2 py-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-pixel-xs uppercase text-arcade-muted">Storage used</span>
              <span className="text-pixel-xs tabular-nums text-arcade-cyan">
                {formatBytes(storageEstimate.usageBytes)} / {formatBytes(storageEstimate.quotaBytes)}
              </span>
            </div>

            <div
              role="meter"
              aria-label="Storage used"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(storageEstimate.percentUsed * 100)}
              className="h-2 w-full border border-black bg-arcade-ink"
            >
              <div
                className={cx(
                  'h-full',
                  storageEstimate.percentUsed > 0.85
                    ? 'bg-arcade-red'
                    : storageEstimate.percentUsed > 0.6
                      ? 'bg-arcade-amber'
                      : 'bg-arcade-neon-green',
                )}
                style={{ width: `${Math.max(2, storageEstimate.percentUsed * 100)}%` }}
              />
            </div>
          </div>
        )}

        {lastError !== null && (
          <div
            role="alert"
            className="flex items-start justify-between gap-2 border-2 border-arcade-red bg-arcade-surface-sunken px-2 py-2"
          >
            <span className="text-pixel-xs normal-case leading-relaxed text-arcade-red">
              {lastError}
            </span>
            <ArcadeButton size="sm" variant="ghost" onClick={onClearError}>
              Dismiss
            </ArcadeButton>
          </div>
        )}

        {importError !== null && (
          <p role="alert" className="text-pixel-xs normal-case leading-relaxed text-arcade-red">
            {importError}
          </p>
        )}

        {status === 'loading' && (
          <p className="flex items-center gap-2 text-pixel-xs uppercase text-arcade-cyan">
            <span aria-hidden="true" className="arcade-spinner" />
            Reading local storage…
          </p>
        )}

        {/* Project list -------------------------------------------------- */}
        {projects.length === 0 ? (
          <div className="flex flex-col items-center gap-2 border-2 border-dashed border-arcade-border px-3 py-8 text-center">
            <FolderOpen aria-hidden="true" className="h-7 w-7 text-arcade-border-light" strokeWidth={2} />
            <p className="text-pixel-xs normal-case leading-relaxed text-arcade-muted">
              No saved projects yet. Anything you draw is written here automatically.
            </p>
            <ArcadeButton size="sm" variant="secondary" onClick={onRefresh}>
              Check again
            </ArcadeButton>
          </div>
        ) : (
          <ul className="arcade-scroll flex max-h-[46vh] flex-col gap-2 overflow-y-auto pr-0.5">
            {projects.map((project) => {
              const isActive = project.id === activeProjectId;
              const isPendingDelete = project.id === pendingDeleteId;

              return (
                <li
                  key={project.id}
                  className={cx(
                    'flex flex-col gap-2 border-2 px-2 py-2',
                    isActive
                      ? 'border-arcade-neon-green bg-arcade-surface-sunken'
                      : 'border-arcade-border bg-arcade-surface',
                  )}
                >
                  <div className="flex items-center gap-3">
                    <span className="arcade-checker flex h-12 w-12 flex-none items-center justify-center border-2 border-black">
                      {project.thumbnailUrl !== null ? (
                        <img
                          src={project.thumbnailUrl}
                          alt=""
                          aria-hidden="true"
                          className="h-full w-full object-contain"
                          style={{ imageRendering: 'pixelated' }}
                        />
                      ) : (
                        <span className="text-pixel-xs text-arcade-muted">—</span>
                      )}
                    </span>

                    <div className="min-w-0 flex-1">
                      <p className="truncate text-pixel-xs uppercase text-arcade-text">
                        {project.title}
                        {isActive && (
                          <span className="ml-2 text-arcade-neon-green">● OPEN</span>
                        )}
                      </p>
                      <p className="mt-1 truncate text-pixel-xs text-arcade-muted">
                        {project.width}×{project.height} · {project.fps} FPS ·{' '}
                        {formatRelativeTime(project.updatedAt)}
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5">
                    <ArcadeButton
                      size="sm"
                      variant={isActive ? 'ghost' : 'primary'}
                      disabled={isActive || isBusy}
                      aria-label={`Open ${project.title}`}
                      onClick={() => {
                        retroAudioEngine.playToolSelect();
                        onLoad(project.id);
                      }}
                    >
                      {isActive ? 'Open' : 'Load'}
                    </ArcadeButton>

                    <ArcadeTooltip label="Copy this project, including every layer">
                      <ArcadeButton
                        size="sm"
                        variant="secondary"
                        disabled={isBusy}
                        aria-label={`Duplicate ${project.title}`}
                        leadingIcon={<Copy aria-hidden="true" className="h-3.5 w-3.5" strokeWidth={2.5} />}
                        onClick={() => {
                          onDuplicate(project.id);
                        }}
                      >
                        Copy
                      </ArcadeButton>
                    </ArcadeTooltip>

                    {isPendingDelete ? (
                      <span className="ml-auto flex items-center gap-1.5">
                        <ArcadeButton
                          size="sm"
                          variant="danger"
                          disabled={isBusy}
                          aria-label={`Confirm deleting ${project.title}`}
                          onClick={() => {
                            onDelete(project.id);
                            setPendingDeleteId(null);
                          }}
                        >
                          Confirm
                        </ArcadeButton>
                        <ArcadeButton
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            setPendingDeleteId(null);
                          }}
                        >
                          Keep
                        </ArcadeButton>
                      </span>
                    ) : (
                      <ArcadeTooltip
                        label={
                          isActive
                            ? 'The open project cannot be deleted'
                            : 'Delete this project and its layers'
                        }
                      >
                        <ArcadeButton
                          size="sm"
                          variant="danger"
                          disabled={isActive || isBusy}
                          aria-label={`Delete ${project.title}`}
                          className="ml-auto"
                          onClick={() => {
                            setPendingDeleteId(project.id);
                          }}
                        >
                          Delete
                        </ArcadeButton>
                      </ArcadeTooltip>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </ArcadeModal>
  );
}
