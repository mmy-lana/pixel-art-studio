/**
 * Global reference-counted body scroll lock utility.
 *
 * Prevents nested modals and mobile drawers from prematurely resetting
 * body overflow when closing stacked dialog elements.
 */

let lockCount = 0;
let originalOverflow = '';
let originalPaddingRight = '';

export function acquireBodyScrollLock(): void {
  if (typeof document === 'undefined') {
    return;
  }

  if (lockCount === 0) {
    originalOverflow = document.body.style.overflow;
    originalPaddingRight = document.body.style.paddingRight;
    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;

    document.body.style.overflow = 'hidden';

    if (scrollbarWidth > 0) {
      document.body.style.paddingRight = `${scrollbarWidth}px`;
    }
  }

  lockCount += 1;
}

export function releaseBodyScrollLock(): void {
  if (typeof document === 'undefined') {
    return;
  }

  lockCount = Math.max(0, lockCount - 1);

  if (lockCount === 0) {
    document.body.style.overflow = originalOverflow;
    document.body.style.paddingRight = originalPaddingRight;
  }
}
