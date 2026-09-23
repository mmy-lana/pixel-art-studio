import type { ChangeEvent, FocusEvent, KeyboardEvent, ReactNode, Ref } from 'react';
import { useEffect, useId, useRef, useState } from 'react';
import { cx } from '../../utils/classNames';

/** Which keyboard a touch device should raise. */
export type ArcadeInputMode = 'text' | 'numeric' | 'decimal';

export interface ArcadeInputProps {
  /** Controlled value. */
  value: string;
  /** Called with the raw input string on every keystroke. */
  onChange: (value: string) => void;
  /** Called on blur, Enter and after a valid numeric edit. */
  onCommit?: (value: string) => void;
  /** Called when Enter is pressed. */
  onEnter?: () => void;
  /** Called when Escape is pressed (dialog hosts typically close on this). */
  onEscape?: () => void;
  label?: ReactNode;
  /** Small hint rendered under the field. Hidden while `error` is present. */
  hint?: ReactNode;
  /** Validation message. Renders the field in its error state. */
  error?: string | null;
  placeholder?: string;
  /** Renders a numeric field with stepper semantics. */
  type?: 'text' | 'number';
  min?: number;
  max?: number;
  step?: number;
  maxLength?: number;
  inputMode?: ArcadeInputMode;
  /** Forces the value to uppercase as it is typed. */
  uppercase?: boolean;
  /** Selects the whole value when the field gains focus. */
  autoSelectOnFocus?: boolean;
  disabled?: boolean;
  readOnly?: boolean;
  required?: boolean;
  /** Renders before the value, inside the field frame. */
  prefix?: ReactNode;
  /** Renders after the value, inside the field frame. */
  suffix?: ReactNode;
  /** Accessible name when no visible `label` is provided. */
  ariaLabel?: string;
  className?: string;
  ref?: Ref<HTMLInputElement>;
}

/**
 * Chunky pixel-styled text / number field.
 *
 * Numeric mode keeps a local draft string so transient states like `""` or `"-"`
 * remain typeable; the clamped value is only emitted on commit (blur/Enter) so
 * downstream state never receives `NaN`.
 */
