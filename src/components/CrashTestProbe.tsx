/**
 * Deliberately always present, in every build - not dev-gated. The E2E suite
 * (playwright.config.ts) tests the actual production bundle via `vite build`
 * + `vite preview`, not the dev server, so a dev-only check (e.g.
 * `import.meta.env.DEV`) would be compiled away and unusable there.
 *
 * Visiting the app with `?__crashtest=boundary` in the URL throws during
 * render, on purpose, so `tests/error-boundary.spec.ts` can verify
 * `ErrorBoundary`'s fallback screen actually works end-to-end in a real
 * browser. It's inert for everyone else - nobody stumbles into this by
 * accident, and triggering it deliberately just shows the same "your data's
 * safe, reload" screen a real crash would, with no side effects.
 */
export function CrashTestProbe() {
  if (
    new URLSearchParams(window.location.search).get("__crashtest") ===
    "boundary"
  ) {
    throw new Error(
      "Deliberate test crash (?__crashtest=boundary) - verifies the ErrorBoundary fallback.",
    );
  }
  return null;
}
