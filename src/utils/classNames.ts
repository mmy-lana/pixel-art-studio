/**
 * Minimal conditional class-name joiner.
 *
 * Kept dependency-free (no `clsx`/`tailwind-merge`) because the component layer
 * only ever needs concatenation: conflicting-utility resolution is handled by
 * making each component's base classes explicit rather than by merging strings.
 */

export type ClassValue =
  | string
  | number
  | null
  | undefined
  | false
  | readonly ClassValue[];

/** Joins truthy class values with a single space. */
export function cx(...values: readonly ClassValue[]): string {
  const parts: string[] = [];

  for (const value of values) {
    if (value === null || value === undefined || value === false || value === '') {
      continue;
    }

    if (Array.isArray(value)) {
      const nested = cx(...(value as readonly ClassValue[]));
      if (nested.length > 0) {
        parts.push(nested);
      }
      continue;
    }

    parts.push(String(value));
  }

  return parts.join(' ');
}
