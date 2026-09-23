import { cx } from '../../utils/classNames';

export interface ScanlineOverlayProps {
  /** Master toggle. When false the component renders nothing. */
  enabled: boolean;
  /** Draws the horizontal 4px scanline mask. Defaults to `true`. */
  scanlines?: boolean;
  /** Draws the radial CRT vignette. Defaults to `true`. */
  vignette?: boolean;
  /** Draws the subtle phosphor tint bands. Defaults to `false`. */
  glow?: boolean;
  /** Adds the slow brightness flicker. Defaults to `false`. */
  flicker?: boolean;
  /** Positioning strategy: `absolute` fills the nearest positioned ancestor. */
  position?: 'absolute' | 'fixed';
  /** Stacking order. Defaults to the app's top overlay layer. */
  zIndexClass?: string;
  className?: string;
}

/**
 * Non-interactive CRT filter.
 *
 * Purely presentational and always `pointer-events-none`, so it can be layered
 * over the canvas, dialogs or the whole shell without intercepting input. All
 * animations are disabled globally under `prefers-reduced-motion` (see
 * main.css), so no additional guard is needed here.
 */
export function ScanlineOverlay({
  enabled,
  scanlines = true,
  vignette = true,
  glow = false,
  flicker = false,
  position = 'absolute',
  zIndexClass = 'z-40',
  className,
}: ScanlineOverlayProps) {
  if (!enabled) {
    return null;
  }

  return (
    <div
      aria-hidden="true"
      className={cx(
        'pointer-events-none inset-0',
        position === 'fixed' ? 'fixed' : 'absolute',
        zIndexClass,
        flicker && 'crt-flicker',
        className,
      )}
    >
      {scanlines && <div className="absolute inset-0 crt-scanlines" />}
      {glow && <div className="absolute inset-0 crt-glow" />}
      {vignette && <div className="absolute inset-0 crt-vignette" />}
    </div>
  );
}
