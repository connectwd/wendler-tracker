import { test, expect } from '@playwright/test';
import { completeOnboarding } from './helpers';

// With the default onboarding input (100kg x5), TM works out to ~101.26kg (2.5kg rounding):
// Week 1 warm-up: 40/50/60kg x5/5/3. Main: 65/75/85kg x5/5/5+. BBS: 10x5 @ 65kg.

test.describe('workout logging', () => {
  test.beforeEach(async ({ page }) => {
    await completeOnboarding(page);
  });

  test('a fresh Bench Press week 1 session shows the correct warm-up, main, and BBS prescriptions', async ({ page }) => {
    await page.getByTestId('workout-card-Bench Press').click();

    await expect(page.getByText('Week 1')).toBeVisible();
    await expect(page.locator('.set-row').filter({ hasText: '40kg × 5' })).toBeVisible();
    await expect(page.locator('.set-row').filter({ hasText: '50kg × 5' })).toBeVisible();
    await expect(page.locator('.set-row').filter({ hasText: '60kg × 3' })).toBeVisible();
    await expect(page.locator('.set-row').filter({ hasText: '65kg × 5' })).toBeVisible();
    await expect(page.locator('.set-row').filter({ hasText: '75kg × 5' })).toBeVisible();
    await expect(page.locator('.set-row').filter({ hasText: '85kg × 5+' })).toBeVisible();
    await expect(page.getByText('Boring But Strong — 10 × 5 @ 65kg')).toBeVisible();
  });

  test('there is no "last cycle" comparison in cycle 1 (no history to compare against)', async ({ page }) => {
    await page.getByTestId('workout-card-Bench Press').click();
    await expect(page.getByTestId('previous-cycle-comparison')).toHaveCount(0);
  });

  test('entering AMRAP reps shows the live estimated 1RM and completes that set', async ({ page }) => {
    await page.getByTestId('workout-card-Bench Press').click();

    await page.getByTestId('amrap-reps-input').fill('6');
    await expect(page.getByTestId('live-e1rm')).toContainText('98.7kg');
    await expect(page.getByTestId('main-check-2')).toHaveClass(/checked/);
  });

  test('saving a fully logged session marks it Done on the dashboard', async ({ page }) => {
    await page.getByTestId('workout-card-Bench Press').click();

    for (let i = 0; i < 3; i++) await page.getByTestId(`warmup-check-${i}`).click();
    await page.getByTestId('main-check-0').click();
    await page.getByTestId('main-check-1').click();
    await page.getByTestId('amrap-reps-input').fill('6');
    for (let i = 0; i < 10; i++) await page.getByTestId('bbs-increment').click();
    await page.getByTestId('save-session-btn').click();

    const card = page.getByTestId('workout-card-Bench Press');
    await expect(card).toHaveAttribute('data-status', 'completed');
    await expect(card.getByText('Done')).toBeVisible();
  });

  test('saving without finishing every set leaves the session pending, not completed', async ({ page }) => {
    await page.getByTestId('workout-card-Bench Press').click();
    // Only do the warm-up, nothing else, then save.
    await page.getByTestId('warmup-check-0').click();
    await page.getByTestId('save-session-btn').click();

    const card = page.getByTestId('workout-card-Bench Press');
    await expect(card).toHaveAttribute('data-status', 'pending');
    await expect(card.getByText('Open')).toBeVisible();
  });

  test('skipping a session marks it Skipped and does not require any sets logged', async ({ page }) => {
    await page.getByTestId('workout-card-Bench Press').click();
    await page.getByTestId('skip-session-btn').click();

    const card = page.getByTestId('workout-card-Bench Press');
    await expect(card).toHaveAttribute('data-status', 'skipped');
    await expect(card.getByText('Skipped')).toBeVisible();
  });

  test('the plate breakdown for the 85kg top set shows the right plates per side over a 20kg bar', async ({ page }) => {
    await page.getByTestId('workout-card-Bench Press').click();
    // (85 - 20) / 2 = 32.5kg per side -> 25 + 5 + 2.5
    await expect(page.getByText('Per side: 25 + 5 + 2.5')).toBeVisible();
  });

  test('the BBS counter cannot go below 0 or above the total set count', async ({ page }) => {
    await page.getByTestId('workout-card-Bench Press').click();
    await page.getByTestId('bbs-decrement').click();
    await expect(page.getByTestId('bbs-count')).toHaveText('0/10');

    for (let i = 0; i < 12; i++) await page.getByTestId('bbs-increment').click();
    await expect(page.getByTestId('bbs-count')).toHaveText('10/10');
  });
});