export function ArcadeInput({
  value,
  onChange,
  onCommit,
  onEnter,
  onEscape,
  label,
  hint,
  error = null,
  placeholder,
  type = 'text',
  min,
  max,
  step,
  maxLength,
  inputMode,
  uppercase = false,
  autoSelectOnFocus = false,
  disabled = false,
  readOnly = false,
  required = false,
  prefix,
  suffix,
  ariaLabel,
  className,
  ref,
}: ArcadeInputProps) {
  const generatedId = useId();
  const inputId = `${generatedId}-input`;
  const messageId = `${generatedId}-message`;
  const inputRef = useRef<HTMLInputElement | null>(null);

  /** Local mirror so number fields can hold partial input while typing. */
  const [draft, setDraft] = useState<string>(value);

  useEffect(() => {
    setDraft(value);
  }, [value]);

  const hasError = error !== null && error.trim().length > 0;
  const message = hasError ? error : hint !== undefined ? hint : null;

  const assignRef = (element: HTMLInputElement | null): void => {
    inputRef.current = element;

    if (typeof ref === 'function') {
      ref(element);
    } else if (ref !== undefined && ref !== null) {
      ref.current = element;
    }
  };

  const normalize = (raw: string): string => (uppercase ? raw.toUpperCase() : raw);

  const commitNumeric = (raw: string): void => {
    if (type !== 'number') {
      onCommit?.(raw);
      return;
    }

    const parsed = Number(raw);

    if (raw.trim().length === 0 || Number.isNaN(parsed)) {
      // Reject the edit and snap the field back to the last valid value.
      setDraft(value);
      return;
    }

    let next = parsed;

    if (typeof min === 'number' && next < min) {
      next = min;
    }

    if (typeof max === 'number' && next > max) {
      next = max;
    }

    const normalized = String(next);
    setDraft(normalized);
    onChange(normalized);
    onCommit?.(normalized);
  };

  const handleChange = (event: ChangeEvent<HTMLInputElement>): void => {
    const raw = normalize(event.target.value);
    setDraft(raw);

    if (type === 'text') {
      onChange(raw);
    }
  };

  const handleBlur = (_event: FocusEvent<HTMLInputElement>): void => {
    commitNumeric(draft);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>): void => {
    if (event.key === 'Enter') {
      event.preventDefault();
      commitNumeric(draft);
      onEnter?.();
      return;
    }

    if (event.key === 'Escape') {
      setDraft(value);
      onEscape?.();
    }
  };

  return (
    <div className={cx('flex w-full flex-col gap-1.5', className)}>
      {label !== undefined && (
        <label
          htmlFor={inputId}
          className={cx(
            'flex items-center gap-1 text-pixel-xs uppercase',
            disabled ? 'text-arcade-disabled' : 'text-arcade-muted',
          )}
        >
          {label}
          {required && (
            <span className="text-arcade-hot-pink" aria-hidden="true">
              *
            </span>
          )}
        </label>
      )}

      <div
        className={cx(
          'flex min-h-11 items-center gap-2 border-2 px-2',
          disabled
            ? 'cursor-not-allowed border-arcade-border bg-arcade-surface-sunken'
            : hasError
              ? 'pixel-border-inset border-arcade-red bg-arcade-ink'
              : 'pixel-border-inset border-arcade-border bg-arcade-ink focus-within:border-arcade-cyan',
        )}
      >
        {prefix !== undefined && (
          <span className="flex-none text-pixel-xs text-arcade-muted" aria-hidden="true">
            {prefix}
          </span>
        )}

        <input
          ref={assignRef}
          id={inputId}
          type="text"
          inputMode={inputMode ?? (type === 'number' ? 'numeric' : 'text')}
          className={cx(
            'min-w-0 flex-1 bg-transparent py-2 text-pixel-sm uppercase outline-none',
            'placeholder:text-arcade-disabled',
            disabled ? 'cursor-not-allowed text-arcade-disabled' : 'text-arcade-text',
            readOnly && 'text-arcade-muted',
          )}
          value={type === 'number' ? draft : value}
          placeholder={placeholder}
          maxLength={maxLength}
          disabled={disabled}
          readOnly={readOnly}
          required={required}
          aria-label={ariaLabel ?? (typeof label === 'string' ? label : undefined)}
          aria-invalid={hasError || undefined}
          aria-describedby={message !== null ? messageId : undefined}
          autoComplete="off"
          spellCheck={false}
          onChange={handleChange}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          onFocus={(event) => {
            if (autoSelectOnFocus) {
              event.currentTarget.select();
            }
          }}
        />

        {suffix !== undefined && (
          <span className="flex-none text-pixel-xs text-arcade-muted" aria-hidden="true">
            {suffix}
          </span>
        )}

        {type === 'number' && !disabled && !readOnly && (
          <span className="flex flex-none flex-col" aria-hidden="true">
            <button
              type="button"
              tabIndex={-1}
              aria-hidden="true"
              className="pixel-press h-4 w-5 bg-arcade-surface-raised text-pixel-xs leading-none text-arcade-muted hover:text-arcade-neon-green"
              onClick={() => {
                const base = Number.isNaN(Number(draft)) ? (min ?? 0) : Number(draft);
                const increment = step ?? 1;
                const next = Math.min(max ?? base + increment, base + increment);
                setDraft(String(next));
                onChange(String(next));
                onCommit?.(String(next));
              }}
            >
              ▲
            </button>
            <button
              type="button"
              tabIndex={-1}
              aria-hidden="true"
              className="pixel-press mt-0.5 h-4 w-5 bg-arcade-surface-raised text-pixel-xs leading-none text-arcade-muted hover:text-arcade-neon-green"
              onClick={() => {
                const base = Number.isNaN(Number(draft)) ? (min ?? 0) : Number(draft);
                const decrement = step ?? 1;
                const next = Math.max(min ?? base - decrement, base - decrement);
                setDraft(String(next));
                onChange(String(next));
                onCommit?.(String(next));
              }}
            >
              ▼
            </button>
          </span>
        )}
      </div>

      {message !== null && (
        <p
          id={messageId}
          className={cx(
            'text-pixel-xs normal-case',
            hasError ? 'text-arcade-red' : 'text-arcade-muted',
          )}
          role={hasError ? 'alert' : undefined}
        >
          {message}
        </p>
      )}
    </div>
  );
}
