import { useEffect, useRef } from 'react';

/** Loosely typed on purpose - the Wake Lock API's TS types aren't in every lib.dom version. */
interface WakeLockLike {
  release: () => Promise<void>;
}

export function useWakeLock(active: boolean): void {
  const lockRef = useRef<WakeLockLike | null>(null);

  useEffect(() => {
    const nav = navigator as Navigator & { wakeLock?: { request: (type: 'screen') => Promise<WakeLockLike> } };
    if (!active || !nav.wakeLock) return;

    let cancelled = false;

    async function acquire() {
      try {
        const lock = await nav.wakeLock!.request('screen');
        if (cancelled) {
          void lock.release();
          return;
        }
        lockRef.current = lock;
      } catch {
        // Can fail for plenty of reasons (low battery, unsupported, permissions) - not critical.
      }
    }
    void acquire();

    function handleVisibility() {
      if (document.visibilityState === 'visible' && !lockRef.current) {
        void acquire();
      }
    }
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', handleVisibility);
      if (lockRef.current) {
        void lockRef.current.release();
        lockRef.current = null;
      }
    };
  }, [active]);
}
