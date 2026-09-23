import type { KeyboardEvent, ReactNode, Ref } from 'react';
import { useEffect, useId, useRef, useState } from 'react';
import { retroAudioEngine } from '../../utils/audio/soundSynth';
import { cx } from '../../utils/classNames';

/** One selectable row in the menu. */
export interface ArcadeSelectOption<TValue extends string> {
  value: TValue;
  label: string;
  /** Optional right-aligned annotation, e.g. a swatch count. */
  hint?: string;
  disabled?: boolean;
}

export interface ArcadeSelectProps<TValue extends string> {
  /** Currently selected value, or `null` to show the placeholder. */
  value: TValue | null;
  options: readonly ArcadeSelectOption<TValue>[];
  onChange: (value: TValue) => void;
  label?: ReactNode;
  /** Rendered on the trigger while `value` is `null`. */
  placeholder?: string;
  disabled?: boolean;
  /** Menu width behaviour: match the trigger or fit the content. */
  menuWidth?: 'trigger' | 'content';
  /** Accessible name when no visible `label` is provided. */
  ariaLabel?: string;
  className?: string;
  ref?: Ref<HTMLButtonElement>;
}

/**
 * Dropdown styled as an arcade service-menu selector.
 *
 * Implements the ARIA listbox pattern by hand (rather than relying on a native
 * `<select>`) because the cabinet styling cannot be expressed on native option
 * popups. Supports pointer selection, Arrow/Home/End navigation, Escape to
 * cancel, Enter/Space to commit and click-outside dismissal.
 */
