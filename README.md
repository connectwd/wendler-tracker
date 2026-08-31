# 5/3/1 Tracker

A personal tracker for Wendler's 5/3/1 program (Boring But Strong variation), built to replace a spreadsheet. React + TypeScript + Vite, deployed as a static site to GitHub Pages, data stored locally in your browser via IndexedDB.

See `AUDIT.md` for a full code-quality and logic audit of the codebase (everything in it has since been fixed - it's kept as a record, not a task list).

## What it does

- Runs the standard Wendler percentage scheme: Week 1 (65/75/85% x5/5/5+), Week 2 (70/80/90% x3/3/3+), Week 3 (75/85/95% x5/3/1+), Week 4 deload (40/50/60% x5/5/5) — plus a standard 40/50/60% warm-up ramp before every session.
- **Boring But Strong**: 10 sets of 5 at that week's First-Set-Last percentage (65/70/75/40% across the cycle) — not the flat 50% "Boring But Big" scheme.
- Tracks 4-week cycles. When every lift is logged (or marked skipped) across all 4 weeks, it shows you the next cycle's Training Maxes (last TM + your configured increment per lift) and lets you review/override before starting.
- **Plateau detection**: if a lift's estimated 1RM hasn't improved across the last 3 cycles, the cycle-review screen flags it with a one-tap option to reset that lift's TM down ~10% and rebuild, instead of blindly adding weight to a stall.
- **Skip/rest accounting**: a session can be marked skipped instead of completed (illness, travel, etc.) — it won't block the cycle from being marked done, and it's visually distinct from "logged" on the dashboard. A session saved with some sets logged but not finished shows **In Progress** rather than being indistinguishable from one you haven't opened yet.
- Shows what you did on the same lift/week last cycle right on the logging screen, so you've got a target without leaving the page.
- Estimates your 1RM from AMRAP set performance using the Brzycki formula, and charts it over time alongside your Training Max per lift.
- Shows a plate-loading breakdown (which plates per side) for your top set and BBS sets.
- **Installable PWA** with offline support — add to your homescreen, and it keeps working with no signal once you've loaded it once. Keeps the screen awake while a workout session is open. Checks for a new version periodically while open and prompts you with "Refresh to update" / "Ignore this to continue" rather than updating silently out from under you mid-workout.
- **Multi-device sync** via a private GitHub repo (optional, see below) — no manual sync step, it happens automatically after you save. A one-time-generated connection code lets you set up a second device by pasting one string instead of re-typing the token.
- **Training retrospective**: lifetime tonnage moved, a GitHub-style consistency heatmap (trailing 26 weeks, shaded by how much you moved that day, with skipped days marked distinctly), and an automatic PR list — any AMRAP set that beats your all-time best e1RM for that lift gets flagged live on the logging screen and added to the record.
- **Bodyweight tracking**: log a weigh-in any time from the Progress tab (one entry per calendar day — logging again on a date you've already logged overwrites it rather than adding a duplicate). Charts your bodyweight over time, and for each lift, a strength-to-bodyweight ratio chart (estimated 1RM ÷ your bodyweight as of that session) — the same thing the original spreadsheet's Statistics tab tracked by hand once per cycle, done automatically per session instead.
- **Manual rest timer**: a "Start rest" button under each section of a session (warm-up, main work, BBS, accessories) opens a full-screen countdown, pre-filled with a sensible default for that section (short for warm-up/BBS/accessories, long for main/AMRAP — both editable in Settings) and adjustable ±15s in the moment. It never blocks you — "Skip rest" is always right there — and plays a short chime plus a vibration when it hits zero. While it's running, there's a small original single-input game (tap, click, or spacebar to flap a plate through gaps between barbells) to make full rest time easier to actually sit through; your best score is remembered.
- **Accessory work**: Wendler's own assistance framework (Push / Pull / Single Leg-Core, 50-100 reps per category, flexible sets/reps) — pick up to 3 exercises from a 20-exercise catalog on your first session, and it's remembered for next time so you're not re-picking every session. Shows what you did last time you did that exercise, searched across your entire history, not just the current cycle.

## Storage — read this

There's no backend. Everything is saved in **IndexedDB in your browser**, which is more durable than plain `localStorage` but is still tied to this browser, on this device. It will **not** survive:

- Clearing browsing data / "clear site data"
- Switching browsers or devices
- Reinstalling the browser or OS

**Back up regularly.** Settings → Export backup downloads a `.json` snapshot of everything. The app nags you if it's been 14+ days since your last export. Settings → Restore from a backup file loads one back in (overwrites current data — it'll ask you to pick a file, no confirmation dialog beyond that, so don't restore an old backup by accident).

If you ever want to use this on a second device (e.g. phone at the gym + laptop at home), export from one and import on the other — there's no automatic sync unless you set up GitHub sync below.

## Multi-device sync (optional)

Settings → Multi-device sync lets you connect a private GitHub repo. Once set up, the app automatically pushes your data there a few seconds after you save a workout, update settings, or start a new cycle — no manual "sync" step. When you open the app on another device, it pulls the latest version first.

**Setup:**

1. Create a new **private** repo on GitHub just for this data (don't reuse the repo that hosts the app — that one's public).
2. Generate a fine-grained personal access token at github.com/settings/tokens?type=beta, scoped to only that repo, with **Contents: Read and write** permission and nothing else.
3. In Settings → Multi-device sync, enter your GitHub username, the repo name, and the token.

**Adding a second device:** once one device is connected, Settings → Multi-device sync shows a "Show connection code for another device" button — this generates a single copy-pasteable string encoding all four fields. On the second device, paste it into "Already set up on another device? Paste its connection code" and it fills in the same fields for you, instead of hand-typing the token again. **This code is base64-encoded for transport convenience, not encrypted** — anyone with the code has the token, so treat it exactly like the token itself (a password manager or a message to yourself, not a public channel). The app never transmits the code anywhere; getting it from one device to the other is entirely your choice of channel.

**How conflicts are handled:** if you log a workout on your phone and then open the laptop before it's had a chance to sync, the app just pulls in the phone's data automatically — no prompt, since nothing was lost. The only time you're asked to choose is if _both_ devices changed data before either synced (rare for a single-user, one-set-at-a-time app) — you'll see a side-by-side and pick which version to keep.

**Security note:** the token lives in this browser's IndexedDB, same as everything else — there's no backend to hold it more securely. That's why it's scoped to Contents-only on one throwaway data repo rather than your whole GitHub account.

## Arcade Mode

Settings → Appearance → Arcade Mode swaps the whole app's look — a bright, primary-colored, 80s-arcade-styled skin instead of the default dark/gritty one. Purely cosmetic, applies instantly (no save step), persists like any other setting, syncs across devices the same way.

**Status: Phase 1 of 3 (plumbing) is in.** The toggle works and every existing screen re-themes correctly — colors, fonts, radii, button/card chrome, plus a parallax-cloud and checkerboard-ground decoration on the Dashboard and active logging screen specifically (not everywhere — a deliberate choice, not every screen needs the decoration). What's _not_ in yet: the bespoke iconography (barbell glyphs, coin/star flourishes), the segmented rep-progress bar, and the PR celebration moment. See `arcade-mode-implementation-plan.md` for the full three-phase plan and `arcade-mode-concept-v2.html` for the approved design reference.

**How it's built:** `[data-theme='arcade']` on `<html>`, driven by `settings.theme`, overriding the same CSS custom properties (`--bg`, `--text`, `--plate-red`, `--font-display`, etc.) that every component already reads — no component-level theme branching needed for anything covered so far. **One deliberate exception**: `PlateBar.tsx` (the plate-loading diagram) uses a separate, fixed set of tokens (`--plate-color-red` etc., never overridden per theme) rather than the general `--plate-red`/etc. ones everything else uses — those represent real, physical competition-plate colors, and recoloring them for a "look" would make the diagram lie about which plates to actually load.

## Setup

```bash
npm install
bash scripts/fetch-fonts.sh   # one-time: pulls the self-hosted font files (see Notes below)
npm run dev                    # local dev server
npm run build                  # production build to dist/
```

Skipping the font-fetch step isn't fatal — the app falls back to system fonts, nothing breaks — but it's a one-time 30-second step worth doing before your first real look at it.

## Deploying to GitHub Pages

1. Push this to a new GitHub repo.
2. Open `vite.config.ts` and set `base` to match your repo name, e.g. if your repo is `github.com/yourname/wendler-tracker`, keep `base: '/wendler-tracker/'`. If you rename the repo, update this.
3. In the repo's Settings → Pages, set **Source** to "GitHub Actions".
4. Push to `main`. The included workflow (`.github/workflows/deploy.yml`) builds and deploys automatically. Check the Actions tab for progress; your site will be at `https://yourname.github.io/wendler-tracker/`.

## First run

The app walks you through Wendler's usual starting procedure: units, bar weight, rounding increment, your lifts (defaults to Bench/Squat/Deadlift/Press, editable), and for each lift either a recent honest rep-max or your true 1RM — it computes a suggested Training Max at 90%, which you can override if you'd rather start conservative.

If you made a mistake during onboarding, or the number you entered turns out to have been over-generous once you're a few sessions in, Settings → Training Max lets you correct it for any lift at any time — no need to wait for the cycle to end. Type a new number directly, or use "Work it out from a recent lift" to run the same weight/reps → estimated-1RM → 90% math onboarding used. Correcting it recalculates target weights on any workouts in your current cycle you haven't logged yet; anything already done at the gym is left exactly as it was, never rewritten after the fact.

## End-to-end tests

```bash
npx playwright install --with-deps chromium   # once, downloads a real browser
npm run test:e2e                              # headless run
npm run test:e2e:ui                            # interactive UI mode - good for debugging a failure
```

Covers onboarding (including the TM math itself, not just "did it get through the wizard"), logging a full session, a complete cycle-to-cycle rollover with the last-cycle comparison, plateau detection across three flat cycles, skip/rest accounting, settings persistence, backup export/import, GitHub sync (a mocked GitHub API, including a genuine two-device conflict scenario across two separate browser contexts), the GitHub sync connection code (encode/decode round-trip via the UI, bad-code error handling, copy-to-clipboard), basic PWA/offline behavior, the update-available toast (simulated via a synthetic `controllerchange` event rather than a real second deployed version - see the note in that spec file for why), mid-cycle Training Max corrections (recalculates pending workouts, leaves already-logged sets untouched, the rep-max calculator, and the confirm/cancel dialog), the top-level error boundary's fallback screen (triggered via a `CrashTestProbe` component that deliberately throws when the app is loaded with `?__crashtest=boundary` in the URL — it's a no-op for everyone else, see the comment in `CrashTestProbe.tsx`), bodyweight logging (upsert-by-date, the "don't override current with an older correction" rule, deletion, the Settings/Progress read-only link, and the ratio chart's appear/don't-appear condition), and the rest timer (per-section defaults, ±15s adjustment, skip-never-blocks, reaching zero, and that the mini-game overlay doesn't disturb in-progress session state underneath it).

`.github/workflows/test.yml` runs the same suite on every push and PR, independent of the deploy workflow, and uploads the HTML report as an artifact if anything fails.

**Caveat**: I wrote this suite without being able to actually run it — no browser or network access in the sandbox I built this in. I verified every assertion's expected values by hand against the real calculation functions (e.g. the exact plate breakdown for an 85kg lift over a 20kg bar, the exact TM after a plateau reset), and checked every test file compiles cleanly against Playwright's types, but there's a real chance a selector or timing assumption needs a small tweak the first time these actually run in a browser. Treat the first `npm run test:e2e` as a shakeout run, not a guarantee.

## Unit tests

```bash
npm run test:unit          # single run
npm run test:unit:watch    # watch mode
```

Covers the pure calculation layer directly (`src/lib/*.test.ts`): Wendler percentages, e1RM, Training Max math, cycle/workout generation, mid-cycle Training Max regeneration (updates pending sets, leaves completed ones untouched, preserves each week's rep scheme and AMRAP flag), plate-loading math for both kg and lb, plateau detection, the sync reconciliation decision logic, the GitHub sync API layer including the retry-with-backoff behavior (tested with fake timers, so the suite runs instantly rather than actually waiting through backoff delays), the service worker update-detection wiring in `pwa.ts` (dev-mode guard, genuine-update-vs-first-install gating, the polling interval and visibility re-check, all against hand-rolled EventTarget stubs since this vitest setup runs in plain Node with no DOM), the bodyweight history helpers (carry-forward lookup, the ratio calculation, chronological ordering independent of input order), rest-duration selection and countdown formatting, and the rest-timer game's full physics/collision/scoring simulation (gravity, flapping, ground/ceiling/obstacle collision, gap-passing, scoring exactly once per obstacle, obstacle spawn/despawn, and the large-dt clamp that stops a backgrounded tab from teleporting the player through a wall). This is the layer where correctness matters most and where a bug is easiest to catch in isolation — these tests run in milliseconds and don't need a browser.

**Known gap**: `connectionCode.ts`'s encode/decode round-trip (base64/JSON, unicode and special-character tokens, malformed-input errors) is currently only verified via the e2e suite and by hand during that PR — it doesn't have its own `connectionCode.test.ts` yet, unlike everything else in this list. Worth adding if you're touching that file again.

## Linting & formatting

```bash
npm run lint            # eslint .
npm run lint:fix        # eslint . --fix
npm run format          # prettier --write .
npm run format:check    # prettier --check . (what CI would run, if this repo gets a lint CI step)
```

ESLint (flat config, `eslint.config.js`) covers correctness: the core recommended rules, `typescript-eslint`'s recommended set, React's Rules of Hooks and exhaustive-deps (`react-hooks/*`), a Fast-Refresh boundary check (`react-refresh/*`), and `jsx-a11y`'s recommended accessibility rules on `src/**/*.tsx`. It's intentionally _not_ type-aware yet (`tseslint.configs.recommended`, not `recommendedTypeChecked`) — the type-checked variant catches meaningfully more (floating promises, unsafe `any` leakage) but needs its `parserOptions.project` wired correctly against both `tsconfig.json` and `tsconfig.node.json`, and this was set up somewhere with no way to `npm install` and confirm that wiring actually resolves clean. Worth upgrading to once the base config's been run for real.

Prettier handles formatting only, kept separate from ESLint rather than run as an ESLint rule through it — `eslint-config-prettier` just turns off the handful of ESLint stylistic rules that would otherwise fight it.

**Caveat, same shape as the E2E one above**: none of this has actually been run. Every rule ID and config-export shape here was checked by hand against each package's current docs (`eslint-plugin-jsx-a11y` in particular uses an unusual `flatConfigs.recommended` export, not the `configs.flat.recommended` most plugins use — verified directly against its README and type defs), but `eslint-plugin-react-hooks`'s own flat-config export shape has visibly changed across recent versions, which is exactly why its two rules are wired up by explicit rule id here instead of through a bundled "recommended" export. Run `npm install && npm run lint` before trusting any of it, and expect to spend a few minutes on whatever it flags the first time through a codebase that's never been linted.

## Error handling

Every local write (settings, lifts, workouts, cycle rollover) goes through one `withPersistence` wrapper in `useAppData.ts`. On failure, the UI never shows an optimistic change that didn't actually get saved — the write fails, an `ErrorBanner` appears at the top of the screen explaining what didn't save and why, and the in-memory state stays exactly as it was before the attempt. Multi-record writes (onboarding, starting a new cycle, restoring a backup) are wrapped in a single IndexedDB transaction each, so a failure partway through can't leave things half-written.

GitHub sync calls retry automatically on transient failures — a dropped connection, a 5xx from GitHub, or hitting the rate limit — with exponential backoff and jitter, respecting `Retry-After` when GitHub sends one. Deterministic failures (bad token, 404, a real sync conflict) fail immediately instead of wasting time retrying something retrying can't fix.

The above two paragraphs cover every failure the app anticipates. For the ones it doesn't — a render-time exception from a data shape nobody planned for, a bug in a date calculation, anything unexpected — a top-level `ErrorBoundary` in `main.tsx` wraps the whole app. Its fallback screen says plainly that the crash didn't touch your data (IndexedDB writes are independent of the render tree, so this is true even when the crash is data-related — the write already happened before anything tried to render it), gives you an immediate "export a backup now" button as a precaution, a "technical details" disclosure with the actual error and stack trace, and a reload button. There's no external error reporting — same no-analytics stance as the rest of the app — so the browser console is the only other place to look after the fact.

## Notes on a few decisions

- **Per-lift cycle increment** defaults to +3kg on every lift, editable per lift in Settings — matches how you'd been running it, but nothing forces a specific split (e.g. the classic +2.5kg upper / +5kg lower).
- **Training Max is never rounded** to the plate increment — only the working weights derived from it are. This matches how the numbers actually compound correctly cycle over cycle rather than drifting.
- **`db.ts` has a version-gated migration mechanism** (`migrations`, keyed by `DB_VERSION`) for changing the _shape_ of records already sitting in IndexedDB — separate from the store-creation loop, which only ever adds missing stores. It's empty right now, deliberately: nothing's needed one yet. It exists so the day a record's shape does change, there's already a place for the transform instead of writing the whole mechanism under pressure at that point. No dedicated test for the mechanism itself yet either, for the same reason — a real test needs a real migration to migrate against; write one alongside the first entry that actually goes in that map.
- **BBS sets are logged as a single completed-count**, not 10 individual weight/rep entries — same weight, same target reps, 10 times; granular per-set logging isn't worth the taps at the gym. There's an optional override field if you couldn't hit 5 on every set.
- **Sync fires on a 3-second debounce after any save**, not immediately and not on a manual button — so logging several sets in quick succession becomes one push, not five, but there's still no separate "sync" step to remember.
- **Plateau detection looks at week 3's AMRAP set** (the heaviest, most sensitive-to-real-strength indicator) across the last 3 cycles. It only flags a plateau if every step in that window is flat or a decline — one bad week doesn't trigger it, and it needs 3 full cycles of data before it says anything.
- **The service worker caches same-origin requests only** — the GitHub sync API calls bypass it and hit the real network, so you'll never get a stale sync response served from cache. Fonts (Oswald, Inter) are self-hosted under `src/assets/fonts/` rather than pulled from Google's CDN — same-origin, so they're cached like everything else and the app is fully offline from the first load, with no external network dependency at all. Run `scripts/fetch-fonts.sh` once after cloning to pull the actual font files down (not committed as binaries — see the script's comment for why).
- **The service worker never registers in dev** (`npm run dev`) — only in production builds. Vite's dev server serves unhashed module URLs, and the SW's cache-first strategy would cache them permanently by that exact URL, silently defeating both HMR and hard reloads. `npm run build` stamps a unique id into `sw.js` on every build (see `stampServiceWorkerBuildId` in `vite.config.ts`), which is what makes the browser notice a new deploy at all — service worker updates are detected by byte-diffing the script itself. Once open, the app re-checks for a new version every 15 minutes and whenever the tab is brought back to the foreground; when one's found, a toast offers "Refresh to update" or "Ignore this to continue" rather than silently yanking you mid-workout.
- **Tonnage counts every logged set** (warm-up + main + BBS), not just "working sets" in the purist sense — it's meant to be a satisfying "how much did I move" number, not a training-load metric. The heatmap's shading is relative to the busiest day in the visible 26-week window, not a fixed absolute scale, so it stays meaningful whether your sessions run light or heavy.
- **Accessory exercises aren't tied to which main lift you're doing that day** — Wendler's actual system prescribes the same Push/Pull/Single Leg-Core categories every training day regardless of the main lift, not lift-specific pairings. The catalog and rep guidance are sourced from Wendler's own writing on the topic, not invented pairings.
- **Workout status is `pending` / `in_progress` / `completed` / `skipped`**, not just the three visible on the dashboard as "Open/Done/Skipped" - `in_progress` (shown as "In Progress") only appears once you save with *something* logged (a warm-up box, a main set, or a BBS rep) but haven't finished every set. It's computed from the actual saved data, not from whether you changed anything in that particular visit, so reopening an in-progress session and saving again without touching anything still reads correctly. A save success also shows a brief, auto-dismissing confirmation toast.
- **Android's back gesture/button closes screens instead of the app.** The installed PWA has no browser chrome of its own, so a swipe or back-press normally has nothing to fall back to and exits entirely. An open workout session, the rest-timer overlay, and the new-cycle review screen each push a browser history entry when they open (`useBackable`, in `src/hooks/`) and a single shared `popstate` listener (`src/lib/backNav.ts`) closes whichever one is topmost — so back steps through the app's screens instead of leaving it. The in-app Back button goes through the same path as a swipe (via `goBack`), so both get the same "discard unsaved changes?" protection on a dirty workout session; Save/Skip/Confirm close through a separate `closeSilently` path that doesn't re-trigger that prompt.
- **Bodyweight history is a new field, not a schema version bump** — `AppData.bodyweightEntries` and the `Settings` fields the rest timer added are additive: absent on an older backup or an older synced file, they're defaulted to `[]`/sensible values rather than treated as invalid. `SCHEMA_VERSION` (used to reject backups from a meaningfully different app version) only changes when an _existing_ field's shape or meaning changes, not for a new optional one — see the comment on `SCHEMA_VERSION` in `types.ts`.
- **`settings.bodyweight` is a cache, not a second source of truth** — it always mirrors whichever `BodyweightEntry` is most recent, updated atomically alongside the history whenever an entry is logged or deleted (`db.saveBodyweightEntryWithSettings` / `deleteBodyweightEntryWithSettings`). The Settings screen shows it read-only with a link back to Progress, rather than exposing a second editable field that could drift from the real history.
- **Rest duration is a per-section default, not a hard rule** — `defaultRestSeconds()` just picks which of two Settings values (`restTimerShortSeconds`/`restTimerLongSeconds`) to pre-fill depending which section's button you tapped; nothing stops you from adjusting ±15s on the timer itself, and the timer never forces you to wait out the full duration.
- **The rest-timer game is an original "flap through the gap" game, not a Flappy Bird clone** — same single-input mechanic (the mechanic itself isn't anyone's IP), but its own name, art (drawn shapes reading the app's own theme colors, no bundled assets), and no relation to that game's branding.
- **The game's simulation (`restGame.ts`) is a pure, framework-free step function** — same "separate the math from the rendering" pattern as `wendler.ts`/`plates.ts`/`stats.ts`, and for the same reason: it's fully unit-testable without a browser, which matters a lot for a canvas game in a repo that can't run Playwright in this sandbox (see the End-to-end tests caveat above). `RestGame.tsx` is just a `requestAnimationFrame` loop calling it and drawing the result.
