import type { SymmetryMode } from '../../types';
import { Ban, MoveHorizontal, MoveVertical, Sparkles } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { cx } from '../../utils/classNames';
import { SYMMETRY_MODE_META, SYMMETRY_MODES } from '../../utils/algorithms/symmetry';
import { ArcadeButton } from '../primitives/ArcadeButton';
import { ArcadeTooltip } from '../primitives/ArcadeTooltip';

/** Icon per mode: the arrows show which way the mirror copies. */
const MODE_ICONS: Readonly<Record<SymmetryMode, LucideIcon>> = {
  none: Ban,
  vertical: MoveHorizontal,
  horizontal: MoveVertical,
  both: Sparkles,
};

export interface SymmetryControlsProps {
  symmetryMode: SymmetryMode;
  onChange: (mode: SymmetryMode) => void;
  /**
   * Draws the live mirror guides on the canvas overlay. Purely a viewport
   * preference; mirroring itself still applies when guides are hidden.
   */
  showGuides: boolean;
  onToggleGuides: (visible: boolean) => void;
  /** `bar` lays the caps out inline, `stack` fills the drawer width. */
  variant?: 'bar' | 'stack';
  className?: string;
}

/**
 * Symmetry mode selector.
 *
 * Every stroke is mirrored live while a mode is active (see
 * `expandSymmetricStroke`), so the guides are only a visual aid and can be
 * switched off without affecting output.
 */
export function SymmetryControls({
  symmetryMode,
  onChange,
  showGuides,
  onToggleGuides,
  variant = 'bar',
  className,
}: SymmetryControlsProps) {
  const guidesAvailable = symmetryMode !== 'none';

  return (
    <div className={cx('flex flex-col gap-2', className)}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-pixel-xs uppercase text-arcade-muted">Symmetry</span>

        <ArcadeTooltip
          label={
            guidesAvailable
              ? showGuides
                ? 'Hide the mirror guides'
                : 'Show the mirror guides'
              : 'Guides appear once a symmetry mode is active'
          }
        >
          <ArcadeButton
            size="sm"
            variant={showGuides && guidesAvailable ? 'primary' : 'ghost'}
            active={showGuides && guidesAvailable}
            aria-pressed={showGuides && guidesAvailable}
            disabled={!guidesAvailable}
            aria-label="Toggle symmetry guides"
            onClick={() => {
              onToggleGuides(!showGuides);
            }}
          >
            Guides
          </ArcadeButton>
        </ArcadeTooltip>
      </div>

      <div
        role="radiogroup"
        aria-label="Symmetry mode"
        className={cx(
          variant === 'bar' ? 'flex flex-wrap items-center gap-1.5' : 'grid grid-cols-4 gap-1.5',
        )}
      >
        {SYMMETRY_MODES.map((mode) => {
          const meta = SYMMETRY_MODE_META[mode];
          const Icon = MODE_ICONS[mode];
          const isActive = mode === symmetryMode;

          return (
            <ArcadeTooltip key={mode} label={meta.description}>
              <ArcadeButton
                size={variant === 'bar' ? 'sm' : 'icon'}
                variant={isActive ? 'primary' : 'secondary'}
                active={isActive}
                role="radio"
                aria-checked={isActive}
                aria-label={meta.description}
                onClick={() => {
                  onChange(mode);
                }}
                leadingIcon={
                  variant === 'bar' ? (
                    <Icon aria-hidden="true" className="h-3.5 w-3.5" strokeWidth={2.5} />
                  ) : undefined
                }
              >
                {variant === 'bar' ? (
                  meta.label
                ) : (
                  <Icon aria-hidden="true" className="h-4 w-4" strokeWidth={2.5} />
                )}
              </ArcadeButton>
            </ArcadeTooltip>
          );
        })}
      </div>

      <p className="text-pixel-xs normal-case leading-relaxed text-arcade-muted">
        {SYMMETRY_MODE_META[symmetryMode].description}
      </p>
    </div>
  );
}
