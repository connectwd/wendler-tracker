import { useEffect, useRef } from 'react';
import { pushBackHandler, removeBackHandler, replaceBackHandler, type BackHandler } from '../lib/backNav';

export interface Backable {
  /**
   * Consumes this layer's history entry and runs its gated `onBack` callback.
   * Use this for the in-app Back/Cancel/X affordance, so tapping it behaves
   * exactly like swiping back does - both go through the same path, which
   * keeps the real browser history depth and the in-memory back stack in
   * lockstep. Don't call the close callback directly from a Back button; if
   * some paths close via history and others close via a direct state update,
   * the two drift apart and a later swipe can skip or resurface the wrong
   * screen.
   */
  goBack: () => void;
  /**
   * Closes this layer through some other, intentional action - Save, Skip,
   * Confirm - rather than a back gesture. Runs `onClose` immediately, then
   * separately consumes the browser history entry this layer still owns,
   * without re-running the gated `onBack` callback (e.g. an "unsaved
   * changes?" prompt that no longer applies once you've actually saved).
   */
  closeSilently: (onClose: () => void) => void;
}

/**
 * Registers the calling component as a back-able full-screen layer: pushes a
 * browser history entry on mount, and cleans up on unmount. See
 * ../lib/backNav.ts for why this is needed and how the shared stack works.
 *
 * `onBack` is read fresh on every call (via a ref), so it's safe to pass an
 * inline function that closes over changing local state - e.g. a dirty check
 * that should see the session's current unsaved-changes status, not whatever
 * it was when the component first mounted.
 *
 * By the time `onBack` runs, the back gesture has already consumed the real
 * browser history entry - there's no way to intercept a swipe before it
 * happens. So if `onBack` decides *not* to close after all (e.g. the user
 * declined an "unsaved changes?" prompt), it must return `true` to re-arm:
 * this pushes a fresh entry and re-registers the same handler, so the next
 * swipe prompts again instead of silently exiting the app.
 */
export function useBackable(onBack: () => void | boolean): Backable {
  const onBackRef = useRef(onBack);
  onBackRef.current = onBack;
  const handlerRef = useRef<BackHandler | null>(null);

  useEffect(() => {
    function rearm() {
      const handler: BackHandler = () => {
        const cancelled = onBackRef.current() === true;
        if (cancelled) rearm();
      };
      handlerRef.current = handler;
      window.history.pushState({}, '');
      pushBackHandler(handler);
    }
    rearm();
    return () => {
      if (handlerRef.current) removeBackHandler(handlerRef.current);
      handlerRef.current = null;
    };
    // Intentionally mount/unmount only - onBackRef always has the latest onBack.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    goBack: () => window.history.back(),
    closeSilently: (onClose: () => void) => {
      if (handlerRef.current) {
        replaceBackHandler(handlerRef.current, () => {});
        handlerRef.current = null;
      }
      onClose();
      window.history.back();
    },
  };
}
