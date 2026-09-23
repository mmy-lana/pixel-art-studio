import type { ColorPalette } from '../../types';
import { Copy, Download, Plus, Trash, Upload } from 'lucide-react';
import { useMemo, useState } from 'react';
import { cx } from '../../utils/classNames';
import { isValidHexColor, normalizeHexColor } from '../../utils/color/colorConvert';
import { parseHexList, serializeHexList } from '../../utils/color/presetPalettes';
import { retroAudioEngine } from '../../utils/audio/soundSynth';
import { ArcadeButton } from '../primitives/ArcadeButton';
import { ArcadeInput } from '../primitives/ArcadeInput';
import { ArcadeSelect } from '../primitives/ArcadeSelect';
import { ArcadeTooltip } from '../primitives/ArcadeTooltip';

export interface PaletteManagerProps {
  /** Built-in palettes (read-only). */
  presets: readonly ColorPalette[];
  /** User-authored palettes. */
  customPalettes: readonly ColorPalette[];
  /** Palette currently driving the swatch matrix. */
  activePalette: ColorPalette;
  /** Current primary colour, offered as "add this colour". */
  currentColor: string;
  onSelectPalette: (paletteId: string) => void;
  /** Creates a palette. Called with a validated name and colour list. */
  onCreatePalette: (name: string, hexColors: readonly string[]) => void;
  /** Removes a custom palette. Presets are never passed to this callback. */
  onDeletePalette: (paletteId: string) => void;
  /** Appends a colour to the active custom palette. */
  onAddColor: (hex: string) => void;
  /** Removes a swatch from the active custom palette. */
  onRemoveColor: (colorId: string) => void;
  /** Replaces the active custom palette's colours wholesale (used by import). */
  onReplaceColors: (paletteId: string, hexColors: readonly string[]) => void;
  className?: string;
}

/** Which sub-panel the manager is showing. */
type ManagerTab = 'palettes' | 'transfer';

/**
 * Palette switching, custom palette authoring and hex-list import/export.
 *
 * Built-in palettes are read-only: editing one requires duplicating it into a
 * custom palette first, which keeps the shipped presets immutable seed data.
 */
