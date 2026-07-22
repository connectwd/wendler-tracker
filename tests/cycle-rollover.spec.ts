import { test, expect } from '@playwright/test';
import { completeOnboarding, logFullSession, DEFAULT_LIFT_NAMES } from './helpers';

// Default onboarding (100kg x5, all 4 lifts) gives TM ~101.26kg with a +3kg/cycle
// increment, so cycle 2's suggested TM should land at ~104.26kg (104.3 to 1dp).

test.describe('cycle rollover', () => {
  test('completing every session shows the complete banner, and confirming rolls TMs forward correctly', async ({ page }) => {
    await completeOnboarding(page);

    for (const week of [1, 2, 3, 4] as const) {
      await page.getByTestId(`week-tab-${week}`).click();
      for (const liftName of DEFAULT_LIFT_NAMES) {
        await page.getByTestId(`workout-card-${liftName}`).click();
        await logFullSession(page, week === 4 ? {} : { amrapReps: 6 });
      }
    }

    await expect(page.getByTestId('cycle-complete-banner')).toBeVisible();
    await expect(page.getByTestId('cycle-complete-banner')).not.toContainText('skipped');

    await page.getByTestId('start-next-cycle-btn').click();

    // No plateau warning yet - only one cycle of history exists, need 3.
    await expect(page.locator('[data-testid^="plateau-warning-"]')).toHaveCount(0);
    for (const liftName of DEFAULT_LIFT_NAMES) {
      await expect(page.locator('.card').filter({ hasText: liftName })).toContainText('AMRAP: 6 / 6 / 6');
    }

    await page.getByTestId('confirm-next-cycle-btn').click();

    await expect(page.getByText('Cycle 2', { exact: true })).toBeVisible();
    for (const liftName of DEFAULT_LIFT_NAMES) {
      await expect(page.getByTestId(`workout-card-${liftName}`)).toContainText('TM 104.3');
      // Cycle 2 is fresh - nothing logged yet, everything should be pending/open again.
      await expect(page.getByTestId(`workout-card-${liftName}`)).toHaveAttribute('data-status', 'pending');
    }
  });

  test('the "last cycle, same week" comparison shows cycle 1 data once cycle 2 starts', async ({ page }) => {
    await completeOnboarding(page);
    for (const week of [1, 2, 3, 4] as const) {
      await page.getByTestId(`week-tab-${week}`).click();
      for (const liftName of DEFAULT_LIFT_NAMES) {
        await page.getByTestId(`workout-card-${liftName}`).click();
        await logFullSession(page, week === 4 ? {} : { amrapReps: 6 });
      }
    }
    await page.getByTestId('start-next-cycle-btn').click();
    await page.getByTestId('confirm-next-cycle-btn').click();

    await page.getByTestId('week-tab-1').click();
    await page.getByTestId('workout-card-Bench Press').click();

    await expect(page.getByTestId('previous-cycle-comparison')).toBeVisible();
    await expect(page.getByTestId('previous-cycle-comparison')).toContainText('85kg × 6');
    await expect(page.getByTestId('previous-cycle-comparison')).toContainText('e1RM 99kg');
  });

  test('overriding a TM in the review screen before confirming applies that value, not the suggestion', async ({ page }) => {
    await completeOnboarding(page);
    for (const week of [1, 2, 3, 4] as const) {
      await page.getByTestId(`week-tab-${week}`).click();
      for (const liftName of DEFAULT_LIFT_NAMES) {
        await page.getByTestId(`workout-card-${liftName}`).click();
        await logFullSession(page, week === 4 ? {} : { amrapReps: 6 });
      }
    }
    await page.getByTestId('start-next-cycle-btn').click();

    await page.getByTestId('tm-override-Bench Press').fill('90');
    await page.getByTestId('confirm-next-cycle-btn').click();

    await expect(page.getByTestId('workout-card-Bench Press')).toContainText('TM 90.0');
    // The other three lifts should still get the normal suggested TM.
    await expect(page.getByTestId('workout-card-Squat')).toContainText('TM 104.3');
  });
});
