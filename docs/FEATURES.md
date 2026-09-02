# Features in depth

This is the detailed companion to the [top-level README](../README.md) — how each feature actually behaves, plus the reasoning behind a few non-obvious decisions. If you just want to know how to use the app day to day, start with the README instead; come back here when you want the "why" or the exact edge-case behavior.

## The 5/3/1 scheme

Runs the standard Wendler percentage scheme: Week 1 (65/75/85% ×5/5/5+), Week 2 (70/80/90% ×3/3/3+), Week 3 (75/85/95% ×5/3/1+), Week 4 deload (40/50/60% ×5/5/5) — plus a standard 40/50/60% warm-up ramp before every session.

## Boring But Strong

10 sets of 5 at that week's First-Set-Last percentage (65/70/75/40% across the cycle) — not the flat 50% "Boring But Big" scheme. BBS sets are logged as a single completed-count, not 10 individual weight/rep entries: same weight, same target reps, 10 times, and granular per-set logging isn't worth the taps at the gym. There's an optional override field if you couldn't hit 5 on every set.

## Cycle tracking & Training Max progression

Tracks 4-week cycles. When every lift is logged (or marked skipped) across all 4 weeks, it shows you the next cycle's Training Maxes (last TM + your configured increment per lift) and lets you review or override before starting.

Per-lift cycle increment defaults to +3kg on every lift, editable per lift in Settings — nothing forces a specific split (e.g. the classic +2.5kg upper / +5kg lower).

**Training Max is never rounded** to the plate increment — only the working weights derived from it are. This is what makes the numbers compound correctly cycle over cycle rather than drifting.

If you made a mistake during onboarding, or a Training Max turns out to have been over-generous a few sessions in, Settings → Training Max lets you correct it for any lift at any time — no need to wait for the cycle to end. Type a new number directly, or use "Work it out from a recent lift" to run the same weight/reps → estimated-1RM → 90% math onboarding used. Correcting it recalculates target weights on any workouts in your current cycle you haven't logged yet; anything already done at the gym is left exactly as it was, never rewritten after the fact.

## Plateau detection

If a lift's estimated 1RM hasn't improved across the last 3 cycles, the cycle-review screen flags it with a one-tap option to reset that lift's TM down ~10% and rebuild, instead of blindly adding weight to a stall.

Detection specifically looks at week 3's AMRAP set (the heaviest, most sensitive-to-real-strength indicator) across the last 3 cycles. It only flags a plateau if every step in that window is flat or a decline — one bad week doesn't trigger it, and it needs 3 full cycles of data before it says anything.

## Skip / rest / in-progress accounting

A session can be marked skipped instead of completed (illness, travel, etc.) — it won't block the cycle from being marked done, and it's visually distinct from "logged" on the dashboard.

Workout status is actually `pending` / `in_progress` / `completed` / `skipped`, not just the three visible as "Open/Done/Skipped" on the dashboard. `in_progress` (shown as "In Progress") appears once you save with *something* logged — a warm-up box, a main set, or a BBS rep — but haven't finished every set. It's computed from the actual saved data, not from whether you changed anything in that particular visit, so reopening an in-progress session and saving again without touching anything still reads correctly. A successful save also shows a brief, auto-dismissing confirmation toast.

## Last-cycle comparison

Shows what you did on the same lift/week last cycle right on the logging screen, so you've got a target without leaving the page.

## Estimated 1RM & progress charts

Estimates your 1RM from AMRAP set performance using the Brzycki formula, and charts it over time alongside your Training Max per lift.

## Plate-loading breakdown

Shows which plates go on each side of the bar for your top set and BBS sets.

## Installable PWA & offline support

Add to your homescreen and it keeps working with no signal once you've loaded it once. Keeps the screen awake while a workout session is open. Checks for a new version periodically while open and prompts you with "Refresh to update" / "Ignore this to continue" rather than updating silently out from under you mid-workout.

The service worker caches same-origin requests only — the GitHub sync API calls bypass it and hit the real network, so you'll never get a stale sync response served from cache. Fonts (Oswald, Inter) are self-hosted under `src/assets/fonts/` rather than pulled from Google's CDN, so they're cached like everything else and the app is fully offline from the first load with no external network dependency at all. Run `scripts/fetch-fonts.sh` once after cloning to pull the actual font files down (not committed as binaries).

The service worker never registers in dev (`npm run dev`) — only in production builds, since Vite's dev server serves unhashed module URLs and a cache-first strategy would defeat both HMR and hard reloads. `npm run build` stamps a unique id into `sw.js` on every build, which is what makes the browser notice a new deploy at all — updates are detected by byte-diffing the script itself. Once open, the app re-checks for a new version every 15 minutes and whenever the tab is brought back to the foreground.

## Multi-device sync

Settings → Multi-device sync lets you connect a private GitHub repo. Once set up, the app automatically pushes your data there a few seconds after you save a workout, update settings, or start a new cycle — no manual "sync" step. When you open the app on another device, it pulls the latest version first. Sync fires on a 3-second debounce after any save, so logging several sets in quick succession becomes one push, not five.

