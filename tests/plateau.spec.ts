import { test, expect } from '@playwright/test';
import { completeOnboarding, fastForwardCycle } from './helpers';

// Bench Press's cycle increment is set to 0 so its TM never changes, and every
// cycle we log the exact same AMRAP reps on its week-3 set - so its estimated
// 1RM is bit-for-bit identical every cycle, guaranteeing a plateau flag as soon
// as 3 cycles of history exist. Every other lift is skipped throughout, so it
// never accumulates enough data to be flagged either way - a useful check that
// the flag is genuinely per-lift.

test('three flat cycles trigger the plateau warning with a working reset option', async ({ page }) => {
  await completeOnboarding(page, {
    lifts: [
      { name: 'Bench Press', weight: 100, reps: 5, increment: 0 },
      { name: 'Squat', weight: 100, reps: 5 },
      { name: 'Deadlift', weight: 100, reps: 5 },
      { name: 'Overhead Press', weight: 100, reps: 5 },
    ],
  });

  // Cycles 1 and 2: only 1-2 data points exist yet - below the 3-cycle threshold.
  for (const cycleNum of [1, 2]) {
    await fastForwardCycle(page, [{ liftName: 'Bench Press', week: 3, amrapReps: 3 }]);
    await page.getByTestId('start-next-cycle-btn').click();
    await expect(page.getByTestId('plateau-warning-Bench Press')).toHaveCount(0);
    await page.getByTestId('confirm-next-cycle-btn').click();
    await expect(page.getByText(`Cycle ${cycleNum + 1}`, { exact: true })).toBeVisible();
  }

  // Cycle 3: now there are 3 cycles of perfectly flat data - the warning should fire.
  await fastForwardCycle(page, [{ liftName: 'Bench Press', week: 3, amrapReps: 3 }]);
  await page.getByTestId('start-next-cycle-btn').click();

  const warning = page.getByTestId('plateau-warning-Bench Press');
  await expect(warning).toBeVisible();
  await expect(warning).toContainText("hasn't improved in 3 cycles");
  await expect(page.getByTestId('plateau-warning-Squat')).toHaveCount(0);
  await expect(page.getByTestId('plateau-warning-Deadlift')).toHaveCount(0);
  await expect(page.getByTestId('plateau-warning-Overhead Press')).toHaveCount(0);

  // Applying the reset should fill the override with TM * 0.9, and it should actually apply.
  await page.getByTestId('plateau-reset-btn-Bench Press').click();
  await expect(page.getByTestId('tm-override-Bench Press')).toHaveValue('91.1');

  await page.getByTestId('confirm-next-cycle-btn').click();
  await expect(page.getByTestId('workout-card-Bench Press')).toContainText('TM 91.1');
});
