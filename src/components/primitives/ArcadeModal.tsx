import type { ReactNode } from 'react';
import { useCallback, useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { cx } from '../../utils/classNames';
import { acquireBodyScrollLock, releaseBodyScrollLock } from '../../utils/scrollLock';

/** Dialog width presets. */
export type ArcadeModalSize = 'sm' | 'md' | 'lg';

export interface ArcadeModalProps {
  /** Controls visibility. The dialog is unmounted entirely while closed. */
  open: boolean;
  /** Called when the user dismisses via Escape, backdrop or the close cap. */
  onClose: () => void;
  /** Dialog heading, wired to `aria-labelledby`. */
  title: ReactNode;
  /** Supporting copy, wired to `aria-describedby`. */
  description?: ReactNode;
  /** Dialog body. */
  children?: ReactNode;
  /** Action row pinned under the body. */
  footer?: ReactNode;
  size?: ArcadeModalSize;
  /** Allows Escape / backdrop / close-cap dismissal. Defaults to `true`. */
  dismissible?: boolean;
  /** Closes when the backdrop is pressed. Defaults to `true`. */
  closeOnBackdrop?: boolean;
  /** Extra classes for the dialog panel. */
  className?: string;
}

const SIZE_CLASSES: Record<ArcadeModalSize, string> = {
  sm: 'w-full max-w-sm',
  md: 'w-full max-w-lg',
  lg: 'w-full max-w-3xl',
};

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

/**
 * Arcade dialog.
 *
 * Renders through a portal into `document.body` and implements the full modal
 * contract: `role="dialog"` + `aria-modal`, labelled/described wiring, focus
 * moved inside on open, focus trapped while open, focus restored to the invoking
 * element on close, Escape-to-dismiss, backdrop dismissal and body scroll lock.
 */
export function ArcadeModal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = 'md',
  dismissible = true,
  closeOnBackdrop = true,
  className,
}: ArcadeModalProps) {
  const generatedId = useId();
  const titleId = `${generatedId}-title`;
  const descriptionId = `${generatedId}-description`;

  const panelRef = useRef<HTMLDivElement | null>(null);
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);

  const handleClose = useCallback((): void => {
    if (!dismissible) {
      return;
    }

    onClose();
  }, [dismissible, onClose]);

  /** Moves focus into the dialog, preferring an explicit autofocus target. */
  useEffect(() => {
    if (!open) {
      return;
    }

    previouslyFocusedRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;

    const panel = panelRef.current;
    const preferred = panel?.querySelector<HTMLElement>('[data-modal-autofocus="true"]');
    const firstFocusable = panel?.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
    const target = preferred ?? firstFocusable ?? panel;

    target?.focus();

    return () => {
      const previous = previouslyFocusedRef.current;

      if (previous && document.contains(previous)) {
        previous.focus();
      }
    };
  }, [open]);

  /** Escape to dismiss + Tab containment. */
  useEffect(() => {
    if (!open) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.preventDefault();
        handleClose();
        return;
      }

      if (event.key !== 'Tab') {
        return;
      }

      const panel = panelRef.current;

      if (!panel) {
        return;
      }

      const focusable = Array.from(
        panel.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
      ).filter(
        (element) =>
          element === document.activeElement || element.getClientRects().length > 0,
      );

      if (focusable.length === 0) {
        event.preventDefault();
        panel.focus();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;

      if (event.shiftKey && (active === first || active === panel)) {
        event.preventDefault();
        last.focus();
        return;
      }

      if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown, true);

    return () => {
      document.removeEventListener('keydown', handleKeyDown, true);
    };
  }, [open, handleClose]);

  /** Body scroll lock while the dialog is mounted. */
  useEffect(() => {
    if (!open) {
      return;
    }

    acquireBodyScrollLock();

    return () => {
      releaseBodyScrollLock();
    };
  }, [open]);

  if (!open || typeof document === 'undefined') {
    return null;
  }

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-6">
      <div
        aria-hidden="true"
        onClick={closeOnBackdrop ? handleClose : undefined}
        className="absolute inset-0 bg-arcade-ink/85"
      />

      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description !== undefined ? descriptionId : undefined}
        tabIndex={-1}
        className={cx(
          'pixel-border-outset arcade-pop relative flex max-h-full flex-col border-2 border-arcade-border-light bg-arcade-surface',
          SIZE_CLASSES[size],
          className,
        )}
      >
        <header className="flex flex-none items-start justify-between gap-3 border-b-2 border-arcade-border bg-arcade-surface-sunken px-3 py-3">
          <div className="min-w-0">
            <h2
              id={titleId}
              className="truncate text-pixel-sm uppercase text-arcade-neon-green"
            >
              {title}
            </h2>

            {description !== undefined && (
              <p
                id={descriptionId}
                className="mt-1 text-pixel-xs normal-case leading-relaxed text-arcade-muted"
              >
                {description}
              </p>
            )}
          </div>

          {dismissible && (
            <button
              type="button"
              onClick={handleClose}
              aria-label="Close dialog"
              className="pixel-press flex h-9 w-9 flex-none items-center justify-center border-2 border-arcade-border bg-arcade-surface-raised text-pixel-sm text-arcade-muted hover:border-arcade-red hover:text-arcade-red"
            >
              ✕
            </button>
          )}
        </header>

        <div className="arcade-scroll min-h-0 flex-1 overflow-y-auto px-3 py-3">
          {children}
        </div>

        {footer !== undefined && (
          <footer className="flex flex-none flex-wrap items-center justify-end gap-2 border-t-2 border-arcade-border bg-arcade-surface-sunken px-3 py-3">
            {footer}
          </footer>
        )}
      </div>
    </div>,
    document.body,
  );
}
