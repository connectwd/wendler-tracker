# 5/3/1 Tracker

A personal tracker for Wendler's 5/3/1 program (Boring But Strong variation), built to replace a spreadsheet. React + TypeScript + Vite, deployed as a static site to GitHub Pages, data stored locally in your browser via IndexedDB.

See `AUDIT.md` for a full code-quality and logic audit of the codebase (everything in it has since been fixed - it's kept as a record, not a task list).

## What it does

- Runs the standard Wendler percentage scheme: Week 1 (65/75/85% x5/5/5+), Week 2 (70/80/90% x3/3/3+), Week 3 (75/85/95% x5/3/1+), Week 4 deload (40/50/60% x5/5/5) — plus a standard 40/50/60% warm-up ramp before every session.
- **Boring But Strong**: 10 sets of 5 at that week's First-Set-Last percentage (65/70/75/40% across the cycle) — not the flat 50% "Boring But Big" scheme.
- Tracks 4-week cycles. When every lift is logged (or marked skipped) across all 4 weeks, it shows you the next cycle's Training Maxes (last TM + your configured increment per lift) and lets you review/override before starting.
- **Plateau detection**: if a lift's estimated 1RM hasn't improved across the last 3 cycles, the cycle-review screen flags it with a one-tap option to reset that lift's TM down ~10% and rebuild, instead of blindly adding weight to a stall.
- **Skip/rest accounting**: a session can be marked skipped instead of completed (illness, travel, etc.) — it won't block the cycle from being marked done, and it's visually distinct from "logged" on the dashboard.
- Shows what you did on the same lift/week last cycle right on the logging screen, so you've got a target without leaving the page.
- Estimates your 1RM from AMRAP set performance using the Brzycki formula, and charts it over time alongside your Training Max per lift.
- Shows a plate-loading breakdown (which plates per side) for your top set and BBS sets.
- **Installable PWA** with offline support — add to your homescreen, and it keeps working with no signal once you've loaded it once. Keeps the screen awake while a workout session is open.
- **Multi-device sync** via a private GitHub repo (optional, see below) — no manual sync step, it happens automatically after you save.
- **Training retrospective**: lifetime tonnage moved, a GitHub-style consistency heatmap (trailing 26 weeks, shaded by how much you moved that day, with skipped days marked distinctly), and an automatic PR list — any AMRAP set that beats your all-time best e1RM for that lift gets flagged live on the logging screen and added to the record.
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
3. In Settings → Multi-device sync, enter your GitHub username, the repo name, and the token. Repeat this on each device you use.

**How conflicts are handled:** if you log a workout on your phone and then open the laptop before it's had a chance to sync, the app just pulls in the phone's data automatically — no prompt, since nothing was lost. The only time you're asked to choose is if *both* devices changed data before either synced (rare for a single-user, one-set-at-a-time app) — you'll see a side-by-side and pick which version to keep.

**Security note:** the token lives in this browser's IndexedDB, same as everything else — there's no backend to hold it more securely. That's why it's scoped to Contents-only on one throwaway data repo rather than your whole GitHub account.

## Setup

```bash
npm install
npm run dev       # local dev server
npm run build     # production build to dist/
```

## Deploying to GitHub Pages

1. Push this to a new GitHub repo.
2. Open `vite.config.ts` and set `base` to match your repo name, e.g. if your repo is `github.com/yourname/wendler-tracker`, keep `base: '/wendler-tracker/'`. If you rename the repo, update this.
3. In the repo's Settings → Pages, set **Source** to "GitHub Actions".
4. Push to `main`. The included workflow (`.github/workflows/deploy.yml`) builds and deploys automatically. Check the Actions tab for progress; your site will be at `https://yourname.github.io/wendler-tracker/`.

## First run

The app walks you through Wendler's usual starting procedure: units, bar weight, rounding increment, your lifts (defaults to Bench/Squat/Deadlift/Press, editable), and for each lift either a recent honest rep-max or your true 1RM — it computes a suggested Training Max at 90%, which you can override if you'd rather start conservative.

## End-to-end tests

```bash
npx playwright install --with-deps chromium   # once, downloads a real browser
npm run test:e2e                              # headless run
npm run test:e2e:ui                            # interactive UI mode - good for debugging a failure
```

Covers onboarding (including the TM math itself, not just "did it get through the wizard"), logging a full session, a complete cycle-to-cycle rollover with the last-cycle comparison, plateau detection across three flat cycles, skip/rest accounting, settings persistence, backup export/import, GitHub sync (a mocked GitHub API, including a genuine two-device conflict scenario across two separate browser contexts), and basic PWA/offline behavior.

`.github/workflows/test.yml` runs the same suite on every push and PR, independent of the deploy workflow, and uploads the HTML report as an artifact if anything fails.

**Caveat**: I wrote this suite without being able to actually run it — no browser or network access in the sandbox I built this in. I verified every assertion's expected values by hand against the real calculation functions (e.g. the exact plate breakdown for an 85kg lift over a 20kg bar, the exact TM after a plateau reset), and checked every test file compiles cleanly against Playwright's types, but there's a real chance a selector or timing assumption needs a small tweak the first time these actually run in a browser. Treat the first `npm run test:e2e` as a shakeout run, not a guarantee.

## Unit tests

```bash
npm run test:unit          # single run
npm run test:unit:watch    # watch mode
```

Covers the pure calculation layer directly (`src/lib/*.test.ts`): Wendler percentages, e1RM, Training Max math, cycle/workout generation, plate-loading math for both kg and lb, plateau detection, the sync reconciliation decision logic, and the GitHub sync API layer including the retry-with-backoff behavior (tested with fake timers, so the suite runs instantly rather than actually waiting through backoff delays). This is the layer where correctness matters most and where a bug is easiest to catch in isolation — these tests run in milliseconds and don't need a browser.

## Error handling

Every local write (settings, lifts, workouts, cycle rollover) goes through one `withPersistence` wrapper in `useAppData.ts`. On failure, the UI never shows an optimistic change that didn't actually get saved — the write fails, an `ErrorBanner` appears at the top of the screen explaining what didn't save and why, and the in-memory state stays exactly as it was before the attempt. Multi-record writes (onboarding, starting a new cycle, restoring a backup) are wrapped in a single IndexedDB transaction each, so a failure partway through can't leave things half-written.

GitHub sync calls retry automatically on transient failures — a dropped connection, a 5xx from GitHub, or hitting the rate limit — with exponential backoff and jitter, respecting `Retry-After` when GitHub sends one. Deterministic failures (bad token, 404, a real sync conflict) fail immediately instead of wasting time retrying something retrying can't fix.

## Notes on a few decisions

- **Per-lift cycle increment** defaults to +3kg on every lift, editable per lift in Settings — matches how you'd been running it, but nothing forces a specific split (e.g. the classic +2.5kg upper / +5kg lower).
- **Training Max is never rounded** to the plate increment — only the working weights derived from it are. This matches how the numbers actually compound correctly cycle over cycle rather than drifting.
- **BBS sets are logged as a single completed-count**, not 10 individual weight/rep entries — same weight, same target reps, 10 times; granular per-set logging isn't worth the taps at the gym. There's an optional override field if you couldn't hit 5 on every set.
- **No accessory/assistance exercise tracking** (curls, flys, etc.) in this version — scoped out to keep the core loop fast. Straightforward to add a simple exercise list to `Workout` if you want it later.
- **Sync fires on a 3-second debounce after any save**, not immediately and not on a manual button — so logging several sets in quick succession becomes one push, not five, but there's still no separate "sync" step to remember.
- **Plateau detection looks at week 3's AMRAP set** (the heaviest, most sensitive-to-real-strength indicator) across the last 3 cycles. It only flags a plateau if every step in that window is flat or a decline — one bad week doesn't trigger it, and it needs 3 full cycles of data before it says anything.
- **The service worker caches same-origin requests only** — the GitHub sync API calls and the Google Fonts stylesheet both bypass it and hit the real network, so you'll never get a stale sync response served from cache.
- **Tonnage counts every logged set** (warm-up + main + BBS), not just "working sets" in the purist sense — it's meant to be a satisfying "how much did I move" number, not a training-load metric. The heatmap's shading is relative to the busiest day in the visible 26-week window, not a fixed absolute scale, so it stays meaningful whether your sessions run light or heavy.
- **Accessory exercises aren't tied to which main lift you're doing that day** — Wendler's actual system prescribes the same Push/Pull/Single Leg-Core categories every training day regardless of the main lift, not lift-specific pairings. The catalog and rep guidance are sourced from Wendler's own writing on the topic, not invented pairings.
