import { test, expect } from '@playwright/test';
import { completeOnboarding } from './helpers';

test.describe('error boundary', () => {
  test('a render crash shows the fallback screen, not a blank page', async ({ page }) => {
    await completeOnboarding(page);

    await page.goto('./?__crashtest=boundary');

    await expect(page.getByTestId('error-boundary-screen')).toBeVisible();
    await expect(page.getByText('The app crashed, not your data')).toBeVisible();
  });

  test('data logged before the crash is untouched underneath it', async ({ page }) => {
    await completeOnboarding(page); // writes real Cycle 1 data to IndexedDB

    await page.goto('./?__crashtest=boundary');
    await expect(page.getByTestId('error-boundary-screen')).toBeVisible();

    // Navigating away from the crash trigger should land back on a perfectly
    // normal dashboard with the onboarding data still there - the crash never
    // touched IndexedDB, only the render tree.
    await page.goto('./');
    await expect(page.getByText('Cycle 1', { exact: true }).first()).toBeVisible();
  });

  test('exporting a backup from the crash screen still works', async ({ page }) => {
    await completeOnboarding(page);
    await page.goto('./?__crashtest=boundary');

    const downloadPromise = page.waitForEvent('download');
    await page.getByTestId('error-boundary-export-btn').click();
    const download = await downloadPromise;

    expect(download.suggestedFilename()).toMatch(/^wendler-tracker-backup-\d{4}-\d{2}-\d{2}\.json$/);
    const stream = await download.createReadStream();
    const chunks: Buffer[] = [];
    for await (const chunk of stream) chunks.push(chunk as Buffer);
    const parsed = JSON.parse(Buffer.concat(chunks).toString('utf-8'));
    expect(parsed.app).toBe('wendler-tracker');
    expect(parsed.data.cycles[0].cycleNumber).toBe(1);

    await expect(page.getByTestId('error-boundary-export-btn')).toHaveText('Exported ✓');
  });

  test('the reload button triggers an actual page reload', async ({ page }) => {
    await completeOnboarding(page);
    await page.goto('./?__crashtest=boundary');
    await expect(page.getByTestId('error-boundary-screen')).toBeVisible();

    const loadPromise = page.waitForEvent('load');
    await page.getByTestId('error-boundary-reload-btn').click();
    await loadPromise;

    // Same URL, same crash param, so it's expected to crash again right
    // away - this only confirms the button actually reloads the page rather
    // than silently doing nothing. Real recovery is covered above by
    // navigating to a URL without the trigger.
    await expect(page.getByTestId('error-boundary-screen')).toBeVisible();
  });

  test('technical details are available but collapsed by default', async ({ page }) => {
    await completeOnboarding(page);
    await page.goto('./?__crashtest=boundary');

    const details = page.getByTestId('error-boundary-details');
    await expect(details).toBeVisible();
    await expect(page.getByText('Deliberate test crash')).not.toBeVisible();

    await details.locator('summary').click();
    await expect(page.getByText('Deliberate test crash')).toBeVisible();
  });
});
