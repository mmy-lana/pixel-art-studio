import { useEffect, useState } from 'react';
import type { NewProjectOptions } from '../../store/editorStore';
import { cx } from '../../utils/classNames';
import { isValidHexColor, normalizeHexColor } from '../../utils/color/colorConvert';
import { ArcadeButton } from '../primitives/ArcadeButton';
import { ArcadeInput } from '../primitives/ArcadeInput';
import { ArcadeModal } from '../primitives/ArcadeModal';

/** Canvas presets offered as one-tap chips. */
export const CANVAS_SIZE_PRESETS: readonly number[] = [8, 16, 24, 32, 64];

/** Hard limits for custom sizes. */
export const MIN_CANVAS_SIZE = 4;
export const MAX_CANVAS_SIZE = 128;

/** Background choice for the base layer. */
type BackgroundChoice = 'transparent' | 'black' | 'white' | 'custom';

export interface NewProjectDialogProps {
  open: boolean;
  onClose: () => void;
  /** Called with validated options when the user confirms. */
  onCreate: (options: NewProjectOptions) => void;
  /** Initial title, usually the current project's name. */
  defaultTitle?: string;
}

/**
 * New project dialog.
 *
 * Offers the plan's canvas presets (8/16/24/32/64) plus a custom size up to
 * 128x128, a title and a base-layer background choice. Validation is inline: the
 * confirm cap stays disabled until both dimensions are legal integers in range.
 */
