import type { ColorPalette } from '../../types';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { ArrowDownUp, Pipette, RotateCcw } from 'lucide-react';
import { useEffect, useState } from 'react';
import { cx } from '../../utils/classNames';
import { isValidHexColor, normalizeHexColor } from '../../utils/color/colorConvert';
import { retroAudioEngine } from '../../utils/audio/soundSynth';
import { ArcadeButton } from '../primitives/ArcadeButton';
import { ArcadeInput } from '../primitives/ArcadeInput';
import { ArcadeTooltip } from '../primitives/ArcadeTooltip';

export interface ColorPickerPanelProps {
  /** Palette whose swatches fill the matrix. */
  palette: ColorPalette;
  /** Active primary colour (`#rrggbb` or `#rrggbbaa`). */
  primaryColor: string;
  /** Active secondary colour, applied on right-click / Shift-click. */
  secondaryColor: string;
  /** Highlights the eyedropper cap while the picker tool is armed. */
  eyedropperActive: boolean;
  onSelectPrimary: (hex: string) => void;
  onSelectSecondary: (hex: string) => void;
  onSwapColors: () => void;
  /** Restores the default black/white pair. */
  onResetColors: () => void;
  onToggleEyedropper: () => void;
  /** Hides the swatch matrix, e.g. inside the compact mobile drawer. */
  showSwatches?: boolean;
  className?: string;
}

/** Converts a value of unknown origin into a safe `#rrggbb` CSS colour. */
function toCssColor(value: string): string {
  if (!isValidHexColor(value)) {
    return '#000000';
  }

  const normalized = normalizeHexColor(value);

  // The native colour input only understands 6-digit hex.
  return normalized.length === 9 ? normalized.slice(0, 7) : normalized;
}

/**
 * Colour selection module.
 *
 * Left-click (or tap) a swatch to set the primary colour, right-click or
 * Shift-click to set the secondary. The hex field accepts any of `#rgb`,
 * `#rgba`, `#rrggbb` or `#rrggbbaa` and reports invalid input inline instead of
 * silently discarding it.
 */
