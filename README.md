# 5/3/1 Tracker

A personal tracker for Wendler's 5/3/1 program (Boring But Strong variation) — built to replace a spreadsheet. React + TypeScript + Vite, deployed as a static site to GitHub Pages. There's no backend: all your data stays local to your own browser via IndexedDB, and nothing is shared between visitors.

**Live app:** https://connectwd.github.io/wendler-tracker/

Want the mechanics behind every feature (plateau detection, sync conflict handling, plate math, and more)? See **[docs/FEATURES.md](docs/FEATURES.md)**. Running your own public fork? See **[docs/REPO_SECURITY_CHECKLIST.md](docs/REPO_SECURITY_CHECKLIST.md)** first.

---

## Using the app

### First run

Onboarding walks you through units (kg/lb), bar weight, plate rounding, your lifts (defaults to Bench/Squat/Deadlift/Press — editable), and for each lift either a recent honest rep-max or your true 1RM. It computes a suggested Training Max at 90%, which you can override if you'd rather start conservative.

### Logging a session

Open today's lift from the Dashboard. You'll see your warm-up ramp, main work sets, and Boring But Strong sets, all pre-calculated from your Training Max, plus a plate-loading breakdown and what you did on this same lift/week last cycle. Log your AMRAP reps and save — a top-set PR is flagged automatically if you beat your all-time best.

### Finishing a cycle

Once every lift across all 4 weeks is logged or marked skipped, the app shows your next cycle's Training Maxes (last TM + your configured per-lift increment) to review before it starts. If a lift's estimated 1RM hasn't moved in 3 cycles, you'll see a one-tap option to reset that lift's TM down and rebuild instead of grinding into a wall.

### Backing up your data — read this

Everything lives in **IndexedDB in your browser only.** It will **not** survive clearing browsing data, switching browsers or devices, or reinstalling. **Back up regularly**: Settings → Export backup downloads a `.json` snapshot of everything (the app reminds you after 14 days). Settings → Restore loads one back in and overwrites current data, so don't restore an old file by accident.

### Using it on more than one device

Two options:

- **Manual** — export a backup on one device, restore it on the other.
- **Automatic** — Settings → Multi-device sync, connecting a private GitHub repo you control. Once set up on one device, use "Show connection code" to set up a second device by pasting a single string instead of re-entering the token. Full setup steps, how conflicts are resolved, and a security note on the token are in **[docs/FEATURES.md → Multi-device sync](docs/FEATURES.md#multi-device-sync)**.

---

## Features at a glance

- Standard Wendler percentage scheme (5/3/1), plus **Boring But Strong** accessory volume
- 4-week cycle tracking with automatic next-cycle Training Max calculation
- **Plateau detection** with a one-tap Training Max reset
- Skip/rest accounting, including an "In Progress" status for a session you started but didn't finish
- Last-cycle comparison shown right on the logging screen
- Estimated 1RM (Brzycki formula), charted over time
- Plate-loading breakdown for every working set
- Installable, offline-capable **PWA**, with an in-app "update available" prompt instead of silent updates
- **Multi-device sync** via your own private GitHub repo — no manual sync step
- **Training retrospective**: lifetime tonnage, a GitHub-style consistency heatmap, automatic PR tracking
- **Bodyweight tracking**, including a strength-to-bodyweight ratio chart per lift
- **Manual rest timer** with an original mini-game to help you sit through it
- **Accessory work** picker from Wendler's own Push/Pull/Single Leg-Core catalog
- **Arcade Mode**: an optional retro visual theme (in progress — phase 1 of 3 shipped)

See **[docs/FEATURES.md](docs/FEATURES.md)** for how each of these actually works.

---

## Running your own copy

```bash
npm install
bash scripts/fetch-fonts.sh   # one-time: pulls the self-hosted font files (safe to skip — falls back to system fonts)
npm run dev                    # local dev server
npm run build                  # production build to dist/
```

### Deploying to GitHub Pages

1. Push this to a new GitHub repo.
2. Open `vite.config.ts` and set `base` to match your repo name, e.g. `base: '/your-repo-name/'`.
3. In the repo's Settings → Pages, set **Source** to "GitHub Actions".
4. Push to `main`. `.github/workflows/deploy.yml` builds and deploys automatically; your site will be at `https://yourname.github.io/your-repo-name/`.

**If your repo will be public**, walk through **[docs/REPO_SECURITY_CHECKLIST.md](docs/REPO_SECURITY_CHECKLIST.md)** before pointing anyone at it — a short list of GitHub settings (branch protection, Actions permissions, secret scanning) worth checking so another visitor can't touch your code, your Pages deploy, or your CI. It doesn't affect app data — that's already isolated per-browser by design, see the doc for why.

### Testing & linting

```bash
npm run test:unit       # pure calculation layer (src/lib/*.test.ts) — Vitest
npm run test:e2e        # full app in a real browser — Playwright
npm run lint             # eslint .
npm run format:check     # prettier --check .
```

See `AUDIT.md` for a historical code-quality/logic audit (already resolved — kept as a record, not a task list).

---

## Storage — the short version

There's no backend. Everything is saved in **IndexedDB in your browser**, tied to this browser on this device. It will not survive clearing browsing data, switching browsers/devices, or reinstalling. See [Backing up your data](#backing-up-your-data--read-this) above, and [docs/FEATURES.md](docs/FEATURES.md#data-safety--error-handling) for exactly what happens if a save ever fails.
