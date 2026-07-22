import { test, expect } from '@playwright/test';
import { completeOnboarding, logAccessorySet, selectAccessories, skipSession } from './helpers';

test.describe('accessory work', () => {
  test.beforeEach(async ({ page }) => {
    await completeOnboarding(page);
  });

  test('a fresh session shows the picker, capped at 3 selections', async ({ page }) => {
    await page.getByTestId('workout-card-Bench Press').click();

    await expect(page.getByTestId('accessory-selected-count')).toHaveText('0/3 selected');

    await page.getByTestId('accessory-option-dips').click();
    await page.getByTestId('accessory-option-chins-pullups').click();
    await page.getByTestId('accessory-option-lunges').click();
    await expect(page.getByTestId('accessory-selected-count')).toHaveText('3/3 selected');

    // A 4th option should be disabled once 3 are already picked.
    await expect(page.getByTestId('accessory-option-pushups')).toBeDisabled();

    // Deselecting one re-enables picking a different one.
    await page.getByTestId('accessory-option-dips').click();
    await expect(page.getByTestId('accessory-option-pushups')).not.toBeDisabled();
  });

  test('confirming the selection replaces the picker with input sections for those exercises', async ({ page }) => {
    await page.getByTestId('workout-card-Bench Press').click();
    await selectAccessories(page, ['dips', 'chins-pullups', 'lunges']);

    await expect(page.getByTestId('accessory-option-dips')).toHaveCount(0); // picker gone
    await expect(page.getByText('Dips')).toBeVisible();
    await expect(page.getByText('Chin-ups / Pull-ups')).toBeVisible();
    await expect(page.getByText('Lunges')).toBeVisible();
    // Three empty sets to start.
    await expect(page.getByTestId('accessory-weight-dips-0')).toBeVisible();
    await expect(page.getByTestId('accessory-weight-dips-2')).toBeVisible();
  });

  test('logging sets, saving, and reopening the session preserves the values', async ({ page }) => {
    await page.getByTestId('workout-card-Bench Press').click();
    await selectAccessories(page, ['dips']);
    await logAccessorySet(page, 'dips', 0, 15, 10);
    await logAccessorySet(page, 'dips', 1, 15, 8);
    await page.getByTestId('save-session-btn').click();

    await page.getByTestId('workout-card-Bench Press').click();
    await expect(page.getByTestId('accessory-weight-dips-0')).toHaveValue('15');
    await expect(page.getByTestId('accessory-reps-dips-0')).toHaveValue('10');
    await expect(page.getByTestId('accessory-weight-dips-1')).toHaveValue('15');
    await expect(page.getByTestId('accessory-reps-dips-1')).toHaveValue('8');
  });

  test('"Change exercises" returns to the picker with the current picks still checked', async ({ page }) => {
    await page.getByTestId('workout-card-Bench Press').click();
    await selectAccessories(page, ['dips']);
    await page.getByTestId('accessory-change-btn').click();

    await expect(page.getByTestId('accessory-option-dips')).toHaveClass(/checked/);
    await expect(page.getByTestId('accessory-selected-count')).toHaveText('1/3 selected');
  });

  test('a later session for the same lift remembers the previous pick instead of showing the picker again', async ({ page }) => {
    await page.getByTestId('workout-card-Bench Press').click();
    await selectAccessories(page, ['dips']);
    await logAccessorySet(page, 'dips', 0, 15, 10);
    await page.getByTestId('save-session-btn').click();

    await page.getByTestId('week-tab-2').click();
    await page.getByTestId('workout-card-Bench Press').click();

    // No picker this time - straight to logging, with the remembered exercise.
    await expect(page.getByTestId('accessory-option-dips')).toHaveCount(0);
    await expect(page.getByTestId('accessory-weight-dips-0')).toBeVisible();
  });

  test('history shows the last time this exercise was logged, even several cycles back', async ({ page }) => {
    // Cycle 1: log dips with a specific weight/reps.
    await page.getByTestId('workout-card-Bench Press').click();
    await selectAccessories(page, ['dips']);
    await logAccessorySet(page, 'dips', 0, 15, 10);
    await page.getByTestId('save-session-btn').click();

    // Skip everything else this cycle and roll forward through two more cycles
    // without touching accessories, to prove history isn't just "last week."
    for (const week of [1, 2, 3, 4] as const) {
      await page.getByTestId(`week-tab-${week}`).click();
      for (const liftName of ['Bench Press', 'Squat', 'Deadlift', 'Overhead Press']) {
        const card = page.getByTestId(`workout-card-${liftName}`);
        if ((await card.getAttribute('data-status')) === 'pending') {
          await card.click();
          await skipSession(page);
        }
      }
    }
    await page.getByTestId('start-next-cycle-btn').click();
    await page.getByTestId('confirm-next-cycle-btn').click();

    for (const week of [1, 2, 3, 4] as const) {
      await page.getByTestId(`week-tab-${week}`).click();
      for (const liftName of ['Bench Press', 'Squat', 'Deadlift', 'Overhead Press']) {
        const card = page.getByTestId(`workout-card-${liftName}`);
        if ((await card.getAttribute('data-status')) === 'pending') {
          await card.click();
          await skipSession(page);
        }
      }
    }
    await page.getByTestId('start-next-cycle-btn').click();
    await page.getByTestId('confirm-next-cycle-btn').click();

    // Cycle 3 now - open Bench Press and check the history line.
    await page.getByTestId('week-tab-1').click();
    await page.getByTestId('workout-card-Bench Press').click();

    await expect(page.getByTestId('accessory-history-dips')).toBeVisible();
    await expect(page.getByTestId('accessory-history-dips')).toContainText('15kg×10');
  });
});
