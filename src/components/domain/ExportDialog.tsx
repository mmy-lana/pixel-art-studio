import { useState } from 'react';
import type { PixelLayer, ProjectMetadata } from '../../types';
import { cx } from '../../utils/classNames';
import { isValidHexColor, normalizeHexColor } from '../../utils/color/colorConvert';
import {
  EXPORT_SCALE_FACTORS,
  SPRITESHEET_LAYOUTS,
  downloadBlob,
  downloadTextFile,
  exportSpritesheet,
  exportToPNG,
  sanitizeFilename,
} from '../../utils/export/pngExport';
import { serializeProjectToJson } from '../../utils/export/jsonExport';
import { retroAudioEngine } from '../../utils/audio/soundSynth';
import { ArcadeButton } from '../primitives/ArcadeButton';
import { ArcadeInput } from '../primitives/ArcadeInput';
import { ArcadeModal } from '../primitives/ArcadeModal';

/** Which artefact the dialog will produce. */
type ExportMode = 'png' | 'spritesheet' | 'project';

export interface ExportDialogProps {
  open: boolean;
  onClose: () => void;
  project: ProjectMetadata;
  layers: readonly PixelLayer[];
}

/**
 * Export dialog.
 *
 * Three artefacts share one panel: a scaled PNG, a tiled spritesheet and the
 * project JSON interchange file. The PNG and sheet share the transparency toggle
 * and background colour; the project export always includes every layer,
 * including hidden ones, so a round trip is lossless.
 */
