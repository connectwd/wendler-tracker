// How often to re-check for a new version while the tab is open. Combined with the
// visibilitychange check below (catches "reopened after being backgrounded"), this keeps
// an already-open session well within a couple of hours of the latest deploy - usually
// much sooner, since most real-world usage involves backgrounding/foregrounding the app
// (e.g. opening it, then switching to another app mid-workout) far more often than leaving
// a single tab continuously in the foreground for hours.
const POLL_INTERVAL_MS = 15 * 60 * 1000;

let registration: ServiceWorkerRegistration | null = null;

/**
 * Registers the service worker (production builds only - see the DEV guard below) and
 * calls `onUpdateAvailable` once a genuinely new version has taken control of the page.
 *
 * "Genuine update" specifically excludes the very first install on a browser that's never
 * had this app's service worker before - there's nothing to update *from* in that case, so
 * nothing is shown.
 */
export function registerServiceWorker(
  onUpdateAvailable: () => void,
  isDev: boolean = import.meta.env.DEV,
): void {
  if (!("serviceWorker" in navigator)) return;
  // Never register in dev - Vite serves unhashed module URLs there, and the service
  // worker's cache-first strategy would cache them permanently by that exact URL, silently
  // defeating both HMR and hard reloads. Production builds use hashed, immutable filenames,
  // which is what makes cache-first safe there in the first place.
  if (isDev) return;

  window.addEventListener("load", async () => {
    const swUrl = `${import.meta.env.BASE_URL}sw.js`;

    // Captured before registration resolves: a page that's already controlled by a
    // previous service worker is the genuine-update case. A page with no controller yet
    // is the very first install - there's no prior version to prompt an update away from.
    const hadControllerAtStart = !!navigator.serviceWorker.controller;

    try {
      // updateViaCache: 'none' stops the browser from serving a stale, HTTP-cached copy
      // of sw.js itself when checking for updates - every check is a genuine network hit.
      registration = await navigator.serviceWorker.register(swUrl, {
        updateViaCache: "none",
      });
    } catch {
      // Offline support is a nice-to-have, not load-bearing - don't block the app on failure.
      return;
    }

    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (hadControllerAtStart) onUpdateAvailable();
    });

    setInterval(() => registration?.update(), POLL_INTERVAL_MS);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") registration?.update();
    });
  });
}

/** Reloads the page to pick up the version the new service worker has already activated. */
export function applyUpdate(): void {
  window.location.reload();
}
