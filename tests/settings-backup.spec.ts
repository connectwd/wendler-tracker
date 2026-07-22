import { test, expect } from '@playwright/test';
import { completeOnboarding } from './helpers';

test.describe('settings and backup', () => {
  test('changing units/rounding/bodyweight in Settings persists across a reload', async ({ page }) => {
    await completeOnboarding(page);
    await page.getByRole('button', { name: 'Settings' }).click();

    await page.getByLabel('Bar weight (kg)').fill('25');
    await page.getByLabel('Bar weight (kg)').blur();
    await page.getByLabel('Bodyweight (kg)').fill('92.5');
    await page.getByLabel('Bodyweight (kg)').blur();

    await page.reload();
    await page.getByRole('button', { name: 'Settings' }).click();
    await expect(page.getByLabel('Bar weight (kg)')).toHaveValue('25');
    await expect(page.getByLabel('Bodyweight (kg)')).toHaveValue('92.5');
  });

  test('exporting a backup downloads a dated JSON file', async ({ page }) => {
    await completeOnboarding(page);
    await page.getByRole('button', { name: 'Settings' }).click();

    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Export backup (.json)' }).click();
    const download = await downloadPromise;

    expect(download.suggestedFilename()).toMatch(/^wendler-tracker-backup-\d{4}-\d{2}-\d{2}\.json$/);
    const stream = await download.createReadStream();
    const chunks: Buffer[] = [];
    for await (const chunk of stream) chunks.push(chunk as Buffer);
    const parsed = JSON.parse(Buffer.concat(chunks).toString('utf-8'));
    expect(parsed.app).toBe('wendler-tracker');
    expect(parsed.data.cycles[0].cycleNumber).toBe(1);
  });

  test('importing a backup file fully replaces the current data', async ({ page }) => {
    await completeOnboarding(page); // creates throwaway Cycle 1 data we're about to overwrite

    const fakeBackup = {
      schemaVersion: 2,
      exportedAt: new Date().toISOString(),
      app: 'wendler-tracker',
      data: {
        settings: { units: 'kg', barWeight: 20, roundingIncrement: 2.5, bodyweight: null, onboardingComplete: true },
        lifts: [{ id: 'imported-lift-1', name: 'Imported Lift', dayOfWeek: 1, order: 1, cycleIncrement: 3 }],
        cycles: [
          {
            id: 'imported-cycle-7',
            cycleNumber: 7,
            startDate: '2026-01-01',
            trainingMaxes: { 'imported-lift-1': 123.4 },
            status: 'active',
            completedDate: null,
          },
        ],
        workouts: [],
      },
    };

    await page.getByRole('button', { name: 'Settings' }).click();
    await page.getByLabel('Restore from a backup file').setInputFiles({
      name: 'backup.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(fakeBackup)),
    });

    await expect(page.getByText('Backup restored.')).toBeVisible();

    await page.getByRole('button', { name: 'Train' }).click();
    await expect(page.getByText('Cycle 7', { exact: true })).toBeVisible();
    await expect(page.getByText('No active cycle yet.')).toHaveCount(0);
  });

  test('importing a file that is not a wendler-tracker backup is rejected with a clear message', async ({ page }) => {
    await completeOnboarding(page);
    await page.getByRole('button', { name: 'Settings' }).click();

    await page.getByLabel('Restore from a backup file').setInputFiles({
      name: 'not-a-backup.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify({ hello: 'world' })),
    });

    await expect(page.getByText("doesn't look like a wendler-tracker backup file")).toBeVisible();
    // Original data should be untouched.
    await page.getByRole('button', { name: 'Train' }).click();
    await expect(page.getByText('Cycle 1', { exact: true })).toBeVisible();
  });
});
