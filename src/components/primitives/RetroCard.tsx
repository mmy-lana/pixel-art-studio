import type { ReactNode } from 'react';
import { cx } from '../../utils/classNames';

/** Surface treatment of the card. */
export type RetroCardVariant = 'panel' | 'screen' | 'inset' | 'bare';

export interface RetroCardProps {
  children?: ReactNode;
  /** Small uppercase heading rendered in the card's title bar. */
  title?: ReactNode;
  /** Supporting line under the title. */
  subtitle?: ReactNode;
  /** Rendered at the right edge of the title bar (badges, counters, caps). */
  headerAccessory?: ReactNode;
  /** Rendered in a footer row, separated by the dotted arcade divider. */
  footer?: ReactNode;
  variant?: RetroCardVariant;
  /** Adds the CRT bezel treatment (thick moulding + corner rivets). */
  bezel?: boolean;
  /** Removes the body padding, for cards whose child manages its own edges. */
  flush?: boolean;
  /** Applies the standard panel scroll behaviour to the body. */
  scrollable?: boolean;
  className?: string;
  /** Extra classes for the body element. */
  bodyClassName?: string;
}

const VARIANT_CLASSES: Record<RetroCardVariant, string> = {
  panel: 'border-2 border-arcade-border bg-arcade-surface pixel-border-flat',
  screen: 'border-2 border-arcade-border-light bg-arcade-ink pixel-border-inset',
  inset: 'border-2 border-arcade-border bg-arcade-surface-sunken pixel-border-inset',
  bare: 'bg-transparent',
};

/**
 * Bevelled container with corner rivets and an optional CRT bezel.
 *
 * Used for every side-panel section in the workbench; the corner accents are
 * decorative spans so the card body stays free of layout side effects.
 */
export function RetroCard({
  children,
  title,
  subtitle,
  headerAccessory,
  footer,
  variant = 'panel',
  bezel = false,
  flush = false,
  scrollable = false,
  className,
  bodyClassName,
}: RetroCardProps) {
  const hasHeader = title !== undefined || subtitle !== undefined || headerAccessory !== undefined;

  return (
    <section
      className={cx(
        'relative flex min-h-0 flex-col',
        VARIANT_CLASSES[variant],
        bezel && 'pixel-border-arcade border-4 border-black p-1',
        className,
      )}
    >
      {/* Corner rivets — purely decorative. */}
      {bezel && (
        <span aria-hidden="true" className="pointer-events-none absolute inset-0">
          <span className="absolute left-0 top-0 h-1.5 w-1.5 bg-arcade-border-light" />
          <span className="absolute right-0 top-0 h-1.5 w-1.5 bg-arcade-border-light" />
          <span className="absolute bottom-0 left-0 h-1.5 w-1.5 bg-arcade-border-light" />
          <span className="absolute bottom-0 right-0 h-1.5 w-1.5 bg-arcade-border-light" />
        </span>
      )}

      {hasHeader && (
        <header
          className={cx(
            'flex flex-none items-center justify-between gap-2 border-b-2 border-arcade-border bg-arcade-surface-sunken px-2 py-2',
          )}
        >
          <div className="min-w-0">
            {title !== undefined && (
              <h2 className="truncate text-pixel-xs uppercase text-arcade-neon-green">
                {title}
              </h2>
            )}

            {subtitle !== undefined && (
              <p className="mt-1 truncate text-pixel-xs normal-case text-arcade-muted">
                {subtitle}
              </p>
            )}
          </div>

          {headerAccessory !== undefined && (
            <div className="flex flex-none items-center gap-1">{headerAccessory}</div>
          )}
        </header>
      )}

      <div
        className={cx(
          'min-h-0 flex-1',
          !flush && 'px-2 py-2',
          scrollable && 'arcade-scroll overflow-y-auto',
          bodyClassName,
        )}
      >
        {children}
      </div>

      {footer !== undefined && (
        <>
          <div aria-hidden="true" className="arcade-divider flex-none" />
          <footer className="flex flex-none items-center justify-between gap-2 px-2 py-2">
            {footer}
          </footer>
        </>
      )}
    </section>
  );
}
