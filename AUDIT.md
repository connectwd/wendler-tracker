# Audit — wendler-tracker

Scope: everything in `src/` (13 components, 2 hooks, 9 lib modules) plus the E2E suite. Read every pure-logic file in full; read the highest-traffic/highest-risk components in full (App, Dashboard, WorkoutSession, NewCycleReview, Onboarding, SettingsView, GitHubSyncSettings, ConsistencyHeatmap); scanned the rest. Every finding below is line-referenced and, where relevant, cross-checked against actual call sites rather than assumed from reading a function in isolation.

**Status: every finding in this document has been fixed.** This file is kept as a record of what was wrong and why, not as an open task list. See the note under each item for what changed.

Severity key: 🔴 real bug, meaningful impact · 🟠 real bug, narrow window or low probability · 🟡 code smell / inconsistency, not currently a bug · ⚪ nitpick

---

## Stage 1 — Code quality

### What's genuinely good (for calibration)
- Zero stray `console.log`/`debugger` statements, zero `TODO`/`FIXME` markers, zero explicit `any` escape hatches anywhere in `src/`. Nothing left half-finished.
- The pure-calculation layer (`wendler.ts`, `plates.ts`, `plateau.ts`, `stats.ts`, `sync-reconcile.ts`) is cleanly separated from I/O (`db.ts`, `github-sync.ts`) and from the UI. That's the single most important structural decision in the codebase and it holds up throughout.
- Comments in the calculation layer explain *why*, several tied to verified real numbers rather than restating the code.
- Custom error classes are used correctly to let callers distinguish "expected, handle gracefully" from "unexpected, surface it."
- Naming is consistent throughout, no mixed conventions.

