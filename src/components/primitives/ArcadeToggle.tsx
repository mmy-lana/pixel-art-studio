import type { ComponentPropsWithoutRef, ReactNode, Ref } from 'react';
import { useId } from 'react';
import { retroAudioEngine } from '../../utils/audio/soundSynth';
import { cx } from '../../utils/classNames';

/** LED colour shown when the switch is on. */
export type ArcadeToggleLedColor = 'green' | 'cyan' | 'pink' | 'amber' | 'red';

/** Physical size of the rocker. */
export type ArcadeToggleSize = 'sm' | 'md';

/**
 * Native button props are forwarded to the rocker so composed components such as
 * `ArcadeTooltip` can attach focus/pointer handlers and `aria-describedby`.
 */
export interface ArcadeToggleProps
  extends Omit<
    ComponentPropsWithoutRef<'button'>,
    'children' | 'className' | 'type' | 'onChange' | 'disabled' | 'role'
  > {
  /** Current switch position. */
  checked: boolean;
  /** Called with the next position. Not called while `disabled`. */
  onChange: (checked: boolean) => void;
  /** Visible label rendered next to the rocker. */
  label?: ReactNode;
  /** Secondary line rendered under the label. */
  description?: ReactNode;
  /** Blocks interaction and dims the rocker. */
  disabled?: boolean;
  /** Optional id applied to the button, for external `<label htmlFor>` wiring. */
  id?: string;
  size?: ArcadeToggleSize;
  ledColor?: ArcadeToggleLedColor;
  /** Extra classes for the outer row. */
  className?: string;
  ref?: Ref<HTMLButtonElement>;
}

/** Lit LED classes, applied only while the switch is on and enabled. */
const LED_ON_CLASSES: Record<ArcadeToggleLedColor, string> = {
  green: 'led-green led-pulse',
  cyan: 'led-cyan led-pulse',
  pink: 'led-pink led-pulse',
  amber: 'led-amber led-pulse',
  red: 'led-red led-pulse',
};

/** Track (rocker well) dimensions per size. */
const TRACK_CLASSES: Record<ArcadeToggleSize, string> = {
  sm: 'h-5 w-10',
  md: 'h-6 w-12',
};

/** Knob dimensions per size. */
const KNOB_CLASSES: Record<ArcadeToggleSize, string> = {
  sm: 'h-4 w-4',
  md: 'h-5 w-5',
};

/**
 * Knob travel per size, derived from the track geometry:
 * `innerWidth - knobWidth - horizontalMargins` where inner width is the track
 * minus its 2px borders — 36 - 16 - 4 = 16px (sm) and 44 - 20 - 4 = 20px (md).
 */
const KNOB_TRAVEL_CLASSES: Record<ArcadeToggleSize, string> = {
  sm: 'translate-x-4',
  md: 'translate-x-5',
};

/**
 * 8-bit rocker switch with an LED indicator.
 *
 * Exposes `role="switch"` + `aria-checked` so assistive technology announces a
 * toggle rather than a button, and keeps a 44px-tall hit area at every size.
 *
 * LAYOUT NOTE: the rocker always lays out as `inline-flex`, so hide it with a
 * wrapper (`<span className="hidden phone:inline-flex">`) rather than a `hidden`
 * class on the component itself.
 */
export function ArcadeToggle({
  checked,
  onChange,
  label,
  description,
  disabled = false,
  id,
  size = 'md',
  ledColor = 'green',
  className,
  ref,
  ...nativeProps
}: ArcadeToggleProps) {
  const generatedId = useId();
  const descriptionId = `${generatedId}-description`;
  const labelId = `${generatedId}-label`;

  const hasNativeAriaLabel = nativeProps['aria-label'] !== undefined;

  const handleToggle = (): void => {
    if (disabled) {
      return;
    }

    retroAudioEngine.playToolSelect();
    onChange(!checked);
  };

  const isLit = checked && !disabled;

  return (
    <div className={cx('flex min-h-11 items-center gap-3', className)}>
      <button
        {...nativeProps}
        ref={ref}
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        aria-labelledby={!hasNativeAriaLabel && label !== undefined ? labelId : undefined}
        aria-describedby={
          description !== undefined ? descriptionId : nativeProps['aria-describedby']
        }
        disabled={disabled}
        onClick={handleToggle}
        className={cx(
          'pixel-press inline-flex min-h-11 flex-none items-center gap-2 border-2 px-1.5',
          disabled
            ? 'cursor-not-allowed border-arcade-border bg-arcade-surface-sunken'
            : 'pixel-border-outset border-arcade-border bg-arcade-surface',
        )}
      >
        <span
          aria-hidden="true"
          className={cx('led', isLit && LED_ON_CLASSES[ledColor])}
        />

        <span
          aria-hidden="true"
          className={cx(
            'relative flex items-center border-2 border-black',
            TRACK_CLASSES[size],
            isLit ? 'bg-arcade-neon-green/25' : 'bg-arcade-surface-sunken',
          )}
        >
          <span
            className={cx(
              'm-0.5 border-2 border-black transition-transform duration-75',
              KNOB_CLASSES[size],
              checked ? KNOB_TRAVEL_CLASSES[size] : 'translate-x-0',
              disabled
                ? 'bg-arcade-disabled'
                : checked
                  ? 'bg-arcade-neon-green'
                  : 'bg-arcade-border-light',
            )}
          />
        </span>

        <span
          aria-hidden="true"
          className={cx(
            'w-8 text-left text-pixel-xs uppercase leading-none',
            disabled
              ? 'text-arcade-disabled'
              : checked
                ? 'text-arcade-neon-green'
                : 'text-arcade-muted',
          )}
        >
          {checked ? 'ON' : 'OFF'}
        </span>
      </button>

      {(label !== undefined || description !== undefined) && (
        <span className="min-w-0 flex-1">
          {label !== undefined && (
            <span
              id={labelId}
              className={cx(
                'block truncate text-pixel-xs uppercase',
                disabled ? 'text-arcade-disabled' : 'text-arcade-text',
              )}
            >
              {label}
            </span>
          )}

          {description !== undefined && (
            <span
              id={descriptionId}
              className="mt-0.5 block truncate text-pixel-xs normal-case text-arcade-muted"
            >
              {description}
            </span>
          )}
        </span>
      )}
    </div>
  );
}
