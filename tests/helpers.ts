import type { Page } from '@playwright/test';

export const DEFAULT_LIFT_NAMES = ['Bench Press', 'Squat', 'Deadlift', 'Overhead Press'] as const;
export const ALL_WEEKS = [1, 2, 3, 4] as const;

// ---- Onboarding ----

export interface OnboardingLift {
  name: string;
  weight: number;
  reps: number;
  /** Overrides the default +3kg/cycle increment for this lift, if provided. */
  increment?: number;
}

export interface OnboardingOptions {
  units?: 'kg' | 'lb';
  barWeight?: number;
  roundingIncrement?: number;
  /** Weight/reps to enter for each of the 4 default lifts, in order. */
  lifts?: OnboardingLift[];
}

/** Runs the full onboarding wizard and waits for the dashboard to appear. */
export async function completeOnboarding(page: Page, options: OnboardingOptions = {}): Promise<void> {
  const units = options.units ?? 'kg';
  const lifts: OnboardingLift[] = options.lifts ?? DEFAULT_LIFT_NAMES.map((name) => ({ name, weight: 100, reps: 5 }));

  await page.goto('./');

  // Step 0: units / bar weight / rounding
  if (units === 'lb') {
    await page.getByRole('button', { name: 'lb', exact: true }).click();
  }
  if (options.barWeight !== undefined) {
    await page.getByLabel(`Bar weight (${units})`).fill(String(options.barWeight));
  }
  if (options.roundingIncrement !== undefined) {
    await page.getByLabel(`Round working weights to the nearest (${units})`).fill(String(options.roundingIncrement));
  }
  await page.getByRole('button', { name: 'Continue' }).click();

  // Step 1: lifts - apply any custom per-cycle increments (name IS visible as an
  // input value here, not text content, so we can't filter({hasText}) - go by index).
  for (let i = 0; i < lifts.length; i++) {
    const lift = lifts[i];
    if (lift.increment === undefined) continue;
    const card = page.locator('.card').nth(i);
    await card.getByLabel(`+ per cycle (${units})`).fill(String(lift.increment));
  }
  await page.getByRole('button', { name: 'Continue' }).click();

  // Step 2: current maxes
  for (const lift of lifts) {
    const card = page.locator('.card').filter({ hasText: lift.name });
    await card.getByLabel(`Weight (${units})`).fill(String(lift.weight));
    await card.getByLabel('Reps').fill(String(lift.reps));
  }
  await page.getByRole('button', { name: 'Continue' }).click();

  // Step 3: review -> confirm
  await page.getByRole('button', { name: 'Start Cycle 1' }).click();
  await page.getByText('Cycle 1', { exact: true }).first().waitFor();
}

// ---- Workout logging ----

export interface LogSessionOptions {
  /** Required to fully complete a week 1-3 session (week 4 has no AMRAP set). */
  amrapReps?: number;
  /** How many BBS sets to mark done. Defaults to all of them (full completion). */
  bbsCompletedCount?: number;
}

/** Fills in and saves the workout session screen that's currently open. */
export async function logFullSession(page: Page, options: LogSessionOptions = {}): Promise<void> {
  const warmupCount = await page.locator('[data-testid^="warmup-check-"]').count();
  for (let i = 0; i < warmupCount; i++) {
    await page.getByTestId(`warmup-check-${i}`).click();
  }

  const mainCheckCount = await page.locator('[data-testid^="main-check-"]').count();
  for (let i = 0; i < mainCheckCount; i++) {
    const btn = page.getByTestId(`main-check-${i}`);
    if (!(await btn.isDisabled())) {
      await btn.click();
    }
  }
  if (options.amrapReps !== undefined) {
    await page.getByTestId('amrap-reps-input').fill(String(options.amrapReps));
  }

  const amrapInputVisible = await page.getByTestId('amrap-reps-input').count();
  if (amrapInputVisible > 0 && options.amrapReps === undefined) {
    throw new Error('This session has an AMRAP set - pass amrapReps to logFullSession, or use skipSession().');
  }

  const bbsTarget = options.bbsCompletedCount ?? 10;
  for (let i = 0; i < bbsTarget; i++) {
    await page.getByTestId('bbs-increment').click();
  }

  await page.getByTestId('save-session-btn').click();
}

/** Marks the currently open session as skipped/rest instead of logging it. */
export async function skipSession(page: Page): Promise<void> {
  await page.getByTestId('skip-session-btn').click();
}

// ---- Accessory work ----