**Setup:**

1. Create a new **private** repo on GitHub just for this data (don't reuse the repo that hosts the app — that one's public).
2. Generate a fine-grained personal access token at github.com/settings/tokens?type=beta, scoped to only that repo, with **Contents: Read and write** permission and nothing else.
3. In Settings → Multi-device sync, enter your GitHub username, the repo name, and the token.

**Adding a second device:** once one device is connected, Settings → Multi-device sync shows a "Show connection code for another device" button — this generates a single copy-pasteable string encoding all four fields. On the second device, paste it into "Already set up on another device? Paste its connection code" and it fills in the same fields for you, instead of hand-typing the token again. **This code is base64-encoded for transport convenience, not encrypted** — anyone with the code has the token, so treat it exactly like the token itself (a password manager or a message to yourself, not a public channel). The app never transmits the code anywhere; getting it from one device to the other is entirely your choice of channel.

**How conflicts are handled:** if you log a workout on your phone and then open the laptop before it's had a chance to sync, the app just pulls in the phone's data automatically — no prompt, since nothing was lost. The only time you're asked to choose is if *both* devices changed data before either synced (rare for a single-user, one-set-at-a-time app) — you'll see a side-by-side and pick which version to keep.

**Security note:** the token lives in this browser's IndexedDB, same as everything else — there's no backend to hold it more securely. That's why it's scoped to Contents-only on one throwaway data repo rather than your whole GitHub account.

## Arcade Mode

Settings → Appearance → Arcade Mode swaps the whole app's look — a bright, primary-colored, 80s-arcade-styled skin instead of the default dark/gritty one. Purely cosmetic, applies instantly (no save step), persists like any other setting, syncs across devices the same way.

**Status: Phase 1 of 3 (plumbing) is in.** The toggle works and every existing screen re-themes correctly — colors, fonts, radii, button/card chrome, plus a parallax-cloud and checkerboard-ground decoration on the Dashboard and active logging screen specifically. What's *not* in yet: the bespoke iconography (barbell glyphs, coin/star flourishes), the segmented rep-progress bar, and the PR celebration moment. See `arcade-mode-implementation-plan.md` for the full three-phase plan and `arcade-mode-concept-v2.html` for the approved design reference.

**How it's built:** `[data-theme='arcade']` on `<html>`, driven by `settings.theme`, overriding the same CSS custom properties (`--bg`, `--text`, `--plate-red`, `--font-display`, etc.) that every component already reads — no component-level theme branching needed for anything covered so far. **One deliberate exception**: `PlateBar.tsx` (the plate-loading diagram) uses a separate, fixed set of tokens (`--plate-color-red` etc., never overridden per theme) rather than the general ones everything else uses — those represent real, physical competition-plate colors, and recoloring them for a "look" would make the diagram lie about which plates to actually load.

## Training retrospective

Lifetime tonnage moved, a GitHub-style consistency heatmap (trailing 26 weeks, shaded by how much you moved that day, with skipped days marked distinctly), and an automatic PR list — any AMRAP set that beats your all-time best e1RM for that lift gets flagged live on the logging screen and added to the record.

Tonnage counts every logged set (warm-up + main + BBS), not just "working sets" in the purist sense — it's meant to be a satisfying "how much did I move" number, not a training-load metric. The heatmap's shading is relative to the busiest day in the visible 26-week window, not a fixed absolute scale, so it stays meaningful whether your sessions run light or heavy.

## Bodyweight tracking

Log a weigh-in any time from the Progress tab — one entry per calendar day; logging again on a date you've already logged overwrites it rather than adding a duplicate. Charts your bodyweight over time, and for each lift, a strength-to-bodyweight ratio chart (estimated 1RM ÷ your bodyweight as of that session) — the same thing the original spreadsheet's Statistics tab tracked by hand once per cycle, done automatically per session instead.

`settings.bodyweight` is a cache, not a second source of truth — it always mirrors whichever entry is most recent, updated atomically alongside the history whenever an entry is logged or deleted. The Settings screen shows it read-only with a link back to Progress, rather than exposing a second editable field that could drift from the real history.

## Manual rest timer & Bar Hop mini-game

A "Start rest" button under each section of a session (warm-up, main work, BBS, accessories) opens a full-screen countdown, pre-filled with a sensible default for that section (short for warm-up/BBS/accessories, long for main/AMRAP — both editable in Settings) and adjustable ±15s in the moment. It never blocks you — "Skip rest" is always right there — and plays a short chime plus a vibration when it hits zero.

While it's running, there's a small original single-input game (tap, click, or spacebar to flap a plate through gaps between barbells) to make full rest time easier to actually sit through; your best score is remembered. It's an original game, not a clone of any existing one — same single-input mechanic, but its own name, art, and no relation to any other game's branding. Its simulation (`restGame.ts`) is a pure, framework-free step function, same "separate the math from the rendering" pattern as the rest of `src/lib/`, so it's fully unit-testable without a browser.