### 🔴 No error handling on any local write — the most important finding in this audit
**FIXED.** Built a proper error-handling architecture rather than patching in try/catch: `lib/errors.ts` (a `StorageError` class and `describeStorageError`/`makeAppError` for turning raw IndexedDB/DOM exceptions into messages worth showing someone), a `withPersistence` wrapper in `useAppData.ts` that every local write now goes through, and an `ErrorBanner` component surfaced in `App.tsx` above whatever screen is showing. On failure, UI state is never optimistically updated — what's on screen always matches what's actually persisted. Multi-record writes (onboarding, cycle rollover, backup restore) were also made atomic (`db.ts`'s `runTransaction`/`saveOnboardingData`/`saveCycleTransition`/`replaceAllData`), so a failure partway through can't leave IndexedDB half-written.

### 🔴 Backup import has no schema-migration path
**FIXED.** `backup.ts` now rejects a backup with an *older* schema version too (previously only newer was rejected), with a message explaining why, instead of silently corrupting the app on the next render.

### 🔴 Two unit-hardcoding bugs — kg baked in despite `lb` being a supported setting
**FIXED.** `plates.ts` has separate kg/lb plate sets and takes a `unit` parameter; `PlateBar.tsx` threads `settings.units` through. `plateau.ts`'s warning message takes a `unit` parameter instead of hardcoding `kg`. Both unit-tested for both units.

### 🔴 A `'pending'` session's AMRAP entry still counts toward PRs and plateau detection
**FIXED.** `WorkoutSession.tsx` only sets `estimatedOneRepMax` when the session's final status is `'completed'`, not whenever it isn't `'skipped'`.

### 🔴 Unsaved workout edits vanish with no confirmation, and a background event can force this
**FIXED two ways.** `WorkoutSession` tracks a `dirty` flag and confirms before discarding on "Back." `App.tsx`'s render priority was reordered so a pending sync conflict no longer force-switches away from an open, unsaved workout session — editing in progress always wins, and the conflict prompt waits until you close or save.

### 🔴 Training Max override accepts anything, unguarded, in one of the two places it appears
**FIXED.** Added `lib/validation.ts`'s `parsePositiveWeight` (empty/non-numeric/zero/negative all return `null` instead of `NaN`), used by both `Onboarding.tsx` and `NewCycleReview.tsx`. `NewCycleReview`'s confirm button is now disabled with an inline message on invalid input, matching what `Onboarding` already did.

### 🟠 Heatmap shading compares against all-time max tonnage, not the visible window's max
**FIXED.** `ConsistencyHeatmap.tsx` computes `maxTonnage` from the visible 26-week grid, not the full lifetime map.

### 🟠 `deleteLift` is dead code, and `saveLifts` never actually deletes
**FIXED.** `db.ts`'s `saveLifts` now clears and reinserts the lift store in one transaction — a genuine reconcile, not an append-only merge. The dead `deleteLift` export is gone.

### 🟡 `syncStateRef` is kept in sync inconsistently
**FIXED.** Sync was extracted into its own hook (`useGitHubSync.ts`); every state-update site now goes through one `persistSyncState` helper that updates the ref and render state together, always.

### 🟡 GitHub token isn't trimmed; disabling sync doesn't clear it
**FIXED.** Token is trimmed like the other fields. "Disable" is now a full disconnect that clears owner/repo/path/token from storage.

### 🟡 No `onblocked` handler on the IndexedDB open request
**FIXED.** `openDB()` has an `onblocked` handler with a clear message instead of hanging forever if another tab has the DB open on an older schema version.

### 🟡 Backup validation is shape-shallow
**FIXED.** `isValidAppData` checks per-record shape (lift/cycle/workout required fields), rejecting a corrupted backup at import time with a clear message instead of crashing some component later.

### 🟡 Dead ternary branch in Dashboard's pill styling
**FIXED.** Skipped sessions get their own `pill-skipped` color instead of collapsing to the same class as pending.

### 🟡 No uniqueness constraint on lift names
**FIXED.** `Onboarding.tsx` blocks advancing past the lifts step if two lifts share a name (case-insensitive), with a visible explanation.

### DRY violations
**All fixed:** `makeId()` extracted to `lib/id.ts` instead of duplicated verbatim; the three set-generator functions in `wendler.ts` share one `buildSetPrescriptions` helper; `db.ts`'s three singleton-row functions share one `getSingleton`/`saveSingleton` pair; `useAppData.ts`'s repeated sync-state-persist pattern and duplicated adopt-remote logic were resolved by extracting `useGitHubSync.ts`; both TM-override fields now share `parsePositiveWeight` instead of one being guarded and one not.

### ⚪ Smaller notes
- **`useAppData.ts` split**: done — `useGitHubSync.ts` owns the sync subsystem; `useAppData` owns local data and composes it.
- **Stale `'charts'` naming**: fixed — `App.tsx`'s `View` type now says `'progress'`.
- **Missing committed unit tests**: fixed — added a `vitest` suite (`src/lib/*.test.ts`) covering `wendler.ts`, `stats.ts`, `plateau.ts`, `plates.ts`, `sync-reconcile.ts`, `validation.ts`, and `github-sync.ts` (including the retry logic, using fake timers). Run with `npm run test:unit`.
- **CSS strings in the calculation layer**: fixed — `plates.ts` returns a semantic `PlateColor`; `PlateBar.tsx` owns the mapping to actual CSS values.

---

## Stage 2 — Logic audit summary

Every pure function in the calculation layer did what it claimed and was verified against hand-computed or real-spreadsheet values during the original build. The bugs in this audit weren't in the math; they were at the seams: what happens when a save fails, when data crosses a schema version, when a unit setting nobody tested with flows through, when a component unmounts mid-edit, when the same concept is guarded in one place and not its twin. All of those seams are closed now, and the calculation layer has committed regression tests instead of only throwaway dev-time verification.

**Also added, beyond the original audit scope:** incremental backoff retry for the GitHub sync API calls (`fetchWithRetry` in `github-sync.ts`) — retries transient failures only (network errors, 429, 5xx, with `Retry-After` support), fails fast on deterministic ones (401, 404, 409) since retrying those wastes time without helping. A 403 is now correctly split into "bad token" vs. "rate limited" based on GitHub's rate-limit headers, which previously would have been misreported as an auth failure either way.