export function ExportDialog({ open, onClose, project, layers }: ExportDialogProps) {
  const [mode, setMode] = useState<ExportMode>('png');
  const [scaleFactor, setScaleFactor] = useState<number>(4);
  const [includeBackground, setIncludeBackground] = useState(false);
  const [backgroundColor, setBackgroundColor] = useState('#0c0c14');
  const [columns, setColumns] = useState(4);
  const [rows, setRows] = useState(4);
  const [padding, setPadding] = useState(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const filenameStem = sanitizeFilename(project.title);
  const colorValid = isValidHexColor(backgroundColor);

  const outputWidth =
    mode === 'spritesheet'
      ? columns * project.width * scaleFactor + padding * (columns + 1)
      : project.width * scaleFactor;

  const outputHeight =
    mode === 'spritesheet'
      ? rows * project.height * scaleFactor + padding * (rows + 1)
      : project.height * scaleFactor;

  const handleExport = async (): Promise<void> => {
    setError(null);
    setNotice(null);

    if (includeBackground && !colorValid) {
      setError('The background colour is invalid. Use #rgb, #rrggbb or #rrggbbaa.');
      return;
    }

    setBusy(true);
    const background = normalizeHexColor(backgroundColor).slice(0, 7);

    try {
      if (mode === 'project') {
        const json = serializeProjectToJson(project, layers);
        downloadTextFile(json, `${filenameStem}.pas.json`, 'application/json');
        setNotice(
          `Saved ${layers.length} layer${layers.length === 1 ? '' : 's'} as a portable project file.`,
        );
        retroAudioEngine.playActionSuccess();
        return;
      }

      const blob =
        mode === 'png'
          ? await exportToPNG(
              layers,
              project.width,
              project.height,
              scaleFactor,
              includeBackground,
              background,
            )
          : await exportSpritesheet({
              layers,
              width: project.width,
              height: project.height,
              columns,
              rows,
              scaleFactor,
              padding,
              includeBackground,
              backgroundColorHex: background,
            });

      const suffix = mode === 'png' ? `@${scaleFactor}x` : `-sheet-${columns}x${rows}@${scaleFactor}x`;

      downloadBlob(blob, `${filenameStem}${suffix}.png`);
      setNotice(
        `Exported ${outputWidth}×${outputHeight} PNG (${Math.max(1, Math.round(blob.size / 1024))} KB).`,
      );
      retroAudioEngine.playActionSuccess();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The export failed unexpectedly.');
      retroAudioEngine.playErrorBuzz();
    } finally {
      setBusy(false);
    }
  };

  return (
    <ArcadeModal
      open={open}
      onClose={onClose}
      title="Export"
      description={`${project.title} · ${project.width}×${project.height}`}
      size="lg"
      footer={
        <>
          <ArcadeButton size="md" variant="ghost" onClick={onClose}>
            Close
          </ArcadeButton>
          <ArcadeButton
            size="md"
            variant="primary"
            loading={busy}
            onClick={() => {
              void handleExport();
            }}
          >
            {mode === 'project' ? 'Save JSON' : 'Download PNG'}
          </ArcadeButton>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {/* Mode tabs ------------------------------------------------------ */}
        <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Export format">
          {(
            [
              { value: 'png' as const, label: 'PNG' },
              { value: 'spritesheet' as const, label: 'Sheet' },
              { value: 'project' as const, label: 'Project' },
            ]
          ).map((tab) => (
            <ArcadeButton
              key={tab.value}
              size="sm"
              variant={mode === tab.value ? 'primary' : 'ghost'}
              role="tab"
              aria-selected={mode === tab.value}
              onClick={() => {
                setMode(tab.value);
                setError(null);
                setNotice(null);
              }}
            >
              {tab.label}
            </ArcadeButton>
          ))}
        </div>

        {mode === 'project' ? (
          <p className="border-2 border-dashed border-arcade-border px-2 py-2 text-pixel-xs normal-case leading-relaxed text-arcade-muted">
            The project file stores every layer, including hidden and locked ones, as
            Base64 pixel data. Open it later from the library with Import.
          </p>
        ) : (
          <>
            {/* Scale ------------------------------------------------------ */}
            <div className="flex flex-col gap-2">
              <span className="text-pixel-xs uppercase text-arcade-muted">Scale</span>
              <div className="flex flex-wrap gap-1.5">
                {EXPORT_SCALE_FACTORS.map((factor) => (
                  <ArcadeButton
                    key={factor}
                    size="sm"
                    variant={scaleFactor === factor ? 'primary' : 'secondary'}
                    active={scaleFactor === factor}
                    aria-pressed={scaleFactor === factor}
                    onClick={() => {
                      setScaleFactor(factor);
                    }}
                  >
                    {factor}×
                  </ArcadeButton>
                ))}
              </div>
            </div>

            {/* Transparency --------------------------------------------- */}
            <div className="flex items-center justify-between gap-3 border-2 border-arcade-border bg-arcade-surface-sunken px-2 py-2">
              <div className="min-w-0">
                <p className="text-pixel-xs uppercase text-arcade-text">Transparency</p>
                <p className="mt-1 text-pixel-xs normal-case text-arcade-muted">
                  {includeBackground
                    ? 'Flattened onto the background colour below.'
                    : 'Transparent pixels stay transparent in the PNG.'}
                </p>
              </div>

              <ArcadeButton
                size="sm"
                variant={includeBackground ? 'primary' : 'secondary'}
                active={includeBackground}
                aria-pressed={includeBackground}
                aria-label="Toggle a flattened background"
                onClick={() => {
                  setIncludeBackground((value) => !value);
                }}
              >
                {includeBackground ? 'Opaque' : 'Alpha'}
              </ArcadeButton>
            </div>

            {includeBackground && (
              <div className="flex items-end gap-3">
                <ArcadeInput
                  label="Background colour"
                  value={backgroundColor}
                  prefix="#"
                  maxLength={9}
                  error={colorValid ? null : 'Use #rgb, #rrggbb or #rrggbbaa.'}
                  ariaLabel="Export background colour"
                  onChange={(next) => {
                    setBackgroundColor(next.replace(/^#/, ''));
                  }}
                  onCommit={setBackgroundColor}
                  className="flex-1"
                />

                <label
                  title="System colour picker"
                  className="pixel-border-outset relative flex h-11 w-11 flex-none cursor-pointer items-center justify-center border-2 border-arcade-border-light bg-arcade-surface-raised"
                >
                  <span
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-1"
                    style={{ backgroundColor: colorValid ? normalizeHexColor(backgroundColor).slice(0, 7) : '#000000' }}
                  />
                  <input
                    type="color"
                    aria-label="Pick an export background colour"
                    value={colorValid ? normalizeHexColor(backgroundColor).slice(0, 7) : '#000000'}
                    className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                    onChange={(event) => {
                      setBackgroundColor(normalizeHexColor(event.target.value).replace('#', ''));
                    }}
                  />
                </label>
              </div>
            )}

            {/* Sheet layout --------------------------------------------- */}
            {mode === 'spritesheet' && (
              <div className="flex flex-col gap-3 border-2 border-arcade-border bg-arcade-surface-sunken px-2 py-2">
                <span className="text-pixel-xs uppercase text-arcade-muted">Sheet grid</span>

                <div className="flex flex-col gap-2">
                  <span className="text-pixel-xs uppercase text-arcade-muted">Columns</span>
                  <div className="flex flex-wrap gap-1.5">
                    {SPRITESHEET_LAYOUTS.map((value) => (
                      <ArcadeButton
                        key={`columns-${value}`}
                        size="sm"
                        variant={columns === value ? 'primary' : 'secondary'}
                        aria-pressed={columns === value}
                        onClick={() => {
                          setColumns(value);
                        }}
                      >
                        {value}
                      </ArcadeButton>
                    ))}
                  </div>
                </div>

                <div className="flex flex-col gap-2">
                  <span className="text-pixel-xs uppercase text-arcade-muted">Rows</span>
                  <div className="flex flex-wrap gap-1.5">
                    {SPRITESHEET_LAYOUTS.map((value) => (
                      <ArcadeButton
                        key={`rows-${value}`}
                        size="sm"
                        variant={rows === value ? 'primary' : 'secondary'}
                        aria-pressed={rows === value}
                        onClick={() => {
                          setRows(value);
                        }}
                      >
                        {value}
                      </ArcadeButton>
                    ))}
                  </div>
                </div>

                <ArcadeInput
                  label="Padding"
                  type="number"
                  min={0}
                  max={16}
                  step={1}
                  value={String(padding)}
                  suffix="PX"
                  onChange={(next) => {
                    const parsed = Number(next);
                    setPadding(Number.isNaN(parsed) ? 0 : Math.max(0, Math.min(16, Math.round(parsed))));
                  }}
                  onCommit={(next) => {
                    const parsed = Number(next);
                    setPadding(Number.isNaN(parsed) ? 0 : Math.max(0, Math.min(16, Math.round(parsed))));
                  }}
                />
              </div>
            )}
          </>
        )}

        {/* Result preview ------------------------------------------------- */}
        <div
          className={cx(
            'flex items-center justify-between gap-3 border-2 border-arcade-border-light bg-arcade-surface px-2 py-2',
          )}
        >
          <span className="text-pixel-xs uppercase text-arcade-muted">Output</span>
          <span className="text-pixel-xs uppercase text-arcade-cyan">
            {outputWidth} × {outputHeight} px
          </span>
        </div>

        {error !== null && (
          <p role="alert" className="text-pixel-xs normal-case leading-relaxed text-arcade-red">
            {error}
          </p>
        )}

        {error === null && notice !== null && (
          <p role="status" className="text-pixel-xs normal-case leading-relaxed text-arcade-neon-green">
            {notice}
          </p>
        )}
      </div>
    </ArcadeModal>
  );
}
