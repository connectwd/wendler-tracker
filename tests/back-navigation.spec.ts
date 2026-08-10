import { test, expect } from '@playwright/test';
import { completeOnboarding, logFullSession, DEFAULT_LIFT_NAMES } from './helpers';

// These simulate Android's back gesture/button by calling page.goBack(), which
// fires the same popstate event a real swipe does in a standalone-display PWA.
// Before this fix, none of these screens pushed history when they opened, so
// there was nothing for a back gesture to pop - it fell straight through to
// leaving the page.

test.describe('back navigation', () => {
  test('swiping back from an open workout session returns to the dashboard, not out of the app', async ({ page }) => {
    await completeOnboarding(page);
    await page.getByTestId('workout-card-Bench Press').click();
    await expect(page.getByTestId('workout-back-btn')).toBeVisible();

    await page.goBack();

    await expect(page.getByTestId('workout-back-btn')).toHaveCount(0);
    await expect(page.getByTestId('workout-card-Bench Press')).toBeVisible();
  });

  test('the in-app Back button and a swipe both close a clean (non-dirty) session with no prompt', async ({ page }) => {
    await completeOnboarding(page);
    await page.getByTestId('workout-card-Bench Press').click();
    await page.getByTestId('workout-back-btn').click();
    await expect(page.getByTestId('workout-card-Bench Press')).toBeVisible();

    await page.getByTestId('workout-card-Bench Press').click();
    await page.goBack();
    await expect(page.getByTestId('workout-card-Bench Press')).toBeVisible();
  });

  test('swiping back out of a dirty session prompts to discard, and declining keeps the session open with your entries intact', async ({ page }) => {
    await completeOnboarding(page);
    await page.getByTestId('workout-card-Bench Press').click();
    await page.getByTestId('warmup-check-0').click();

    page.once('dialog', (dialog) => dialog.dismiss());
    await page.goBack();

    // Declined the prompt - still on the session, and the checked box is still checked.
    await expect(page.getByTestId('workout-back-btn')).toBeVisible();
    await expect(page.getByTestId('warmup-check-0')).toBeChecked();

    // The back stack should have recovered from the declined attempt - a
    // second swipe should prompt again rather than silently doing nothing.
    page.once('dialog', (dialog) => dialog.accept());
    await page.goBack();
    await expect(page.getByTestId('workout-card-Bench Press')).toBeVisible();
  });

  test('swiping back out of a dirty session and accepting discards it, same as the Back button', async ({ page }) => {
    await completeOnboarding(page);
    await page.getByTestId('workout-card-Bench Press').click();
    await page.getByTestId('warmup-check-0').click();

    page.once('dialog', (dialog) => dialog.accept());
    await page.goBack();

    await expect(page.getByTestId('workout-card-Bench Press')).toBeVisible();
    await expect(page.getByTestId('workout-card-Bench Press')).toHaveAttribute('data-status', 'pending');
  });

  test('saving a session and then swiping back from the dashboard falls through to leaving the page, not a dead swipe', async ({ page }) => {
    await completeOnboarding(page);
    await page.getByTestId('workout-card-Bench Press').click();
    await logFullSession(page, { amrapReps: 6 });
    await expect(page.getByTestId('workout-card-Bench Press')).toHaveAttribute('data-status', 'completed');

    // Save must have consumed its history entry (via closeSilently) rather
    // than leaving it orphaned - otherwise this swipe would silently do
    // nothing (staying on the dashboard) instead of actually navigating away.
    await page.goBack();
    await expect(page).not.toHaveURL(/wendler-tracker/);
  });

  test('rest timer nests on top of the workout session - one swipe closes just the timer, a second closes the session', async ({ page }) => {
    await completeOnboarding(page);
    await page.getByTestId('workout-card-Bench Press').click();
    await page.getByTestId('rest-trigger-warmup').click();
    await expect(page.getByTestId('rest-timer-overlay')).toBeVisible();

    await page.goBack();
    await expect(page.getByTestId('rest-timer-overlay')).toHaveCount(0);
    await expect(page.getByTestId('workout-back-btn')).toBeVisible();

    await page.goBack();
    await expect(page.getByTestId('workout-back-btn')).toHaveCount(0);
    await expect(page.getByTestId('workout-card-Bench Press')).toBeVisible();
  });

  test('swiping back out of the new-cycle review cancels it, same as the Back button', async ({ page }) => {
    await completeOnboarding(page);
    for (const week of [1, 2, 3, 4] as const) {
      await page.getByTestId(`week-tab-${week}`).click();
      for (const liftName of DEFAULT_LIFT_NAMES) {
        await page.getByTestId(`workout-card-${liftName}`).click();
        await logFullSession(page, week === 4 ? {} : { amrapReps: 6 });
      }
    }
    await page.getByTestId('start-next-cycle-btn').click();
    await expect(page.getByTestId('confirm-next-cycle-btn')).toBeVisible();

    await page.goBack();

    await expect(page.getByTestId('confirm-next-cycle-btn')).toHaveCount(0);
    await expect(page.getByTestId('start-next-cycle-btn')).toBeVisible();
  });

  test('confirming the new-cycle review rolls forward and a later swipe does not resurface it', async ({ page }) => {
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
    await expect(page.getByText('Cycle 2', { exact: true })).toBeVisible();

    await page.goBack();
    await expect(page.getByTestId('confirm-next-cycle-btn')).toHaveCount(0);
    await expect(page.getByText('Cycle 2', { exact: true })).toBeVisible();
  });
});
