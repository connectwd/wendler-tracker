/**
 * Shared back-gesture handling for the app's full-screen "layers" (an open
 * workout session, the rest-timer overlay, the new-cycle review screen).
 *
 * The installed PWA runs in `display: "standalone"` with no browser chrome of
 * its own, so it has no back button to fall back to. Android's back gesture
 * and the hardware/software back button both operate on the page's real
 * browser session history - if opening one of these screens never pushes a
 * history entry, there's nothing for the gesture to pop, and it falls through
 * to closing the app entirely instead of navigating back within it.
 *
 * The fix: every backable layer pushes one history entry when it opens (see
 * ../hooks/useBackable.ts) and this module's single `popstate` listener pops
 * the most-recently-opened layer's handler off a LIFO stack and calls it,
 * closing just that layer - so a swipe/back-press steps back through the
 * app's screens one at a time instead of exiting it.
 *
 * This file is deliberately framework-free (no React, no `window` access
 * except inside `initBackHandling`) so the stack bookkeeping itself can be
 * unit tested without a browser - the same approach used in restGame.ts.
 */

export type BackHandler = () => void;

const stack: BackHandler[] = [];
let listening = false;

/** Registers a layer's handler as the new top of the back stack. */
export function pushBackHandler(handler: BackHandler): void {
  stack.push(handler);
}

/**
 * Removes a specific handler from wherever it is in the stack (normally the
 * top). Safe to call even if it's already been popped or replaced - used from
 * a layer's unmount cleanup, which may run after its entry was already
 * consumed by a back gesture.
 */
export function removeBackHandler(handler: BackHandler): void {
  const index = stack.lastIndexOf(handler);
  if (index !== -1) stack.splice(index, 1);
}

/**
 * Swaps one handler for another in place, without changing stack depth. Used
 * to neutralize a layer's entry when it closes through some path other than a
 * back gesture (Save, Skip, Confirm) - the real browser history entry it
 * still owns will be consumed a moment later, and this ensures that doesn't
 * re-run the layer's gated back logic (e.g. an "unsaved changes?" prompt that
 * no longer applies once you've actually saved).
 */
export function replaceBackHandler(oldHandler: BackHandler, newHandler: BackHandler): void {
  const index = stack.lastIndexOf(oldHandler);
  if (index !== -1) stack[index] = newHandler;
}

/**
 * Pops and calls the topmost handler, if any. A no-op on an empty stack -
 * that's exactly the case where the user has backed/swiped past every open
 * layer, and we *want* the gesture to fall through to the OS closing the app.
 */
export function consumeTopBackHandler(): void {
  stack.pop()?.();
}

/** Current stack depth - exposed for tests, not used by app code. */
export function backStackDepth(): number {
  return stack.length;
}

/** Wires up the shared popstate listener. Safe to call more than once. */
export function initBackHandling(): void {
  if (listening) return;
  listening = true;
  window.addEventListener('popstate', consumeTopBackHandler);
}