## Accessory work

Wendler's own assistance framework (Push / Pull / Single Leg-Core, 50-100 reps per category, flexible sets/reps) — pick up to 3 exercises from a 20-exercise catalog on your first session, and it's remembered for next time so you're not re-picking every session. Shows what you did last time you did that exercise, searched across your entire history, not just the current cycle.

Accessory exercises aren't tied to which main lift you're doing that day — Wendler's actual system prescribes the same Push/Pull/Single Leg-Core categories every training day regardless of the main lift, not lift-specific pairings. The catalog and rep guidance are sourced from Wendler's own writing on the topic, not invented pairings.

## Data safety & error handling

Every local write (settings, lifts, workouts, cycle rollover) goes through one `withPersistence` wrapper in `useAppData.ts`. On failure, the UI never shows an optimistic change that didn't actually get saved — the write fails, an `ErrorBanner` appears at the top of the screen explaining what didn't save and why, and the in-memory state stays exactly as it was before the attempt. Multi-record writes (onboarding, starting a new cycle, restoring a backup) are wrapped in a single IndexedDB transaction each, so a failure partway through can't leave things half-written.

GitHub sync calls retry automatically on transient failures — a dropped connection, a 5xx from GitHub, or hitting the rate limit — with exponential backoff and jitter, respecting `Retry-After` when GitHub sends one. Deterministic failures (bad token, 404, a real sync conflict) fail immediately instead of wasting time retrying something retrying can't fix.

For anything unanticipated — a render-time exception from a data shape nobody planned for, a bug in a date calculation — a top-level `ErrorBoundary` in `main.tsx` wraps the whole app. Its fallback screen says plainly that the crash didn't touch your data (IndexedDB writes are independent of the render tree, so this is true even when the crash is data-related), gives you an immediate "export a backup now" button as a precaution, a "technical details" disclosure with the actual error and stack trace, and a reload button. There's no external error reporting — same no-analytics stance as the rest of the app — so the browser console is the only other place to look after the fact.

## Android back gesture

The installed PWA has no browser chrome of its own, so a swipe or back-press normally has nothing to fall back to and exits the app entirely. An open workout session, the rest-timer overlay, and the new-cycle review screen each push a browser history entry when they open, and a single shared listener closes whichever one is topmost — so back steps through the app's screens instead of leaving it. The in-app Back button goes through the same path as a swipe, so both get the same "discard unsaved changes?" protection on a dirty workout session; Save/Skip/Confirm close through a separate path that doesn't re-trigger that prompt.

## Schema evolution

`db.ts` has a version-gated migration mechanism (`migrations`, keyed by `DB_VERSION`) for changing the *shape* of records already sitting in IndexedDB — separate from the store-creation loop, which only ever adds missing stores. It's empty right now, deliberately: nothing's needed one yet.

New, purely additive fields (like `bodyweightEntries`, or the rest-timer's Settings fields) don't bump `DB_VERSION` or `SCHEMA_VERSION` — absent on an older backup or an older synced file, they're defaulted to `[]`/sensible values rather than treated as invalid. `SCHEMA_VERSION` (used to reject backups from a meaningfully different app version) only changes when an *existing* field's shape or meaning changes, not for a new optional one.

## For contributors

### Test coverage

Unit tests (`npm run test:unit`, Vitest) cover the pure calculation layer directly (`src/lib/*.test.ts`): Wendler percentages, e1RM, Training Max math, cycle/workout generation, mid-cycle TM regeneration, plate-loading math for both kg and lb, plateau detection, sync reconciliation logic, the GitHub sync API layer including retry-with-backoff (tested with fake timers), service worker update-detection wiring, bodyweight history helpers, rest-duration selection, and the rest-timer game's full physics/collision/scoring simulation. This is the layer where correctness matters most and where a bug is easiest to catch in isolation.

E2E tests (`npm run test:e2e`, Playwright) cover onboarding (including the TM math itself), logging a full session, a complete cycle-to-cycle rollover, plateau detection across three flat cycles, skip/rest accounting, settings persistence, backup export/import, GitHub sync (including a genuine two-device conflict scenario across two separate browser contexts), the connection code round-trip, PWA/offline behavior, the update-available toast, mid-cycle TM corrections, the top-level error boundary's fallback screen, bodyweight logging, and the rest timer.

**Known gap**: `connectionCode.ts`'s encode/decode round-trip is currently only verified via the e2e suite, not its own unit test file.

### Linting & formatting

ESLint (flat config, `eslint.config.js`) covers the core recommended rules, `typescript-eslint`'s recommended set, React's Rules of Hooks and exhaustive-deps, a Fast-Refresh boundary check, and `jsx-a11y`'s recommended accessibility rules. It's intentionally not type-aware yet (`tseslint.configs.recommended`, not `recommendedTypeChecked`). Prettier handles formatting only, kept separate from ESLint via `eslint-config-prettier`.
