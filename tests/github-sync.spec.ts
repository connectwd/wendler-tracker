import { test, expect } from '@playwright/test';
import { completeOnboarding, attachGitHubMock, createFakeGitHubRemote, configureGitHubSync } from './helpers';

test.describe('GitHub sync', () => {
  test('connecting with valid credentials pushes the initial data and shows Synced', async ({ page }) => {
    const remote = createFakeGitHubRemote();
    await attachGitHubMock(page, remote);
    await completeOnboarding(page);

    await page.getByRole('button', { name: 'Settings' }).click();
    await configureGitHubSync(page, { owner: 'jake', repo: 'wendler-data', token: 'fake-token' });

    await expect(page.getByTestId('sync-status-pill')).toHaveText(/Synced/, { timeout: 6000 });
    expect(remote.pushCount).toBe(1);
    expect((remote.content as any).data.cycles[0].cycleNumber).toBe(1);
  });

  test('saving a workout after sync is enabled triggers an automatic push, no manual step', async ({ page }) => {
    const remote = createFakeGitHubRemote();
    await attachGitHubMock(page, remote);
    await completeOnboarding(page);

    await page.getByRole('button', { name: 'Settings' }).click();
    await configureGitHubSync(page, { owner: 'jake', repo: 'wendler-data', token: 'fake-token' });
    await expect(page.getByTestId('sync-status-pill')).toHaveText(/Synced/, { timeout: 6000 });
    expect(remote.pushCount).toBe(1);

    await page.getByRole('button', { name: 'Train' }).click();
    await page.getByTestId('workout-card-Bench Press').click();
    await page.getByTestId('skip-session-btn').click();

    // No manual sync button pressed - just wait for the debounce to fire on its own.
    await page.getByRole('button', { name: 'Settings' }).click();
    await expect(page.getByTestId('sync-status-pill')).toHaveText(/Synced/, { timeout: 6000 });
    expect(remote.pushCount).toBe(2);
  });

  test('a genuine two-device conflict surfaces the resolution screen, and "keep this device" wins cleanly', async ({ browser }) => {
    const remote = createFakeGitHubRemote();
    const contextA = await browser.newContext();
    const contextB = await browser.newContext();
    const pageA = await contextA.newPage();
    const pageB = await contextB.newPage();
    await attachGitHubMock(pageA, remote);
    await attachGitHubMock(pageB, remote);

    // Device A: onboard and connect - becomes the first version on the "remote".
    await completeOnboarding(pageA);
    await pageA.getByRole('button', { name: 'Settings' }).click();
    await configureGitHubSync(pageA, { owner: 'jake', repo: 'wendler-data', token: 'fake-token' });
    await expect(pageA.getByTestId('sync-status-pill')).toHaveText(/Synced/, { timeout: 6000 });
    expect(remote.pushCount).toBe(1);

    // Device B: separate throwaway onboarding, then connects to the same repo -
    // since B has no unsynced local changes yet, it should silently adopt A's data.
    await completeOnboarding(pageB);
    await pageB.getByRole('button', { name: 'Settings' }).click();
    await configureGitHubSync(pageB, { owner: 'jake', repo: 'wendler-data', token: 'fake-token' });
    await expect(pageB.getByTestId('sync-status-pill')).toHaveText(/Synced/, { timeout: 6000 });
    // No conflict screen for this step - B had nothing of its own to lose.
    await expect(pageB.getByText('Two versions to choose from')).toHaveCount(0);

    // Device A changes something and syncs.
    await pageA.getByRole('button', { name: 'Train' }).click();
    await pageA.getByTestId('workout-card-Bench Press').click();
    await pageA.getByTestId('skip-session-btn').click();
    await pageA.getByRole('button', { name: 'Settings' }).click();
    await expect(pageA.getByTestId('sync-status-pill')).toHaveText(/Synced/, { timeout: 6000 });
    expect(remote.pushCount).toBe(2);

    // Device B, unaware A already pushed, changes something different before it re-syncs.
    await pageB.getByRole('button', { name: 'Train' }).click();
    await pageB.getByTestId('workout-card-Squat').click();
    await pageB.getByTestId('skip-session-btn').click();

    // B's debounced push should now collide with A's newer version.
    await expect(pageB.getByText('Two versions to choose from')).toBeVisible({ timeout: 6000 });
    await expect(pageB.getByText('This device')).toBeVisible();

    await pageB.getByRole('button', { name: "Keep this device's data" }).click();
    await expect(pageB.getByText('Two versions to choose from')).toHaveCount(0);
    expect(remote.pushCount).toBe(3);

    await contextA.close();
    await contextB.close();
  });
});