export function NewProjectDialog({
  open,
  onClose,
  onCreate,
  defaultTitle = 'UNTITLED SPRITE',
}: NewProjectDialogProps) {
  const [title, setTitle] = useState(defaultTitle);
  const [widthDraft, setWidthDraft] = useState('32');
  const [heightDraft, setHeightDraft] = useState('32');
  const [background, setBackground] = useState<BackgroundChoice>('transparent');
  const [customColor, setCustomColor] = useState('#1f2231');

  // Reset the form each time the dialog is opened.
  useEffect(() => {
    if (open) {
      setTitle(defaultTitle);
      setWidthDraft('32');
      setHeightDraft('32');
      setBackground('transparent');
      setCustomColor('#1f2231');
    }
  }, [open, defaultTitle]);

  const width = Number(widthDraft);
  const height = Number(heightDraft);

  const widthError =
    !Number.isInteger(width) || width < MIN_CANVAS_SIZE || width > MAX_CANVAS_SIZE
      ? `Enter a whole number between ${MIN_CANVAS_SIZE} and ${MAX_CANVAS_SIZE}.`
      : null;

  const heightError =
    !Number.isInteger(height) || height < MIN_CANVAS_SIZE || height > MAX_CANVAS_SIZE
      ? `Enter a whole number between ${MIN_CANVAS_SIZE} and ${MAX_CANVAS_SIZE}.`
      : null;

  const titleError = title.trim().length === 0 ? 'Give the sprite a name.' : null;

  const backgroundHex =
    background === 'transparent'
      ? null
      : background === 'black'
        ? '#000000'
        : background === 'white'
          ? '#ffffff'
          : isValidHexColor(customColor)
            ? normalizeHexColor(customColor)
            : null;

  const backgroundError =
    background === 'custom' && !isValidHexColor(customColor)
      ? 'Use #rgb, #rrggbb or #rrggbbaa.'
      : null;

  const canConfirm =
    widthError === null && heightError === null && titleError === null && backgroundError === null;

  const applyPreset = (size: number): void => {
    setWidthDraft(String(size));
    setHeightDraft(String(size));
  };

  const handleConfirm = (): void => {
    if (!canConfirm) {
      return;
    }

    onCreate({
      title: title.trim(),
      width,
      height,
      backgroundHex,
      fps: 8,
    });
  };

  const BACKGROUND_OPTIONS: readonly { value: BackgroundChoice; label: string }[] = [
    { value: 'transparent', label: 'Clear' },
    { value: 'black', label: 'Black' },
    { value: 'white', label: 'White' },
    { value: 'custom', label: 'Custom' },
  ];

  return (
    <ArcadeModal
      open={open}
      onClose={onClose}
      title="New Project"
      description="Pick a canvas size and base background."
      size="md"
      footer={
        <>
          <ArcadeButton size="md" variant="ghost" onClick={onClose}>
            Cancel
          </ArcadeButton>
          <ArcadeButton
            size="md"
            variant="primary"
            disabled={!canConfirm}
            data-modal-autofocus="true"
            onClick={handleConfirm}
          >
            Create
          </ArcadeButton>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <ArcadeInput
          label="Sprite name"
          value={title}
          error={titleError}
          maxLength={48}
          autoSelectOnFocus
          onChange={setTitle}
          onCommit={setTitle}
          placeholder="UNTITLED SPRITE"
        />

        <div className="flex flex-col gap-2">
          <span className="text-pixel-xs uppercase text-arcade-muted">Presets</span>
          <div className="flex flex-wrap gap-1.5">
            {CANVAS_SIZE_PRESETS.map((size) => {
              const isActive = width === size && height === size;

              return (
                <ArcadeButton
                  key={size}
                  size="sm"
                  variant={isActive ? 'primary' : 'secondary'}
                  active={isActive}
                  aria-pressed={isActive}
                  onClick={() => {
                    applyPreset(size);
                  }}
                >
                  {size}×{size}
                </ArcadeButton>
              );
            })}
          </div>
        </div>

        <div className="flex items-end gap-3">
          <ArcadeInput
            label="Width"
            type="number"
            min={MIN_CANVAS_SIZE}
            max={MAX_CANVAS_SIZE}
            step={1}
            value={widthDraft}
            error={widthError}
            suffix="PX"
            onChange={setWidthDraft}
            onCommit={setWidthDraft}
          />

          <ArcadeInput
            label="Height"
            type="number"
            min={MIN_CANVAS_SIZE}
            max={MAX_CANVAS_SIZE}
            step={1}
            value={heightDraft}
            error={heightError}
            suffix="PX"
            onChange={setHeightDraft}
            onCommit={setHeightDraft}
          />
        </div>

        <div className="flex flex-col gap-2">
          <span className="text-pixel-xs uppercase text-arcade-muted">Background</span>

          <div role="radiogroup" aria-label="Background" className="flex flex-wrap gap-1.5">
            {BACKGROUND_OPTIONS.map((option) => {
              const isActive = background === option.value;

              return (
                <ArcadeButton
                  key={option.value}
                  size="sm"
                  variant={isActive ? 'primary' : 'secondary'}
                  active={isActive}
                  role="radio"
                  aria-checked={isActive}
                  aria-label={`${option.label} background`}
                  onClick={() => {
                    setBackground(option.value);
                  }}
                >
                  {option.label}
                </ArcadeButton>
              );
            })}
          </div>

          {background === 'custom' && (
            <div className="flex items-end gap-3">
              <ArcadeInput
                label="Custom colour"
                value={customColor}
                prefix="#"
                maxLength={9}
                error={backgroundError}
                ariaLabel="Custom background colour"
                onChange={(next) => {
                  setCustomColor(next.replace(/^#/, ''));
                }}
                onCommit={(next) => {
                  setCustomColor(next);
                }}
                className="flex-1"
              />

              <label
                title="System colour picker"
                className="pixel-border-outset relative flex h-11 w-11 flex-none cursor-pointer items-center justify-center border-2 border-arcade-border-light bg-arcade-surface-raised"
              >
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-1"
                  style={{ backgroundColor: isValidHexColor(customColor) ? normalizeHexColor(customColor).slice(0, 7) : '#000000' }}
                />
                <input
                  type="color"
                  aria-label="Pick a custom background colour"
                  value={isValidHexColor(customColor) ? normalizeHexColor(customColor).slice(0, 7) : '#000000'}
                  className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                  onChange={(event) => {
                    setCustomColor(normalizeHexColor(event.target.value).replace('#', ''));
                  }}
                />
              </label>
            </div>
          )}

          <p className="text-pixel-xs normal-case leading-relaxed text-arcade-muted">
            {backgroundHex === null
              ? 'The base layer starts fully transparent, so the checkerboard shows through.'
              : `Every pixel of the base layer is filled with ${backgroundHex.toUpperCase()}.`}
          </p>
        </div>

        <div
          className={cx(
            'flex items-center justify-between gap-3 border-2 border-arcade-border bg-arcade-surface-sunken px-2 py-2',
          )}
        >
          <span className="text-pixel-xs uppercase text-arcade-muted">Result</span>
          <span className="text-pixel-xs uppercase text-arcade-neon-green">
            {Number.isInteger(width) && Number.isInteger(height) ? `${width} × ${height}` : '—'} ·{' '}
            {Number.isInteger(width) && Number.isInteger(height)
              ? `${width * height} px`
              : 'invalid size'}
          </span>
        </div>
      </div>
    </ArcadeModal>
  );
}
