import type { ReactNode } from 'react';
import { useEffect, useId, useRef } from 'react';
import { ChevronDown } from 'lucide-react';
import { cx } from '../../utils/classNames';
import { acquireBodyScrollLock, releaseBodyScrollLock } from '../../utils/scrollLock';
import { ArcadeButton } from '../primitives/ArcadeButton';

/** Tabs available in the pull-up drawer. */
export type MobileDrawerTab = 'tools' | 'colours' | 'layers';

export interface MobileControlDrawerProps {
  open: boolean;
  activeTab: MobileDrawerTab;
  onTabChange: (tab: MobileDrawerTab) => void;
  onClose: () => void;
  /** Tool grid panel. */
  toolsPanel: ReactNode;
  /** Colour + palette panels. */
  coloursPanel: ReactNode;
  /** Layer stack panel. */
  layersPanel: ReactNode;
  /**
   * Zoom controls. Housed here rather than in the dock: plan §4.1 requires the
   * zoom caps to live strictly inside the drawer on small screens.
   */
  zoomPanel: ReactNode;
}

const TAB_LABELS: readonly { value: MobileDrawerTab; label: string }[] = [
  { value: 'tools', label: 'Tools' },
  { value: 'colours', label: 'Colours' },
  { value: 'layers', label: 'Layers' },
];

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

/**
 * Mobile control drawer (pull-up sheet).
 *
 * Behaves as a modal dialog for assistive technology: `role="dialog"` with
 * `aria-modal`, focus moved inside on open, Tab contained, Escape and backdrop
 * dismissal, and body scroll lock while it is open — matching the desktop
 * panel's capabilities without pretending to be a desktop panel.
 */
export function MobileControlDrawer({
  open,
  activeTab,
  onTabChange,
  onClose,
  toolsPanel,
  coloursPanel,
  layersPanel,
  zoomPanel,
}: MobileControlDrawerProps) {
  const generatedId = useId();
  const titleId = `${generatedId}-title`;
  const panelRef = useRef<HTMLDivElement | null>(null);

  /** Escape to close + Tab containment. */
  useEffect(() => {
    if (!open) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
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

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown, true);

    return () => {
      document.removeEventListener('keydown', handleKeyDown, true);
    };
  }, [open, onClose]);

  /** Body scroll lock while the drawer is open. */
  useEffect(() => {
    if (!open) {
      return;
    }

    acquireBodyScrollLock();

    return () => {
      releaseBodyScrollLock();
    };
  }, [open]);

  /** Move focus into the sheet when it opens. */
  useEffect(() => {
    if (!open) {
      return;
    }

    const panel = panelRef.current;

    if (!panel) {
      return;
    }

    const target = panel.querySelector<HTMLElement>('[data-drawer-autofocus="true"]');

    (target ?? panel).focus();
  }, [open]);

  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-[90] flex flex-col justify-end tablet:hidden">
      <button
        type="button"
        aria-label="Close the control drawer"
        onClick={onClose}
        className="absolute inset-0 cursor-default bg-arcade-ink/80"
      />

      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="arcade-slide-up relative flex max-h-[72vh] flex-col border-t-4 border-black bg-arcade-surface"
        style={{ paddingBottom: 'max(0.5rem, env(safe-area-inset-bottom, 0px))' }}
      >
        {/* Grab handle: a second, larger dismiss affordance. */}
        <button
          type="button"
          aria-label="Close the control drawer"
          onClick={onClose}
          className="flex h-7 w-full flex-none items-center justify-center border-b-2 border-arcade-border bg-arcade-surface-sunken text-arcade-muted"
        >
          <ChevronDown aria-hidden="true" className="h-4 w-4" strokeWidth={3} />
        </button>

        <div className="flex flex-none items-center gap-1.5 border-b-2 border-arcade-border px-2 py-2">
          <h2 id={titleId} className="mr-auto text-pixel-xs uppercase text-arcade-neon-green">
            Controls
          </h2>

          <div role="tablist" aria-label="Control groups" className="flex items-center gap-1">
            {TAB_LABELS.map((tab) => {
              const isActive = tab.value === activeTab;

              return (
                <ArcadeButton
                  key={tab.value}
                  size="md"
                  variant={isActive ? 'primary' : 'ghost'}
                  role="tab"
                  aria-selected={isActive}
                  data-drawer-autofocus={tab.value === 'tools' ? 'true' : undefined}
                  onClick={() => {
                    onTabChange(tab.value);
                  }}
                >
                  {tab.label}
                </ArcadeButton>
              );
            })}
          </div>
        </div>

        <div className="arcade-scroll min-h-0 flex-1 overflow-y-auto px-2 py-3">
          <div className={cx('flex flex-col gap-3', activeTab !== 'tools' && 'hidden')}>
            {toolsPanel}
          </div>

          <div className={cx('flex flex-col gap-3', activeTab !== 'colours' && 'hidden')}>
            {coloursPanel}
          </div>

          <div className={cx('flex flex-col gap-3', activeTab !== 'layers' && 'hidden')}>
            {layersPanel}
          </div>
        </div>

        {/* Zoom lives here on touch layouts (plan §4.1). */}
        <div className="flex flex-none items-center justify-between gap-2 border-t-2 border-arcade-border px-2 pt-2">
          <span className="text-pixel-xs uppercase text-arcade-muted">Viewport</span>
          {zoomPanel}
        </div>
      </div>
    </div>
  );
}
