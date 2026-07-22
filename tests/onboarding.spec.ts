import { test, expect } from '@playwright/test';
import { DEFAULT_LIFT_NAMES } from './helpers';

test.describe('onboarding', () => {
  test('completing the wizard with default lifts lands on Cycle 1 dashboard', async ({ page }) => {
    await page.goto('./');
    await page.getByRole('button', { name: 'Continue' }).click(); // step 0 -> 1
    await page.getByRole('button', { name: 'Continue' }).click(); // step 1 -> 2
    for (const name of DEFAULT_LIFT_NAMES) {
      const card = page.locator('.card').filter({ hasText: name });
      await card.getByLabel('Weight (kg)').fill('100');
      await card.getByLabel('Reps').fill('5');
    }
    await page.getByRole('button', { name: 'Continue' }).click(); // step 2 -> 3
    await page.getByRole('button', { name: 'Start Cycle 1' }).click();

    await expect(page.getByText('Cycle 1', { exact: true })).toBeVisible();
    for (const name of DEFAULT_LIFT_NAMES) {
      await expect(page.getByTestId(`workout-card-${name}`)).toBeVisible();
    }
  });

  test('a direct 1RM entry (1 rep) computes TM as exactly 90% with no Brzycki adjustment', async ({ page }) => {
    await page.goto('./');
    await page.getByRole('button', { name: 'Continue' }).click(); // step 0 -> 1
    await page.getByRole('button', { name: 'Continue' }).click(); // step 1 -> 2

    const benchCard = page.locator('.card').filter({ hasText: 'Bench Press' });
    await benchCard.getByLabel('Weight (kg)').fill('185');
    await benchCard.getByLabel('Reps').fill('1');

    await expect(benchCard.getByText('Estimated 1RM: 185.0kg')).toBeVisible();
    await expect(benchCard.getByText('Suggested Training Max (90%): 166.5kg')).toBeVisible();

    // Fill the other three lifts so "Continue" is enabled, then check the review step.
    for (const name of ['Squat', 'Deadlift', 'Overhead Press']) {
      const card = page.locator('.card').filter({ hasText: name });
      await card.getByLabel('Weight (kg)').fill('100');
      await card.getByLabel('Reps').fill('5');
    }
    await page.getByRole('button', { name: 'Continue' }).click();
    // Leaving the override blank should apply exactly the suggested (unrounded) value.
    await expect(page.getByText('TM 166.5kg')).toBeVisible();
  });

  test('overriding the suggested Training Max applies the typed value instead', async ({ page }) => {
    await page.goto('./');
    await page.getByRole('button', { name: 'Continue' }).click();
    await page.getByRole('button', { name: 'Continue' }).click();

    const benchCard = page.locator('.card').filter({ hasText: 'Bench Press' });
    await benchCard.getByLabel('Weight (kg)').fill('185');
    await benchCard.getByLabel('Reps').fill('1');
    await benchCard.getByLabel('Training Max to use (kg)').fill('150');
    for (const name of ['Squat', 'Deadlift', 'Overhead Press']) {
      const card = page.locator('.card').filter({ hasText: name });
      await card.getByLabel('Weight (kg)').fill('100');
      await card.getByLabel('Reps').fill('5');
    }

    await page.getByRole('button', { name: 'Continue' }).click();
    await expect(page.getByText('TM 150.0kg')).toBeVisible();
  });

  test('a fifth custom lift can be added and carries through to the dashboard', async ({ page }) => {
    await page.goto('./');
    await page.getByRole('button', { name: 'Continue' }).click();

    await page.getByRole('button', { name: '+ Add another lift' }).click();
    const newCard = page.locator('.card').last();
    await newCard.getByLabel('Lift name').fill('Front Squat');
    await page.getByRole('button', { name: 'Continue' }).click();

    for (const name of [...DEFAULT_LIFT_NAMES, 'Front Squat']) {
      const card = page.locator('.card').filter({ hasText: name });
      await card.getByLabel('Weight (kg)').fill('100');
      await card.getByLabel('Reps').fill('5');
    }
    await page.getByRole('button', { name: 'Continue' }).click();
    await page.getByRole('button', { name: 'Start Cycle 1' }).click();

    await expect(page.getByTestId('workout-card-Front Squat')).toBeVisible();
  });

  test('a lift can be removed as long as at least one remains', async ({ page }) => {
    await page.goto('./');
    await page.getByRole('button', { name: 'Continue' }).click();

    // Step 1: the lift name only lives inside an <input> value here, not as visible
    // text, so filter({hasText}) won't find it - use position instead (Squat is 2nd default).
    const squatCard = page.locator('.card').nth(1);
    await expect(squatCard.getByLabel('Lift name')).toHaveValue('Squat');
    await squatCard.getByRole('button', { name: 'Remove lift' }).click();
    await page.getByRole('button', { name: 'Continue' }).click();

    for (const name of ['Bench Press', 'Deadlift', 'Overhead Press']) {
      const card = page.locator('.card').filter({ hasText: name });
      await card.getByLabel('Weight (kg)').fill('100');
      await card.getByLabel('Reps').fill('5');
    }
    await page.getByRole('button', { name: 'Continue' }).click();
    await page.getByRole('button', { name: 'Start Cycle 1' }).click();

    await expect(page.getByTestId('workout-card-Squat')).toHaveCount(0);
  });
});
