import { test, expect } from '@playwright/test';
import { completeOnboarding, logFullSession } from './helpers';

test.describe('bodyweight tracking', () => {
  test.beforeEach(async ({ page }) => {
    await completeOnboarding(page);
    await page.getByRole('button', { name: 'Progress' }).click();
  });

  test('shows "not logged yet" and no history toggle before anything is logged', async ({ page }) => {
    await expect(page.getByText('No weigh-ins logged yet.')).toBeVisible();
    await expect(page.getByTestId('bodyweight-history-toggle')).toHaveCount(0);
  });

  test('logging today\'s weight shows it as current and adds it to history', async ({ page }) => {
    await page.getByTestId('bodyweight-weight-input').fill('91.5');
    await page.getByTestId('bodyweight-log-btn').click();

    await expect(page.getByText('91.5kg')).toBeVisible();
    await page.getByTestId('bodyweight-history-toggle').click();
    await expect(page.getByText('Show history (1)').or(page.getByText('Hide history'))).toBeVisible();
  });

  test('logging the same date twice overwrites rather than duplicating', async ({ page }) => {
    await page.getByTestId('bodyweight-weight-input').fill('90');
    await page.getByTestId('bodyweight-log-btn').click();
    await page.getByTestId('bodyweight-weight-input').fill('90.4');
    await page.getByTestId('bodyweight-log-btn').click();

    await page.getByTestId('bodyweight-history-toggle').click();
    await expect(page.getByText('Show history (1)')).toHaveCount(0); // toggled to "Hide history" already
    const rows = page.locator('[data-testid^="bodyweight-entry-"]');
    await expect(rows).toHaveCount(1);
    await expect(page.getByText('Current:')).toContainText('90.4');
  });

  test('logging an older date does not override the current value shown from a more recent entry', async ({ page }) => {
    await page.getByTestId('bodyweight-weight-input').fill('92');
    await page.getByTestId('bodyweight-log-btn').click();

    await page.getByTestId('bodyweight-date-input').fill('2020-01-01');
    await page.getByTestId('bodyweight-weight-input').fill('100');
    await page.getByTestId('bodyweight-log-btn').click();

    await expect(page.locator('p', { hasText: 'Current:' })).toContainText('92');
  });

  test('deleting the only entry falls back to "not logged yet"', async ({ page }) => {
    await page.getByTestId('bodyweight-weight-input').fill('91');
    await page.getByTestId('bodyweight-log-btn').click();
    await page.getByTestId('bodyweight-history-toggle').click();

    const deleteBtn = page.locator('[data-testid^="bodyweight-delete-"]');
    await deleteBtn.click();

    await expect(page.getByText('No weigh-ins logged yet.')).toBeVisible();
  });

  test('Settings shows the same current value read-only and links back to Progress', async ({ page }) => {
    await page.getByTestId('bodyweight-weight-input').fill('93.2');
    await page.getByTestId('bodyweight-log-btn').click();

    await page.getByRole('button', { name: 'Settings' }).click();
    await expect(page.getByText('93.2kg')).toBeVisible();

    await page.getByTestId('settings-log-bodyweight-link').click();
    await expect(page.getByTestId('bodyweight-weight-input')).toBeVisible();
  });

  test('the strength/bodyweight ratio chart only appears once there is both an e1RM and a bodyweight to divide by', async ({ page }) => {
    // No bodyweight logged yet, no sessions logged yet either.
    await expect(page.getByText('Strength ÷ bodyweight')).toHaveCount(0);

    await page.getByTestId('bodyweight-weight-input').fill('100');
    await page.getByTestId('bodyweight-log-btn').click();

    await page.getByRole('button', { name: 'Train' }).click();
    await page.getByTestId('workout-card-Bench Press').click();
    await logFullSession(page, { amrapReps: 6 });

    await page.getByRole('button', { name: 'Progress' }).click();
    await expect(page.getByText('Strength ÷ bodyweight')).toBeVisible();
  });
});