export function ColorPickerPanel({
  palette,
  primaryColor,
  secondaryColor,
  eyedropperActive,
  onSelectPrimary,
  onSelectSecondary,
  onSwapColors,
  onResetColors,
  onToggleEyedropper,
  showSwatches = true,
  className,
}: ColorPickerPanelProps) {
  const [hexDraft, setHexDraft] = useState<string>(primaryColor);
  const [hexError, setHexError] = useState<string | null>(null);

  // Keep the editor in sync when the colour changes elsewhere (eyedropper,
  // swatch click, undo, project load).
  useEffect(() => {
    setHexDraft(primaryColor);
    setHexError(null);
  }, [primaryColor]);

  const commitHex = (raw: string): void => {
    const trimmed = raw.trim();

    if (trimmed.length === 0) {
      setHexError('Enter a colour value.');
      setHexDraft(primaryColor);
      return;
    }

    if (!isValidHexColor(trimmed)) {
      setHexError('Use #rgb, #rrggbb or #rrggbbaa.');
      return;
    }

    setHexError(null);
    const normalized = normalizeHexColor(trimmed);
    setHexDraft(normalized);
    onSelectPrimary(normalized);
  };

  const handleSwatchPointerDown = (
    hex: string,
    event: ReactPointerEvent<HTMLButtonElement>,
  ): void => {
    if (event.shiftKey) {
      retroAudioEngine.playToolSelect();
      onSelectSecondary(hex);
      return;
    }

    retroAudioEngine.playPixelBlip();
    onSelectPrimary(hex);
  };

  const primaryCss = toCssColor(primaryColor);
  const secondaryCss = toCssColor(secondaryColor);

  return (
    <div className={cx('flex flex-col gap-3', className)}>
      {/* Active colour pair ------------------------------------------------ */}
      <div className="flex items-center gap-3">
        <div className="relative h-14 w-16 flex-none">
          <div
            title={`Secondary ${secondaryColor}`}
            className="arcade-swatch absolute bottom-0 right-0 h-8 w-8"
          >
            <span
              className="arcade-swatch-fill"
              style={{ backgroundColor: secondaryCss }}
            />
          </div>

          <div
            title={`Primary ${primaryColor}`}
            className="arcade-swatch arcade-swatch-selected absolute left-0 top-0 h-9 w-9"
          >
            <span
              className="arcade-swatch-fill"
              style={{ backgroundColor: primaryCss }}
            />
          </div>
        </div>

        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="truncate text-pixel-xs uppercase text-arcade-muted">
            Primary
          </span>
          <span className="truncate text-pixel-sm uppercase text-arcade-neon-green">
            {normalizeHexColor(primaryColor).toUpperCase()}
          </span>
          <span className="truncate text-pixel-xs uppercase text-arcade-muted">
            Secondary {normalizeHexColor(secondaryColor).toUpperCase()}
          </span>
        </div>
      </div>

      {/* Colour utilities ------------------------------------------------- */}
      <div className="flex items-center gap-1.5">
        <ArcadeTooltip label="Swap primary and secondary (X)">
          <ArcadeButton
            size="icon"
            variant="secondary"
            aria-label="Swap primary and secondary colours"
            onClick={onSwapColors}
          >
            <ArrowDownUp aria-hidden="true" className="h-4 w-4" strokeWidth={2.5} />
          </ArcadeButton>
        </ArcadeTooltip>

        <ArcadeTooltip label="Reset to black and white (D)">
          <ArcadeButton
            size="icon"
            variant="secondary"
            aria-label="Reset colours to black and white"
            onClick={onResetColors}
          >
            <RotateCcw aria-hidden="true" className="h-4 w-4" strokeWidth={2.5} />
          </ArcadeButton>
        </ArcadeTooltip>

        <ArcadeTooltip label="Eyedropper — sample a pixel from the canvas (I)">
          <ArcadeButton
            size="icon"
            variant={eyedropperActive ? 'primary' : 'secondary'}
            active={eyedropperActive}
            aria-pressed={eyedropperActive}
            aria-label="Toggle eyedropper tool"
            onClick={onToggleEyedropper}
          >
            <Pipette aria-hidden="true" className="h-4 w-4" strokeWidth={2.5} />
          </ArcadeButton>
        </ArcadeTooltip>

        <label
          title="System colour picker"
          className="pixel-border-outset relative ml-auto flex h-11 w-11 flex-none cursor-pointer items-center justify-center border-2 border-arcade-border-light bg-arcade-surface-raised"
        >
          <span className="pointer-events-none absolute inset-1" style={{ backgroundColor: primaryCss }} />
          <input
            type="color"
            value={primaryCss}
            aria-label="Pick a primary colour with the system picker"
            className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
            onChange={(event) => {
              onSelectPrimary(normalizeHexColor(event.target.value));
            }}
          />
        </label>
      </div>

      {/* Hex editor ------------------------------------------------------- */}
      <ArcadeInput
        label="Hex"
        value={hexDraft}
        error={hexError}
        prefix="#"
        maxLength={9}
        ariaLabel="Primary colour hex value"
        onChange={(next) => {
          setHexDraft(next.replace(/^#/, ''));
        }}
        onCommit={(next) => {
          commitHex(next);
        }}
        onEscape={() => {
          setHexDraft(primaryColor);
          setHexError(null);
        }}
        placeholder="00FF66"
      />

      {/* Swatch matrix ---------------------------------------------------- */}
      {showSwatches && (
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between gap-2">
            <span className="truncate text-pixel-xs uppercase text-arcade-muted">
              {palette.name}
            </span>
            <span className="arcade-badge flex-none px-1.5 py-0.5 text-pixel-xs">
              {palette.colors.length}
            </span>
          </div>

          {palette.colors.length === 0 ? (
            <p className="border-2 border-dashed border-arcade-border px-2 py-4 text-center text-pixel-xs normal-case text-arcade-muted">
              This palette has no colours yet. Add one from the palette manager.
            </p>
          ) : (
            <div
              role="group"
              aria-label={`${palette.name} swatches`}
              className="arcade-scroll grid max-h-56 grid-cols-[repeat(auto-fill,minmax(28px,1fr))] gap-1 overflow-y-auto pr-0.5"
            >
              {palette.colors.map((color) => {
                const isPrimary =
                  normalizeHexColor(color.hex) === normalizeHexColor(primaryColor);
                const isSecondary =
                  normalizeHexColor(color.hex) === normalizeHexColor(secondaryColor);
                const cssColor = toCssColor(color.hex);
                const hasAlpha = normalizeHexColor(color.hex).length === 9;

                return (
                  <ArcadeTooltip
                    key={color.id}
                    label={`${color.name} · ${color.hex.toUpperCase()}${hasAlpha ? ' · shift-click for secondary' : ''}`}
                    placement="top"
                  >
                    <button
                      type="button"
                      aria-label={`${color.name} ${color.hex}`}
                      aria-pressed={isPrimary}
                      onPointerDown={(event) => {
                        handleSwatchPointerDown(color.hex, event);
                      }}
                      onContextMenu={(event) => {
                        event.preventDefault();
                        retroAudioEngine.playToolSelect();
                        onSelectSecondary(color.hex);
                      }}
                      className={cx(
                        'arcade-swatch aspect-square w-full',
                        isPrimary && 'arcade-swatch-selected',
                        isSecondary && !isPrimary && 'pixel-keyline',
                      )}
                    >
                      <span
                        className="arcade-swatch-fill"
                        style={{
                          backgroundColor: cssColor,
                          // Translucent swatches reveal the checkerboard beneath.
                          opacity: hasAlpha ? 0.72 : 1,
                        }}
                      />
                    </button>
                  </ArcadeTooltip>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