export function PaletteManager({
  presets,
  customPalettes,
  activePalette,
  currentColor,
  onSelectPalette,
  onCreatePalette,
  onDeletePalette,
  onAddColor,
  onRemoveColor,
  onReplaceColors,
  className,
}: PaletteManagerProps) {
  const [tab, setTab] = useState<ManagerTab>('palettes');
  const [addDraft, setAddDraft] = useState<string>(currentColor);
  const [addError, setAddError] = useState<string | null>(null);
  const [newName, setNewName] = useState<string>('');
  const [transferDraft, setTransferDraft] = useState<string>('');
  const [transferError, setTransferError] = useState<string | null>(null);
  const [transferNotice, setTransferNotice] = useState<string | null>(null);

  const paletteOptions = useMemo(
    () => [
      ...presets.map((palette) => ({
        value: palette.id,
        label: palette.name,
        hint: `${palette.colors.length}`,
      })),
      ...customPalettes.map((palette) => ({
        value: palette.id,
        label: `★ ${palette.name}`,
        hint: `${palette.colors.length}`,
      })),
    ],
    [presets, customPalettes],
  );

  const isCustomActive = activePalette.isCustom;

  /* ---------------- add colour to the active custom palette ---------------- */

  const commitAddColor = (raw: string): void => {
    const trimmed = raw.trim();

    if (!isValidHexColor(trimmed)) {
      setAddError('Use #rgb, #rrggbb or #rrggbbaa.');
      return;
    }

    setAddError(null);
    const normalized = normalizeHexColor(trimmed);
    onAddColor(normalized);
    setAddDraft(normalized);
    retroAudioEngine.playActionSuccess();
  };

  /* ---------------- create a palette from the current one ----------------- */

  const handleDuplicateToCustom = (): void => {
    const baseName = `${activePalette.name} Copy`;
    let name = baseName;
    let suffix = 2;

    // Custom palette names are display keys; keep them unambiguous.
    const takenNames = new Set(customPalettes.map((palette) => palette.name));

    while (takenNames.has(name)) {
      name = `${baseName} ${suffix}`;
      suffix += 1;
    }

    onCreatePalette(
      name,
      activePalette.colors.map((color) => color.hex),
    );
    retroAudioEngine.playActionSuccess();
  };

  /* ---------------- transfer (export / import) ---------------------------- */

  const handleExport = (): void => {
    const serialized = serializeHexList(activePalette.colors);
    setTransferDraft(serialized);
    setTransferError(null);
    setTransferNotice(
      `Exported ${activePalette.colors.length} colours from ${activePalette.name}.`,
    );
    retroAudioEngine.playPixelBlip();
  };

  const handleCopy = (): void => {
    const serialized = transferDraft.trim().length > 0
      ? transferDraft
      : serializeHexList(activePalette.colors);

    setTransferDraft(serialized);

    if (typeof navigator !== 'undefined' && navigator.clipboard !== undefined) {
      void navigator.clipboard.writeText(serialized).then(
        () => {
          setTransferNotice('Copied the hex list to the clipboard.');
          setTransferError(null);
        },
        () => {
          setTransferError('Clipboard access was denied — select the text and copy manually.');
          setTransferNotice(null);
        },
      );
      return;
    }

    setTransferError('Clipboard access is unavailable in this browser.');
    setTransferNotice(null);
  };

  const handleDownload = (): void => {
    const serialized = transferDraft.trim().length > 0
      ? transferDraft
      : serializeHexList(activePalette.colors);

    try {
      const blob = new Blob([`${serialized}\n`], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');

      anchor.href = url;
      anchor.download = `${activePalette.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-palette.txt`;
      anchor.click();

      // Revoke on the next task so the click has been dispatched.
      window.setTimeout(() => {
        URL.revokeObjectURL(url);
      }, 0);

      setTransferNotice(`Saved ${activePalette.name} as a text file.`);
      setTransferError(null);
    } catch {
      setTransferError('The browser blocked the download. Copy the hex list instead.');
      setTransferNotice(null);
    }
  };

  const handleImport = (): void => {
    const parsed = parseHexList(transferDraft);

    if (parsed.hexes.length === 0) {
      setTransferNotice(null);
      setTransferError(
        parsed.invalid.length > 0
          ? `None of those ${parsed.invalid.length} entries are valid colours.`
          : 'Paste at least one colour before importing.',
      );
      return;
    }

    const name = newName.trim().length > 0 ? newName.trim() : 'Imported';
    onCreatePalette(name, parsed.hexes);
    setTransferError(null);
    setTransferNotice(
      `Imported ${parsed.hexes.length} colours into "${name}"` +
        (parsed.invalid.length > 0 ? ` — skipped ${parsed.invalid.length} invalid entries.` : '.'),
    );
    retroAudioEngine.playActionSuccess();
  };

  const handleReplaceActive = (): void => {
    if (!isCustomActive) {
      setTransferError('Presets are read-only. Create a custom palette first.');
      setTransferNotice(null);
      return;
    }

    const parsed = parseHexList(transferDraft);

    if (parsed.hexes.length === 0) {
      setTransferError('Paste at least one colour before replacing.');
      setTransferNotice(null);
      return;
    }

    onReplaceColors(activePalette.id, parsed.hexes);
    setTransferError(null);
    setTransferNotice(`Replaced ${activePalette.name} with ${parsed.hexes.length} colours.`);
  };

  return (
    <div className={cx('flex flex-col gap-3', className)}>
      {/* Tab strip -------------------------------------------------------- */}
      <div className="flex items-center gap-1" role="tablist" aria-label="Palette manager sections">
        <ArcadeButton
          size="sm"
          variant={tab === 'palettes' ? 'primary' : 'ghost'}
          role="tab"
          aria-selected={tab === 'palettes'}
          onClick={() => {
            setTab('palettes');
          }}
        >
          Palettes
        </ArcadeButton>

        <ArcadeButton
          size="sm"
          variant={tab === 'transfer' ? 'primary' : 'ghost'}
          role="tab"
          aria-selected={tab === 'transfer'}
          onClick={() => {
            setTab('transfer');
          }}
        >
          Import / Export
        </ArcadeButton>
      </div>

      {tab === 'palettes' ? (
        <div className="flex flex-col gap-3" role="tabpanel" aria-label="Palettes">
          <ArcadeSelect
            label="Active palette"
            value={activePalette.id}
            options={paletteOptions}
            onChange={onSelectPalette}
          />

          <div className="flex flex-wrap items-center gap-1.5">
            <ArcadeTooltip label="Duplicate this palette into an editable custom copy">
              <ArcadeButton
                size="sm"
                variant="secondary"
                leadingIcon={<Copy aria-hidden="true" className="h-3.5 w-3.5" strokeWidth={2.5} />}
                onClick={handleDuplicateToCustom}
              >
                Duplicate
              </ArcadeButton>
            </ArcadeTooltip>

            <ArcadeTooltip label={isCustomActive ? 'Delete this custom palette' : 'Presets cannot be deleted'}>
              <ArcadeButton
                size="sm"
                variant="danger"
                disabled={!isCustomActive}
                leadingIcon={<Trash aria-hidden="true" className="h-3.5 w-3.5" strokeWidth={2.5} />}
                onClick={() => {
                  onDeletePalette(activePalette.id);
                }}
              >
                Delete
              </ArcadeButton>
            </ArcadeTooltip>

            <span
              className={cx(
                'arcade-badge ml-auto px-1.5 py-1 text-pixel-xs uppercase',
                isCustomActive ? 'text-arcade-neon-green' : 'text-arcade-amber',
              )}
            >
              {isCustomActive ? 'Editable' : 'Read-only'}
            </span>
          </div>

          {!isCustomActive && (
            <p className="border-2 border-dashed border-arcade-border px-2 py-2 text-pixel-xs normal-case leading-relaxed text-arcade-muted">
              {activePalette.name} ships with the studio and is read-only. Use
              Duplicate to make an editable copy.
            </p>
          )}

          {isCustomActive && (
            <>
              <div className="flex items-end gap-1.5">
                <ArcadeInput
                  label="Add colour"
                  value={addDraft}
                  prefix="#"
                  maxLength={9}
                  error={addError}
                  ariaLabel="Colour to add to the palette"
                  onChange={(next) => {
                    setAddDraft(next.replace(/^#/, ''));
                  }}
                  onCommit={commitAddColor}
                  onEnter={() => {
                    commitAddColor(addDraft);
                  }}
                  placeholder="FF007F"
                  className="flex-1"
                />

                <ArcadeButton
                  size="icon"
                  variant="primary"
                  aria-label="Add colour to the custom palette"
                  onClick={() => {
                    commitAddColor(addDraft);
                  }}
                >
                  <Plus aria-hidden="true" className="h-4 w-4" strokeWidth={3} />
                </ArcadeButton>
              </div>

              <div className="flex flex-col gap-1.5">
                <span className="text-pixel-xs uppercase text-arcade-muted">
                  Swatches
                </span>

                {activePalette.colors.length === 0 ? (
                  <p className="border-2 border-dashed border-arcade-border px-2 py-3 text-center text-pixel-xs normal-case text-arcade-muted">
                    Empty palette. Add a colour above or import a hex list.
                  </p>
                ) : (
                  <ul className="arcade-scroll flex max-h-40 flex-wrap gap-1 overflow-y-auto pr-0.5">
                    {activePalette.colors.map((color) => (
                      <li key={color.id}>
                        <ArcadeTooltip label={`Remove ${color.hex.toUpperCase()}`}>
                          <button
                            type="button"
                            aria-label={`Remove swatch ${color.hex}`}
                            onClick={() => {
                              onRemoveColor(color.id);
                            }}
                            className="arcade-swatch flex h-7 w-7 items-center justify-center"
                          >
                            <span
                              className="arcade-swatch-fill"
                              style={{ backgroundColor: normalizeHexColor(color.hex).slice(0, 7) }}
                            />
                            <span
                              aria-hidden="true"
                              className="relative text-pixel-xs font-bold text-white mix-blend-difference"
                            >
                              ✕
                            </span>
                          </button>
                        </ArcadeTooltip>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </>
          )}

          {customPalettes.length === 0 && (
            <p className="text-pixel-xs normal-case leading-relaxed text-arcade-muted">
              No custom palettes yet — duplicate a preset to start your own set.
            </p>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-3" role="tabpanel" aria-label="Import and export">
          <ArcadeInput
            label="New palette name"
            value={newName}
            placeholder="MY PALETTE"
            maxLength={40}
            onChange={setNewName}
          />

          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="palette-transfer"
              className="text-pixel-xs uppercase text-arcade-muted"
            >
              Hex list
            </label>

            <textarea
              id="palette-transfer"
              value={transferDraft}
              spellCheck={false}
              placeholder={'#0f380f\n#306230\n#8bac0f'}
              onChange={(event) => {
                setTransferDraft(event.target.value);
                setTransferError(null);
                setTransferNotice(null);
              }}
              className="arcade-scroll pixel-border-inset h-28 w-full resize-none border-2 border-arcade-border bg-arcade-ink px-2 py-1.5 font-arcade text-pixel-xs uppercase text-arcade-text outline-none placeholder:text-arcade-disabled focus:border-arcade-cyan"
            />

            <p className="text-pixel-xs normal-case text-arcade-muted">
              Comma, space or newline separated. `#rgb`, `#rrggbb` and `#rrggbbaa`
              are all accepted.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <ArcadeTooltip label="Fill the box with the active palette's colours">
              <ArcadeButton
                size="sm"
                variant="secondary"
                leadingIcon={<Download aria-hidden="true" className="h-3.5 w-3.5" strokeWidth={2.5} />}
                onClick={handleExport}
              >
                Export
              </ArcadeButton>
            </ArcadeTooltip>

            <ArcadeTooltip label="Copy the hex list to the clipboard">
              <ArcadeButton
                size="sm"
                variant="secondary"
                leadingIcon={<Copy aria-hidden="true" className="h-3.5 w-3.5" strokeWidth={2.5} />}
                onClick={handleCopy}
              >
                Copy
              </ArcadeButton>
            </ArcadeTooltip>

            <ArcadeTooltip label="Download the hex list as a text file">
              <ArcadeButton
                size="sm"
                variant="secondary"
                onClick={handleDownload}
              >
                .TXT
              </ArcadeButton>
            </ArcadeTooltip>

            <ArcadeTooltip label="Create a new custom palette from the pasted list">
              <ArcadeButton
                size="sm"
                variant="primary"
                leadingIcon={<Upload aria-hidden="true" className="h-3.5 w-3.5" strokeWidth={2.5} />}
                onClick={handleImport}
              >
                Import
              </ArcadeButton>
            </ArcadeTooltip>

            <ArcadeTooltip
              label={
                isCustomActive
                  ? 'Replace the active custom palette with the pasted list'
                  : 'Read-only while a preset is active'
              }
            >
              <ArcadeButton
                size="sm"
                variant="danger"
                disabled={!isCustomActive}
                onClick={handleReplaceActive}
              >
                Replace
              </ArcadeButton>
            </ArcadeTooltip>
          </div>

          {transferError !== null && (
            <p role="alert" className="text-pixel-xs normal-case leading-relaxed text-arcade-red">
              {transferError}
            </p>
          )}

          {transferError === null && transferNotice !== null && (
            <p
              role="status"
              className="text-pixel-xs normal-case leading-relaxed text-arcade-neon-green"
            >
              {transferNotice}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
