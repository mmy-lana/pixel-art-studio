/**
 * Tool registry.
 *
 * Single source of truth for every drawing tool: its label, keyboard shortcut,
 * icon and canvas cursor. Consumed by `ToolsetPanel` (Phase 3), the mobile tool
 * carousel (Phase 5) and the global keyboard-shortcut listener (Phase 5), so a
 * shortcut can never drift from the badge rendered on the button.
 */

import {
  Circle,
  Eraser,
  Hand,
  LassoSelect,
  PaintBucket,
  Pencil,
  PenLine,
  Pipette,
  Square,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { ToolType } from '../../types';

export interface ToolDefinition {
  id: ToolType;
  /** Uppercase label shown on the cap and in tooltips. */
  label: string;
  /** Single-character shortcut, uppercase. `null` when the tool has none. */
  hotkey: string | null;
  icon: LucideIcon;
  /** One-line explanation used as the tooltip body. */
  description: string;
  /** Tailwind cursor utility applied to the canvas while this tool is active. */
  cursorClass: string;
  /**
   * Hidden from the primary rail on the smallest phones (360-389px), where the
   * dock only has room for four tools (plan §4.1).
   */
  compactDock: boolean;
}

/**
 * Ordered tool rail. Order drives the desktop rail, the tablet rail and the
 * mobile carousel so the muscle memory is identical across breakpoints.
 *
 * `select` uses `M` (marquee) rather than `S` so that `S` stays free for a
 * future save/save-as binding.
 */
export const TOOL_DEFINITIONS: readonly ToolDefinition[] = [
  {
    id: 'pencil',
    label: 'Pencil',
    hotkey: 'B',
    icon: Pencil,
    description: 'Draw single pixels and continuous strokes.',
    cursorClass: 'cursor-crosshair',
    compactDock: true,
  },
  {
    id: 'eraser',
    label: 'Eraser',
    hotkey: 'E',
    icon: Eraser,
    description: 'Clear pixels back to full transparency.',
    cursorClass: 'cursor-crosshair',
    compactDock: true,
  },
  {
    id: 'bucket',
    label: 'Fill',
    hotkey: 'G',
    icon: PaintBucket,
    description: 'Flood fill a contiguous block of matching colour.',
    cursorClass: 'cursor-crosshair',
    compactDock: true,
  },
  {
    id: 'eyedropper',
    label: 'Pick',
    hotkey: 'I',
    icon: Pipette,
    description: 'Sample a colour from the canvas into the primary slot.',
    cursorClass: 'cursor-crosshair',
    compactDock: true,
  },
  {
    id: 'line',
    label: 'Line',
    hotkey: 'L',
    icon: PenLine,
    description: 'Drag a pixel-perfect straight line.',
    cursorClass: 'cursor-crosshair',
    compactDock: false,
  },
  {
    id: 'rectangle',
    label: 'Rect',
    hotkey: 'U',
    icon: Square,
    description: 'Drag an outlined box. Hold Shift to fill it.',
    cursorClass: 'cursor-crosshair',
    compactDock: true,
  },
  {
    id: 'circle',
    label: 'Circle',
    hotkey: 'C',
    icon: Circle,
    description: 'Drag an outlined ellipse. Hold Shift to fill it.',
    cursorClass: 'cursor-crosshair',
    compactDock: false,
  },
  {
    id: 'select',
    label: 'Select',
    hotkey: 'M',
    icon: LassoSelect,
    description: 'Marquee a region to move, clear or keep it floating.',
    cursorClass: 'cursor-crosshair',
    compactDock: false,
  },
  {
    id: 'pan',
    label: 'Pan',
    hotkey: 'H',
    icon: Hand,
    description: 'Drag to move the board. Space bar works with any tool.',
    cursorClass: 'cursor-grab active:cursor-grabbing',
    compactDock: false,
  },
];

/** Fast id -> definition lookup for hotkey handling and cursor resolution. */
export const TOOL_DEFINITION_BY_ID: Readonly<Record<ToolType, ToolDefinition>> =
  TOOL_DEFINITIONS.reduce<Record<ToolType, ToolDefinition>>(
    (accumulator, definition) => {
      accumulator[definition.id] = definition;
      return accumulator;
    },
    {} as Record<ToolType, ToolDefinition>,
  );

/** Fast hotkey -> tool lookup. Keys are uppercase single characters. */
export const TOOL_ID_BY_HOTKEY: Readonly<Record<string, ToolType>> =
  TOOL_DEFINITIONS.reduce<Record<string, ToolType>>((accumulator, definition) => {
    if (definition.hotkey !== null) {
      accumulator[definition.hotkey] = definition.id;
    }

    return accumulator;
  }, {});

/** Returns the definition for a tool id, throwing if the registry is incomplete. */
export function getToolDefinition(toolId: ToolType): ToolDefinition {
  const definition = TOOL_DEFINITION_BY_ID[toolId];

  if (!definition) {
    throw new Error(`getToolDefinition: no definition registered for tool "${toolId}".`);
  }

  return definition;
}
