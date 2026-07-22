import { test, expect } from '@playwright/test';
import { completeOnboarding, logFullSession } from './helpers';

test.describe('training overview', () => {
  test('lifetime stats reflect a logged session with the correct tonnage', async ({ page }) => {
    await completeOnboarding(page);
    await page.getByTestId('workout-card-Bench Press').click();
    await logFullSession(page, { amrapReps: 6 });

    await page.getByRole('button', { name: 'Progress' }).click();

    const sessionsCard = page.locator('.card').filter({ hasText: 'sessions logged' });
    await expect(sessionsCard.locator('.big-num')).toHaveText('1');
    const tonnageCard = page.locator('.card').filter({ hasText: 'lifetime moved' });
    await expect(tonnageCard.locator('.big-num')).toHaveText('5,090kg');
  });

  test('a first-ever AMRAP set on a lift is flagged as a New PR', async ({ page }) => {
    await completeOnboarding(page);
    await page.getByTestId('workout-card-Bench Press').click();
    await page.getByTestId('amrap-reps-input').fill('6');

    await expect(page.getByTestId('new-pr-badge')).toBeVisible();
  });

  test('a second AMRAP set that does not beat the first is not flagged as a PR', async ({ page }) => {
    await completeOnboarding(page);

    // Week 1: log a strong AMRAP first, to set the bar.
    await page.getByTestId('workout-card-Bench Press').click();
    await logFullSession(page, { amrapReps: 10 }); // big e1RM

    // Week 2: a much lower-effort AMRAP shouldn't beat it.
    await page.getByTestId('week-tab-2').click();
    await page.getByTestId('workout-card-Bench Press').click();
    await page.getByTestId('amrap-reps-input').fill('1');

    await expect(page.getByTestId('new-pr-badge')).toHaveCount(0);
  });

  test('the consistency heatmap shows a shaded cell for a logged session', async ({ page }) => {
    await completeOnboarding(page);
    await page.getByTestId('workout-card-Bench Press').click();
    await logFullSession(page, { amrapReps: 6 });

    await page.getByRole('button', { name: 'Progress' }).click();
    const today = new Date().toISOString().slice(0, 10);
    await expect(page.locator(`.heatmap-cell[title^="${today}: "]`)).toHaveAttribute('data-bucket', '4');
  });
});
