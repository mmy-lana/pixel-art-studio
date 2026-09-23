import type {
  FocusEvent as ReactFocusEvent,
  KeyboardEvent as ReactKeyboardEvent,
  PointerEvent as ReactPointerEvent,
  ReactElement,
  ReactNode,
  Ref,
} from 'react';
import {
  cloneElement,
  isValidElement,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import { cx } from '../../utils/classNames';

/** Preferred placement of the bubble relative to the trigger. */
export type ArcadeTooltipPlacement = 'top' | 'bottom' | 'left' | 'right';

/** Props this component injects into its single child element. */
interface TooltipTriggerProps {
  'aria-describedby'?: string;
  onPointerEnter?: (event: ReactPointerEvent<HTMLElement>) => void;
  onPointerLeave?: (event: ReactPointerEvent<HTMLElement>) => void;
  onFocus?: (event: ReactFocusEvent<HTMLElement>) => void;
  onBlur?: (event: ReactFocusEvent<HTMLElement>) => void;
  onKeyDown?: (event: ReactKeyboardEvent<HTMLElement>) => void;
  ref?: Ref<HTMLElement>;
}

export interface ArcadeTooltipProps {
  /** Exactly one element that receives the description wiring and handlers. */
  children: ReactElement<TooltipTriggerProps>;
  /** Bubble text. */
  label: ReactNode;
  /** Optional keyboard shortcut badge, e.g. `"B"`. */
  hotkey?: string;
  placement?: ArcadeTooltipPlacement;
  /** Delay before showing, in ms. Keyboard focus always shows immediately. */
  delayMs?: number;
  /** Suppresses the bubble, e.g. when the trigger is disabled. */
  disabled?: boolean;
  className?: string;
}

interface BubblePosition {
  top: number;
  left: number;
  placement: ArcadeTooltipPlacement;
}

/** Distance between the trigger edge and the bubble. */
const GAP = 8;

/**
 * Floating arcade tooltip.
 *
 * The trigger is cloned rather than wrapped, so tab order and layout stay
 * untouched while the bubble is wired through `aria-describedby`. Positioning is
 * measured after mount, flips to the opposite side when the preferred side would
 * overflow the viewport, is clamped inside the viewport, and re-measures on
 * scroll and resize. Hover is suppressed on touch/hover-less pointers; keyboard
 * focus always shows the bubble immediately.
 */
export function ArcadeTooltip({
  children,
  label,
  hotkey,
  placement = 'top',
  delayMs = 350,
  disabled = false,
  className,
}: ArcadeTooltipProps) {
  const generatedId = useId();
  const tooltipId = `${generatedId}-tooltip`;

  const triggerRef = useRef<HTMLElement | null>(null);
  const bubbleRef = useRef<HTMLDivElement | null>(null);
  const timerRef = useRef<number | null>(null);

  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<BubblePosition | null>(null);

  /** True when the primary pointer supports hover (mouse/pen, not touch). */
  const canHover = useCallback((): boolean => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return true;
    }

    return window.matchMedia('(hover: hover)').matches;
  }, []);

  const clearTimer = useCallback((): void => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const show = useCallback(
    (immediate: boolean): void => {
      if (disabled) {
        return;
      }

      clearTimer();

      if (immediate) {
        setOpen(true);
        return;
      }

      timerRef.current = window.setTimeout(() => {
        setOpen(true);
      }, delayMs);
    },
    [clearTimer, delayMs, disabled],
  );

  const hide = useCallback((): void => {
    clearTimer();
    setOpen(false);
    setPosition(null);
  }, [clearTimer]);

  useEffect(() => {
    if (disabled && open) {
      hide();
    }
  }, [disabled, open, hide]);

  /** Cancels a pending show timer when the tooltip unmounts. */
  useEffect(() => clearTimer, [clearTimer]);

  /** Measures the trigger and bubble, resolving placement and clamping. */
  const measure = useCallback((): void => {
    const trigger = triggerRef.current;
    const bubble = bubbleRef.current;

    if (!trigger || !bubble) {
      return;
    }

    const triggerRect = trigger.getBoundingClientRect();
    const bubbleRect = bubble.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    let resolved: ArcadeTooltipPlacement = placement;

    if (placement === 'top' && triggerRect.top - bubbleRect.height - GAP < 0) {
      resolved = 'bottom';
    } else if (
      placement === 'bottom' &&
      triggerRect.bottom + bubbleRect.height + GAP > viewportHeight
    ) {
      resolved = 'top';
    } else if (placement === 'left' && triggerRect.left - bubbleRect.width - GAP < 0) {
      resolved = 'right';
    } else if (
      placement === 'right' &&
      triggerRect.right + bubbleRect.width + GAP > viewportWidth
    ) {
      resolved = 'left';
    }

    let top: number;
    let left: number;

    if (resolved === 'top' || resolved === 'bottom') {
      top =
        resolved === 'top'
          ? triggerRect.top - bubbleRect.height - GAP
          : triggerRect.bottom + GAP;
      left = triggerRect.left + triggerRect.width / 2 - bubbleRect.width / 2;
    } else {
      left =
        resolved === 'left'
          ? triggerRect.left - bubbleRect.width - GAP
          : triggerRect.right + GAP;
      top = triggerRect.top + triggerRect.height / 2 - bubbleRect.height / 2;
    }

    setPosition({
      top: Math.max(GAP, Math.min(top, viewportHeight - bubbleRect.height - GAP)),
      left: Math.max(GAP, Math.min(left, viewportWidth - bubbleRect.width - GAP)),
      placement: resolved,
    });
  }, [placement]);

  useLayoutEffect(() => {
    if (open) {
      measure();
    }
  }, [open, measure, label, hotkey]);

  useEffect(() => {
    if (!open) {
      return;
    }

    const handleReposition = (): void => {
      measure();
    };

    window.addEventListener('scroll', handleReposition, true);
    window.addEventListener('resize', handleReposition);

    return () => {
      window.removeEventListener('scroll', handleReposition, true);
      window.removeEventListener('resize', handleReposition);
    };
  }, [open, measure]);

  if (!isValidElement(children)) {
    // Typed to prevent this, but a mistyped call site must not take the app down.
    console.error('ArcadeTooltip: `children` must be a single React element.');
    return null;
  }

  const trigger = cloneElement(children, {
    'aria-describedby': open ? tooltipId : undefined,
    ref: (node: HTMLElement | null) => {
      triggerRef.current = node;

      // Preserve any ref the caller already attached to the trigger element.
      const childRef = (children as unknown as { ref?: Ref<HTMLElement> }).ref;

      if (typeof childRef === 'function') {
        childRef(node);
      } else if (childRef !== null && childRef !== undefined && typeof childRef === 'object') {
        (childRef as { current: HTMLElement | null }).current = node;
      }
    },
    onPointerEnter: (event: ReactPointerEvent<HTMLElement>) => {
      children.props.onPointerEnter?.(event);

      if (event.pointerType === 'touch' || !canHover()) {
        return;
      }

      show(false);
    },
    onPointerLeave: (event: ReactPointerEvent<HTMLElement>) => {
      children.props.onPointerLeave?.(event);
      hide();
    },
    onFocus: (event: ReactFocusEvent<HTMLElement>) => {
      children.props.onFocus?.(event);
      show(true);
    },
    onBlur: (event: ReactFocusEvent<HTMLElement>) => {
      children.props.onBlur?.(event);
      hide();
    },
    onKeyDown: (event: ReactKeyboardEvent<HTMLElement>) => {
      children.props.onKeyDown?.(event);

      if (event.key === 'Escape') {
        hide();
      }
    },
  });

  return (
    <>
      {trigger}

      {open &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            ref={bubbleRef}
            id={tooltipId}
            role="tooltip"
            style={{
              top: position?.top ?? -9999,
              left: position?.left ?? -9999,
              // Hidden until the first measurement lands, to avoid a visible jump.
              visibility: position === null ? 'hidden' : 'visible',
            }}
            className={cx(
              'arcade-tooltip-bubble pointer-events-none fixed z-[110] flex max-w-[min(16rem,calc(100vw-16px))] items-center gap-2 border-2 border-arcade-black bg-arcade-surface px-2 py-1.5',
              className,
            )}
          >
            <span className="text-pixel-xs normal-case leading-relaxed text-arcade-text">
              {label}
            </span>

            {hotkey !== undefined && (
              <kbd className="arcade-badge flex-none px-1 py-0.5 text-pixel-xs uppercase text-arcade-cyan">
                {hotkey}
              </kbd>
            )}
          </div>,
          document.body,
        )}
    </>
  );
}
