import type { ReactNode } from 'react';
import { ScanlineOverlay } from '../components/compound/ScanlineOverlay';
import { useEditorStore } from '../store/editorStore';
import { cx } from '../utils/classNames';

export interface StudioLayoutProps {
  children: ReactNode;
  /** Extra classes for the root element. */
  className?: string;
}

/**
 * Root layout shell.
 *
 * In this Vite build there is no framework layout route, so this component *is*
 * the layout: it owns the fixed full-viewport frame and the app-wide CRT filter.
 * The scanline layer is rendered here (not inside the canvas) so it also covers
 * the panels and dialogs, matching the cabinet metaphor — and it is always
 * `pointer-events-none`, so it can never swallow input.
 */
export function StudioLayout({ children, className }: StudioLayoutProps) {
  const scanlinesEnabled = useEditorStore((state) => state.settings.scanlinesEnabled);

  return (
    <div
      className={cx(
        'relative flex h-screen h-[100dvh] w-screen w-full min-h-0 flex-col overflow-hidden bg-arcade-black text-arcade-text',
        className,
      )}
    >
      {children}

      <ScanlineOverlay
        enabled={scanlinesEnabled}
        position="fixed"
        scanlines
        vignette
        zIndexClass="z-50"
      />
    </div>
  );
}
