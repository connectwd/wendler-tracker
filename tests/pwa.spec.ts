import { test, expect } from '@playwright/test';

test.describe('PWA', () => {
  test('the manifest is linked and reachable', async ({ page }) => {
    await page.goto('./');
    const manifestHref = await page.locator('link[rel="manifest"]').getAttribute('href');
    expect(manifestHref).toBeTruthy();

    const manifestUrl = new URL(manifestHref!, page.url()).toString();
    const response = await page.request.get(manifestUrl);
    expect(response.ok()).toBeTruthy();
    const manifest = await response.json();
    expect(manifest.name).toBe('5/3/1 Tracker');
    expect(manifest.icons.length).toBeGreaterThanOrEqual(2);
  });

  test('a service worker registers and becomes active', async ({ page }) => {
    await page.goto('./');
    const active = await page.evaluate(async () => {
      try {
        await navigator.serviceWorker.ready;
        return true;
      } catch {
        return false;
      }
    });
    expect(active).toBe(true);
  });

  test('the app shell still loads after going offline, once it has been visited once', async ({ page, context }) => {
    // First load: registers + installs the service worker and caches the shell.
    await page.goto('./');
    await page.evaluate(() => navigator.serviceWorker.ready);

    // Reload once while still online so the (now-active) service worker is
    // definitely controlling this page, not just installed in the background.
    await page.reload();
    await page.evaluate(() => navigator.serviceWorker.ready);

    await context.setOffline(true);
    await page.reload();

    // Should render real app content (onboarding, since no data exists yet),
    // not a browser offline-error page.
    await expect(page.getByText("Let's set your starting point")).toBeVisible();

    await context.setOffline(false);
  });
});
