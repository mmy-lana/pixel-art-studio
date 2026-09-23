import type {
  ComponentPropsWithoutRef,
  MouseEvent as ReactMouseEvent,
  ReactNode,
  Ref,
} from 'react';
import { retroAudioEngine } from '../../utils/audio/soundSynth';
import { cx } from '../../utils/classNames';

/** Visual weight of the button. */
export type ArcadeButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost';

/**
 * Physical button cap size.
 *
 * Sizes are deliberately large: `md`, `lg`, `icon` and `icon-lg` all meet the
 * 44x44px minimum touch target required by the responsive matrix (plan §4.1), and
 * the shell only uses those on touch layouts. `sm` / `icon-sm` exist for dense
 * desktop side panels (layer rows, palette controls) where 44px per control
 * would break the layout; the mobile drawer re-renders those at `md` / `icon`.
 */
export type ArcadeButtonSize = 'sm' | 'md' | 'lg' | 'icon' | 'icon-sm' | 'icon-lg';

/** Which synthesised effect plays when the button is pressed. */
export type ArcadeButtonSound = 'blip' | 'select' | 'none';

/**
 * Native button props are forwarded verbatim (minus the ones this component
 * owns) so composed components such as `ArcadeTooltip` can attach `onFocus`,
 * `onPointerEnter`, `aria-describedby`, `data-*`, etc. to the real DOM node.
 */
export interface ArcadeButtonProps
  extends Omit<
    ComponentPropsWithoutRef<'button'>,
    'children' | 'className' | 'type' | 'onClick' | 'disabled'
  > {
  /** Button content. */
  children?: ReactNode;
  /** Press handler. Not called while `disabled` or `loading`. */
  onClick?: (event: ReactMouseEvent<HTMLButtonElement>) => void;
  variant?: ArcadeButtonVariant;
  size?: ArcadeButtonSize;
  /** Blocks interaction and applies the sunken disabled cap. */
  disabled?: boolean;
  /** Shows a pixel spinner and blocks interaction without changing layout. */
  loading?: boolean;
  /** Renders the pressed/selected cap used by active tool and toggle buttons. */
  active?: boolean;
  /** Native button type. Defaults to `"button"` so forms never submit implicitly. */
  type?: 'button' | 'submit' | 'reset';
  /** Stretches the cap to the full width of its container. */
  fullWidth?: boolean;
  /** Icon rendered before the label. */
  leadingIcon?: ReactNode;
  /** Icon rendered after the label. */
  trailingIcon?: ReactNode;
  /** Audio cue on press. Defaults to `"blip"`. */
  sound?: ArcadeButtonSound;
  /** Extra classes appended to the cap. */
  className?: string;
  /** Ref to the underlying `<button>` (React 19 ref-as-prop). */
  ref?: Ref<HTMLButtonElement>;
}

const VARIANT_CLASSES: Record<ArcadeButtonVariant, string> = {
  primary:
    'bg-arcade-neon-green text-arcade-black border-arcade-neon-green hover:bg-arcade-cyan hover:border-arcade-cyan',
  secondary:
    'bg-arcade-surface-raised text-arcade-text border-arcade-border-light hover:bg-arcade-border hover:text-white',
  danger:
    'bg-arcade-red text-arcade-black border-arcade-red hover:bg-arcade-hot-pink hover:border-arcade-hot-pink',
  ghost:
    'bg-transparent text-arcade-muted border-arcade-border hover:bg-arcade-surface-raised hover:text-arcade-text',
};

const ACTIVE_CLASSES: Record<ArcadeButtonVariant, string> = {
  primary: 'bg-arcade-cyan text-arcade-black border-arcade-cyan',
  secondary: 'bg-arcade-neon-green text-arcade-black border-arcade-neon-green',
  danger: 'bg-arcade-amber text-arcade-black border-arcade-amber',
  ghost: 'bg-arcade-surface-sunken text-arcade-neon-green border-arcade-neon-green',
};

const SIZE_CLASSES: Record<ArcadeButtonSize, string> = {
  sm: 'min-h-9 px-2 text-pixel-xs gap-1',
  md: 'min-h-11 px-3 text-pixel-xs gap-2',
  lg: 'min-h-12 px-4 text-pixel-sm gap-2',
  icon: 'h-11 w-11 min-h-11 min-w-11 justify-center text-pixel-sm',
  'icon-sm': 'h-9 w-9 min-h-9 min-w-9 justify-center text-pixel-xs',
  'icon-lg': 'h-14 w-14 min-h-14 min-w-14 justify-center text-pixel-md',
};

/**
 * 8-bit cabinet button.
 *
 * Renders a native `<button>` with a bevelled cap, press translation, an optional
 * synthesised click, full disabled/loading semantics, and pass-through of all
 * remaining native button props.
 */
export function ArcadeButton({
  children,
  onClick,
  variant = 'secondary',
  size = 'md',
  disabled = false,
  loading = false,
  active = false,
  type = 'button',
  fullWidth = false,
  leadingIcon,
  trailingIcon,
  sound = 'blip',
  className,
  ref,
  ...nativeProps
}: ArcadeButtonProps) {
  const isInteractive = !disabled && !loading;

  const handleClick = (event: ReactMouseEvent<HTMLButtonElement>): void => {
    if (!isInteractive) {
      return;
    }

    if (sound === 'blip') {
      retroAudioEngine.playPixelBlip();
    } else if (sound === 'select') {
      retroAudioEngine.playToolSelect();
    }

    onClick?.(event);
  };

  return (
    <button
      {...nativeProps}
      ref={ref}
      type={type}
      aria-pressed={active ? true : nativeProps['aria-pressed']}
      aria-busy={loading || undefined}
      disabled={disabled || loading}
      onClick={handleClick}
      className={cx(
        'pixel-press relative inline-flex select-none items-center font-arcade uppercase leading-none',
        'border-2 text-pixel-xs',
        SIZE_CLASSES[size],
        fullWidth && 'w-full',
        active ? 'pixel-border-inset' : 'pixel-border-outset',
        disabled || loading
          ? 'cursor-not-allowed border-arcade-border bg-arcade-surface-sunken text-arcade-disabled'
          : active
            ? ACTIVE_CLASSES[variant]
            : VARIANT_CLASSES[variant],
        className,
      )}
    >
      {loading ? (
        <span aria-hidden="true" className="arcade-spinner" />
      ) : (
        leadingIcon && <span className="flex-none">{leadingIcon}</span>
      )}

      {children !== undefined && children !== null && (
        <span className="truncate leading-none">{children}</span>
      )}

      {trailingIcon && !loading && <span className="flex-none">{trailingIcon}</span>}
    </button>
  );
}
