import { test, expect } from '@playwright/test';
import { completeOnboarding, logFullSession } from './helpers';

test.describe('rest timer', () => {
  test.beforeEach(async ({ page }) => {
    await completeOnboarding(page);
    await page.getByTestId('workout-card-Bench Press').click();
  });

  test('warm-up and BBS/accessory sections default to the short duration, main defaults to the long one', async ({ page }) => {
    await expect(page.getByTestId('rest-trigger-warmup')).toContainText('90s');
    await expect(page.getByTestId('rest-trigger-main')).toContainText('180s');
    await expect(page.getByTestId('rest-trigger-bbs')).toContainText('90s');
    await expect(page.getByTestId('rest-trigger-accessory')).toContainText('90s');
  });

  test('starting a rest from the warm-up section opens the timer at the short default', async ({ page }) => {
    await page.getByTestId('rest-trigger-warmup').click();
    await expect(page.getByTestId('rest-timer-overlay')).toBeVisible();
    await expect(page.getByText('Warm-up rest')).toBeVisible();
    await expect(page.getByTestId('rest-timer-countdown')).toHaveText('1:30');
  });

  test('starting a rest from main work opens the timer at the long default', async ({ page }) => {
    await page.getByTestId('rest-trigger-main').click();
    await expect(page.getByTestId('rest-timer-countdown')).toHaveText('3:00');
  });

  test('+15s and -15s adjust the countdown', async ({ page }) => {
    await page.getByTestId('rest-trigger-warmup').click();
    await page.getByTestId('rest-timer-add-15').click();
    await expect(page.getByTestId('rest-timer-countdown')).toHaveText('1:45');
    await page.getByTestId('rest-timer-subtract-15').click();
    await page.getByTestId('rest-timer-subtract-15').click();
    await expect(page.getByTestId('rest-timer-countdown')).toHaveText('1:15');
  });

  test('skip rest closes the overlay and returns to the session with nothing lost', async ({ page }) => {
    await page.getByTestId('amrap-reps-input').fill('7');
    await page.getByTestId('rest-trigger-main').click();
    await expect(page.getByTestId('rest-timer-overlay')).toBeVisible();

    await page.getByTestId('rest-timer-close-btn').click();
    await expect(page.getByTestId('rest-timer-overlay')).toHaveCount(0);
    await expect(page.getByTestId('save-session-btn')).toBeVisible();
    await expect(page.getByTestId('amrap-reps-input')).toHaveValue('7');
  });

  test('the mini-game canvas and flap control are present and clickable while resting', async ({ page }) => {
    await page.getByTestId('rest-trigger-bbs').click();
    await expect(page.getByTestId('rest-game-canvas')).toBeVisible();
    await expect(page.getByTestId('rest-game-score')).toContainText('Score');

    // Should not throw or crash the overlay on repeated input.
    for (let i = 0; i < 5; i++) {
      await page.getByTestId('rest-game-flap-btn').click();
    }
    await expect(page.getByTestId('rest-timer-overlay')).toBeVisible();
  });

  test('reaching zero shows "Rest\'s over!" and the button changes to "Back to workout"', async ({ page }) => {
    // Drop the short default to the floor (5s, see clampRestSeconds) so this test doesn't wait 90s for real.
    // The bottom nav is hidden while a session is open, so back out of it first.
    await page.getByRole('button', { name: '← Back' }).click();
    await page.getByRole('button', { name: 'Settings' }).click();
    await page.getByTestId('settings-rest-short').fill('5');
    await page.getByTestId('settings-rest-short').blur();

    await page.getByRole('button', { name: 'Train' }).click();
    await page.getByTestId('workout-card-Bench Press').click();
    await page.getByTestId('rest-trigger-warmup').click();
    await expect(page.getByTestId('rest-timer-countdown')).toHaveText('0:05');

    await expect(page.getByText("Rest's over!")).toBeVisible({ timeout: 8000 });
    await expect(page.getByTestId('rest-timer-close-btn')).toHaveText('Back to workout');
  });

  test('a completed session still saves correctly after opening and closing a rest timer mid-session', async ({ page }) => {
    await page.getByTestId('rest-trigger-warmup').click();
    await page.getByTestId('rest-timer-close-btn').click();

    await logFullSession(page, { amrapReps: 6 });
    await expect(page.getByTestId('rest-timer-overlay')).toHaveCount(0);
  });
});
