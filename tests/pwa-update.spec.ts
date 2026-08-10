import { test, expect } from '@playwright/test';

// These tests simulate an update via a synthetic `controllerchange` event dispatched
// directly on the real `navigator.serviceWorker` (a standard EventTarget), rather than
// deploying a second, genuinely different build mid-test and waiting for the browser to
// detect it. That's a deliberate choice: intercepting the browser's own internal
// service-worker-update-check network fetch via Playwright's page.route() is a known
// unreliable area, whereas dispatchEvent on a real EventTarget is fully standard and
// gives the same result for the app code under test - it doesn't know or care whether
// the controllerchange came from a real new SW claiming clients or a synthetic event.
test.describe('Update available toast', () => {
  test('does not appear on a fresh install (no prior controller to update from)', async ({ page }) => {
    await page.goto('./');
    await page.evaluate(() => navigator.serviceWorker.ready);

    // Simulate a controllerchange with no real update behind it - on a first-ever load,
    // the app should treat this as "just installed", not "just updated", and stay quiet.
    await page.evaluate(() => navigator.serviceWorker.dispatchEvent(new Event('controllerchange')));

    await expect(page.getByTestId('update-toast')).toHaveCount(0);
  });

  test('appears once a new service worker takes control of an already-controlled page, and Refresh reloads', async ({
    page,
  }) => {
    await page.goto('./');
    await page.evaluate(() => navigator.serviceWorker.ready);

    // First reload: the service worker installed on the previous load now actually
    // controls this page (matches the existing pattern in pwa.spec.ts).
    await page.reload();
    await page.evaluate(() => navigator.serviceWorker.ready);

    // Mark the running page instance so we can detect a real reload later.
    await page.evaluate(() => {
      (window as unknown as { __testMarker: boolean }).__testMarker = true;
    });

    // Simulate a genuine update: this page already has a controller, so a controllerchange
    // from here on is treated as "a new version just took over," which is exactly what
    // happens in production once a new deploy's service worker activates and claims clients.
    await page.evaluate(() => navigator.serviceWorker.dispatchEvent(new Event('controllerchange')));

    await expect(page.getByTestId('update-toast')).toBeVisible();
    await expect(page.getByText('A new version of the app is available.')).toBeVisible();

    await page.getByTestId('update-toast-refresh').click();

    // A real reload resets in-page JS state, so the marker set above should be gone.
    await page.waitForFunction(() => (window as unknown as { __testMarker?: boolean }).__testMarker === undefined);
    // The app should still come up fine post-reload (onboarding, since no data exists yet).
    await expect(page.getByText("Let's set your starting point")).toBeVisible();
  });

  test('Ignore dismisses the toast without reloading the page', async ({ page }) => {
    await page.goto('./');
    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.reload();
    await page.evaluate(() => navigator.serviceWorker.ready);

    await page.evaluate(() => {
      (window as unknown as { __testMarker: boolean }).__testMarker = true;
    });

    await page.evaluate(() => navigator.serviceWorker.dispatchEvent(new Event('controllerchange')));
    await expect(page.getByTestId('update-toast')).toBeVisible();

    await page.getByTestId('update-toast-dismiss').click();

    await expect(page.getByTestId('update-toast')).toHaveCount(0);
    // No reload happened - the marker should still be there.
    const markerStillSet = await page.evaluate(
      () => (window as unknown as { __testMarker?: boolean }).__testMarker === true
    );
    expect(markerStillSet).toBe(true);
  });
});
