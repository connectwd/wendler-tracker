# Repo security checklist (public repo)

This is about protecting the **source code, deploy pipeline, and maintainer account** — not app data. App data (Training Maxes, workout logs, the sync token) lives entirely in each visitor's own browser via IndexedDB; there's no backend and no shared database, so nothing one visitor does can reach another visitor's data or yours. That was verified separately by walking the actual client code (no hardcoded credentials, no cross-origin calls beyond a user's own configured GitHub sync, service worker scoped same-origin only).

What *can* be attacked on a public repo is the stuff below: someone opening a malicious pull request, a fork's Actions run trying to reach a secret it shouldn't, or the repo settings just being looser than they need to be now that anyone can see and interact with it.

Items marked ✅ are already handled by this PR. Items marked ⬜ need a one-time click through **github.com → this repo → Settings**.

## Branch protection — Settings → Branches

- ⬜ Add a protection rule for `main`
- ⬜ Require a pull request before merging
- ⬜ Require status checks to pass before merging (the `test.yml` workflow)
- ⬜ Require conversation resolution before merging (optional, good practice)
- ⬜ Disallow force pushes
- ⬜ Disallow branch deletion
- ⬜ Leave "Do not allow bypassing the above settings" checked unless you have a specific reason to exempt yourself as admin

## GitHub Actions — Settings → Actions → General

- ⬜ **Fork pull request workflows**: set to "Require approval for all outside collaborators." This is what stops a stranger's PR from a fork running your Actions unattended — confirm it, don't assume the default is on.
- ⬜ **Workflow permissions**: set the repo-wide default `GITHUB_TOKEN` permission to **read-only**. `deploy.yml` already requests exactly what it needs in code (`contents: read`, `pages: write`, `id-token: write` — ✅ nothing to change there), this setting just makes sure that stays the ceiling, not the floor, for any workflow added later.
- ⬜ Don't add repository secrets unless a workflow genuinely needs one. Nothing currently in `.github/workflows/` uses one — the Pages deploy authenticates via GitHub's own OIDC token, not a stored credential. If you ever do add one, make sure it's only referenced from a `pull_request` workflow (never `pull_request_target` combined with checking out fork code), or a fork PR could exfiltrate it.

## Secret scanning & dependencies — Settings → Code security

- ⬜ Enable **Secret scanning** (free for public repos)
- ⬜ Enable **Push protection** (blocks a commit containing a recognizable secret before it lands, not just after)
- ⬜ Enable **Dependabot alerts**
- ⬜ Enable **Dependabot security updates**
- ✅ Dependabot version-update config added in this PR (`.github/dependabot.yml`) — weekly checks for npm and GitHub Actions dependencies, so outdated/vulnerable packages surface as PRs instead of silently sitting there
- ⬜ Consider **Code scanning** (CodeQL) — "Default" setup is one click for a JS/TS repo and needs no config file
- ⬜ Enable **Private vulnerability reporting** — gives someone who finds a real issue a private channel to tell you, instead of a public issue being the only option

## GitHub Pages — Settings → Pages

- ⬜ Confirm **Source** is "GitHub Actions", not "Deploy from a branch." This matters more on a public repo: it means Pages only ever serves what `deploy.yml` builds from `main`, never whatever happens to be on some other branch, including a branch from a PR.
- ⬜ If you ever attach a custom domain, enable **Enforce HTTPS**

## Collaborators & access — Settings → Collaborators

- ⬜ Confirm nobody has write/admin access you didn't intend
- ⬜ If you add collaborators later, give the least access level that lets them do the job (Triage/Write, not Admin, unless it's actually needed)

## Repo hygiene — handled in this PR

- ✅ `test-results/` and `playwright-report/` were tracked in git (local Playwright run artifacts). Removed from tracking, added to `.gitignore` — a public repo doesn't need other people's test runs accumulating in it.
- ✅ `.DS_Store` removed from tracking, added to `.gitignore`.

## One more thing, not a repo setting

- ⬜ Rotate the fine-grained PAT you use to push to this repo locally. It's already scoped tightly (only what it needs on only this repo), so the actual risk is low — but it's sitting in a plaintext note outside the app's own storage model, and rotating it now, before this gets more visitors and more habitual use, is cheap insurance.