export function ArcadeSelect<TValue extends string>({
  value,
  options,
  onChange,
  label,
  placeholder = '-- SELECT --',
  disabled = false,
  menuWidth = 'trigger',
  ariaLabel,
  className,
  ref,
}: ArcadeSelectProps<TValue>) {
  const generatedId = useId();
  const listboxId = `${generatedId}-listbox`;
  const labelId = `${generatedId}-label`;

  const containerRef = useRef<HTMLDivElement | null>(null);
  const listRef = useRef<HTMLUListElement | null>(null);

  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState<number>(-1);

  const selectedIndex = options.findIndex((option) => option.value === value);
  const selectedOption = selectedIndex >= 0 ? options[selectedIndex] : null;

  /** First enabled index, used to seed keyboard focus when opening. */
  const firstEnabledIndex = options.findIndex((option) => !option.disabled);

  useEffect(() => {
    if (!open) {
      return;
    }

    const handlePointerDown = (event: PointerEvent): void => {
      if (
        containerRef.current !== null &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setOpen(false);
      }
    };

    document.addEventListener('pointerdown', handlePointerDown, true);

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open || activeIndex < 0) {
      return;
    }

    const list = listRef.current;
    const active = list?.children.item(activeIndex);

    if (active instanceof HTMLElement) {
      active.scrollIntoView({ block: 'nearest' });
    }
  }, [open, activeIndex]);

  const openMenu = (): void => {
    if (disabled) {
      return;
    }

    retroAudioEngine.playToolSelect();
    setActiveIndex(selectedIndex >= 0 ? selectedIndex : firstEnabledIndex);
    setOpen(true);
  };

  const closeMenu = (): void => {
    setOpen(false);
  };

  const commit = (option: ArcadeSelectOption<TValue>): void => {
    if (option.disabled) {
      return;
    }

    retroAudioEngine.playPixelBlip();
    onChange(option.value);
    closeMenu();
  };

  /** Advances `activeIndex` by `direction`, skipping disabled rows. */
  const moveActive = (direction: 1 | -1): void => {
    if (options.length === 0) {
      return;
    }

    let index = activeIndex;

    for (let attempts = 0; attempts < options.length; attempts += 1) {
      index = (index + direction + options.length) % options.length;

      if (!options[index].disabled) {
        setActiveIndex(index);
        return;
      }
    }
  };

  const handleTriggerKeyDown = (event: KeyboardEvent<HTMLButtonElement>): void => {
    switch (event.key) {
      case 'ArrowDown':
      case 'ArrowUp':
      case 'Enter':
      case ' ':
        event.preventDefault();
        if (open) {
          closeMenu();
        } else {
          openMenu();
        }
        break;
      case 'Escape':
        if (open) {
          event.preventDefault();
          closeMenu();
        }
        break;
      default:
        break;
    }
  };

  const handleListKeyDown = (event: KeyboardEvent<HTMLUListElement>): void => {
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        moveActive(1);
        break;
      case 'ArrowUp':
        event.preventDefault();
        moveActive(-1);
        break;
      case 'Home':
        event.preventDefault();
        setActiveIndex(firstEnabledIndex);
        break;
      case 'End': {
        event.preventDefault();

        for (let index = options.length - 1; index >= 0; index -= 1) {
          if (!options[index].disabled) {
            setActiveIndex(index);
            break;
          }
        }
        break;
      }
      case 'Enter':
      case ' ': {
        event.preventDefault();
        const option = options[activeIndex];

        if (option) {
          commit(option);
        }
        break;
      }
      case 'Escape':
      case 'Tab':
        event.preventDefault();
        closeMenu();
        break;
      default:
        break;
    }
  };

  const isPlaceholder = selectedOption === null;

  return (
    <div ref={containerRef} className={cx('relative flex flex-col gap-1.5', className)}>
      {label !== undefined && (
        <span
          id={labelId}
          className={cx(
            'text-pixel-xs uppercase',
            disabled ? 'text-arcade-disabled' : 'text-arcade-muted',
          )}
        >
          {label}
        </span>
      )}

      <button
        ref={ref}
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listboxId : undefined}
        aria-labelledby={label !== undefined ? labelId : undefined}
        aria-label={ariaLabel ?? (typeof label === 'string' ? label : undefined)}
        onClick={() => {
          if (open) {
            closeMenu();
          } else {
            openMenu();
          }
        }}
        onKeyDown={handleTriggerKeyDown}
        className={cx(
          'pixel-press flex min-h-11 w-full items-center justify-between gap-2 border-2 px-2 text-left',
          disabled
            ? 'cursor-not-allowed border-arcade-border bg-arcade-surface-sunken text-arcade-disabled'
            : open
              ? 'pixel-border-inset border-arcade-cyan bg-arcade-ink text-arcade-cyan'
              : 'pixel-border-outset border-arcade-border bg-arcade-surface-raised text-arcade-text',
        )}
      >
        <span
          className={cx(
            'truncate text-pixel-xs uppercase',
            isPlaceholder && !disabled && 'text-arcade-muted',
          )}
        >
          {selectedOption !== null ? selectedOption.label : placeholder}
        </span>

        <span
          aria-hidden="true"
          className={cx('arcade-caret flex-none', open && 'rotate-180')}
        />
      </button>

      {open && (
        <ul
          ref={listRef}
          id={listboxId}
          role="listbox"
          tabIndex={-1}
          aria-labelledby={label !== undefined ? labelId : undefined}
          aria-activedescendant={
            activeIndex >= 0 ? `${listboxId}-option-${activeIndex}` : undefined
          }
          onKeyDown={handleListKeyDown}
          className={cx(
            'arcade-menu arcade-scroll arcade-pop absolute top-full z-30 mt-1 max-h-64 overflow-y-auto border-2 border-arcade-border-light bg-arcade-surface py-1',
            menuWidth === 'trigger' ? 'w-full' : 'min-w-full w-max',
          )}
        >
          {options.length === 0 && (
            <li className="px-2 py-2 text-pixel-xs uppercase text-arcade-muted" role="presentation">
              No options available
            </li>
          )}

          {options.map((option, index) => {
            const isSelected = option.value === value;
            const isActive = index === activeIndex;

            return (
              <li
                key={option.value}
                id={`${listboxId}-option-${index}`}
                role="option"
                aria-selected={isSelected}
                aria-disabled={option.disabled || undefined}
                onPointerEnter={() => {
                  if (!option.disabled) {
                    setActiveIndex(index);
                  }
                }}
                onClick={() => {
                  commit(option);
                }}
                className={cx(
                  'flex cursor-pointer items-center justify-between gap-3 px-2 py-2 text-pixel-xs uppercase',
                  option.disabled
                    ? 'cursor-not-allowed text-arcade-disabled'
                    : isActive
                      ? 'bg-arcade-neon-green text-arcade-black'
                      : isSelected
                        ? 'text-arcade-neon-green'
                        : 'text-arcade-text',
                )}
              >
                <span className="flex min-w-0 items-center gap-2">
                  <span
                    aria-hidden="true"
                    className={cx('w-2 flex-none', isSelected && 'text-current')}
                  >
                    {isSelected ? '▶' : ''}
                  </span>
                  <span className="truncate">{option.label}</span>
                </span>

                {option.hint !== undefined && (
                  <span
                    className={cx(
                      'flex-none text-pixel-xs',
                      isActive && !option.disabled ? 'text-arcade-black/70' : 'text-arcade-muted',
                    )}
                  >
                    {option.hint}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
