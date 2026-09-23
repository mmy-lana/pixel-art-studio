import type { ChangeEvent, CSSProperties, ReactNode, Ref } from 'react';
import { useId } from 'react';
import { cx } from '../../utils/classNames';

export interface ArcadeSliderProps {
  /** Current value. Must sit on the `min`..`max` grid, in `step` increments. */
  value: number;
  /** Called on every step change with the snapped value. */
  onChange: (value: number) => void;
  min: number;
  max: number;
  /** Increment between selectable values. Defaults to `1`. */
  step?: number;
  /** Visible label rendered above the track. */
  label?: ReactNode;
  /** Unit appended to the displayed value, e.g. `"%"` or `"PX"`. */
  valueSuffix?: string;
  /** Custom value formatter. Overrides `valueSuffix` when provided. */
  formatValue?: (value: number) => string;
  /** Hides the numeric readout. */
  showValue?: boolean;
  /** Renders tick marks under the track (best for 3-16 steps). */
  showTicks?: boolean;
  disabled?: boolean;
  /** Accessible name when no visible `label` is provided. */
  ariaLabel?: string;
  className?: string;
  ref?: Ref<HTMLInputElement>;
}

/**
 * Stepped arcade range slider with a chunky pixel thumb.
 *
 * Built on a native `<input type="range">` so keyboard stepping, touch dragging
 * and assistive-technology support come from the platform; only the visuals are
 * replaced (see `.arcade-range` in theme.css).
 */
export function ArcadeSlider({
  value,
  onChange,
  min,
  max,
  step = 1,
  label,
  valueSuffix,
  formatValue,
  showValue = true,
  showTicks = false,
  disabled = false,
  ariaLabel,
  className,
  ref,
}: ArcadeSliderProps) {
  const generatedId = useId();
  const inputId = `${generatedId}-slider`;

  const span = max - min;
  const stepCount = span > 0 && step > 0 ? Math.floor(span / step) : 0;
  const tickSize = stepCount > 0 ? `${(1 / (stepCount + 1)) * 100}%` : '100%';

  const displayValue =
    formatValue !== undefined
      ? formatValue(value)
      : `${value}${valueSuffix !== undefined ? valueSuffix : ''}`;

  const handleChange = (event: ChangeEvent<HTMLInputElement>): void => {
    const next = Number(event.target.value);

    if (Number.isNaN(next)) {
      return;
    }

    // Re-snap defensively: browsers already snap, but a programmatic value can
    // arrive off-grid from persisted state.
    const snapped = min + Math.round((next - min) / step) * step;
    onChange(Math.min(max, Math.max(min, snapped)));
  };

  return (
    <div className={cx('flex w-full flex-col gap-1.5', className)}>
      {(label !== undefined || showValue) && (
        <div className="flex items-center justify-between gap-2">
          {label !== undefined && (
            <label
              htmlFor={inputId}
              className={cx(
                'truncate text-pixel-xs uppercase',
                disabled ? 'text-arcade-disabled' : 'text-arcade-muted',
              )}
            >
              {label}
            </label>
          )}

          {showValue && (
            <span
              className={cx(
                'arcade-badge flex-none px-1.5 py-0.5 text-pixel-xs tabular-nums',
                disabled ? 'text-arcade-disabled' : 'text-arcade-neon-green',
              )}
              aria-hidden="true"
            >
              {displayValue}
            </span>
          )}
        </div>
      )}

      <input
        ref={ref}
        id={inputId}
        type="range"
        className="arcade-range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        aria-label={ariaLabel ?? (typeof label === 'string' ? label : undefined)}
        aria-valuetext={displayValue}
        onChange={handleChange}
      />

      {showTicks && stepCount > 0 && stepCount <= 15 && (
        <div
          aria-hidden="true"
          className="arcade-range-ticks h-1 w-full opacity-70"
          style={{ '--tick-size': tickSize } as CSSProperties}
        />
      )}
    </div>
  );
}