/** Picks the given exercise ids in the accessory picker and confirms - assumes the picker is currently showing. */
export async function selectAccessories(page: Page, exerciseIds: string[]): Promise<void> {
  for (const id of exerciseIds) {
    await page.getByTestId(`accessory-option-${id}`).click();
  }
  await page.getByTestId('accessory-confirm-btn').click();
}

/** Fills in one set's weight/reps for an already-selected accessory exercise. */
export async function logAccessorySet(
  page: Page,
  exerciseId: string,
  setIndex: number,
  weight: number,
  reps: number
): Promise<void> {
  await page.getByTestId(`accessory-weight-${exerciseId}-${setIndex}`).fill(String(weight));
  await page.getByTestId(`accessory-reps-${exerciseId}-${setIndex}`).fill(String(reps));
}

export interface TargetedLog {
  liftName: (typeof DEFAULT_LIFT_NAMES)[number] | string;
  week: 1 | 2 | 3 | 4;
  amrapReps?: number;
}

/**
 * Runs through every session in the currently active cycle. Anything listed in
 * `targeted` gets fully logged with the given AMRAP reps; everything else gets
 * skipped. Much faster than fully logging all 16 sessions when a test only
 * cares about one lift's numbers (e.g. the plateau tests).
 */
export async function fastForwardCycle(
  page: Page,
  targeted: TargetedLog[] = [],
  liftNames: readonly string[] = DEFAULT_LIFT_NAMES
): Promise<void> {
  for (const week of ALL_WEEKS) {
    await page.getByTestId(`week-tab-${week}`).click();
    for (const liftName of liftNames) {
      const card = page.getByTestId(`workout-card-${liftName}`);
      if ((await card.count()) === 0) continue;
      const status = await card.getAttribute('data-status');
      if (status !== 'pending') continue;

      await card.click();
      const match = targeted.find((t) => t.liftName === liftName && t.week === week);
      if (match) {
        await logFullSession(page, { amrapReps: match.amrapReps });
      } else {
        await skipSession(page);
      }
    }
  }
}

// ---- Fake GitHub API backend, for sync tests ----

export interface FakeGitHubRemote {
  sha: string | null;
  content: unknown;
  pushCount: number;
  /** Simulates a push from another device, so the next push from a tracked page should conflict. */
  simulateExternalPush: (newContent: unknown) => void;
}

export function createFakeGitHubRemote(initialContent: unknown = null): FakeGitHubRemote {
  const state: FakeGitHubRemote = {
    sha: initialContent ? 'initial-sha' : null,
    content: initialContent,
    pushCount: 0,
    simulateExternalPush(newContent: unknown) {
      state.sha = `external-sha-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      state.content = newContent;
    },
  };
  return state;
}

/** Points a page's requests to api.github.com at the given fake remote. Attach the same remote to multiple pages to simulate multiple devices sharing one backend. */
export async function attachGitHubMock(page: Page, remote: FakeGitHubRemote): Promise<void> {
  await page.route('https://api.github.com/repos/**', async (route) => {
    const req = route.request();
    const url = req.url();

    if (req.method() === 'GET' && !url.includes('/contents/')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ id: 1, name: 'wendler-data' }),
      });
      return;
    }

    if (req.method() === 'GET' && url.includes('/contents/')) {
      if (remote.content === null) {
        await route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ message: 'Not Found' }) });
      } else {
        const encoded = Buffer.from(JSON.stringify(remote.content), 'utf-8').toString('base64');
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ content: encoded, sha: remote.sha }),
        });
      }
      return;
    }

    if (req.method() === 'PUT' && url.includes('/contents/')) {
      const body = req.postDataJSON() as { content: string; sha?: string };
      if (remote.sha !== null && body.sha !== remote.sha) {
        await route.fulfill({ status: 409, contentType: 'application/json', body: JSON.stringify({ message: 'Conflict' }) });
        return;
      }
      const decoded = JSON.parse(Buffer.from(body.content, 'base64').toString('utf-8'));
      remote.content = decoded;
      remote.pushCount += 1;
      remote.sha = `sha-${remote.pushCount}`;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ content: { sha: remote.sha } }),
      });
      return;
    }

    await route.continue();
  });
}

/** Fills and submits the "connect" form in Settings -> Multi-device sync. Assumes the panel is already visible (navigate to Settings first). */
export async function configureGitHubSync(
  page: Page,
  config: { owner: string; repo: string; token: string; path?: string }
): Promise<void> {
  await page.getByTestId('sync-owner-input').fill(config.owner);
  await page.getByTestId('sync-repo-input').fill(config.repo);
  if (config.path) await page.getByTestId('sync-path-input').fill(config.path);
  await page.getByTestId('sync-token-input').fill(config.token);
  await page.getByTestId('sync-connect-btn').click();
}
