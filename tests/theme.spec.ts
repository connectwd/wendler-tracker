import { test, expect } from '@playwright/test';
import { completeOnboarding } from './helpers';

test.describe('appearance / arcade mode', () => {
  test('toggling Arcade Mode re-themes the app immediately, no save step required', async ({ page }) => {
    await completeOnboarding(page);
    await page.getByRole('button', { name: 'Settings' }).click();

    await expect(page.locator('html')).toHaveAttribute('data-theme', 'serious');

    const toggle = page.getByTestId('theme-toggle');
    await expect(toggle).toHaveAttribute('aria-checked', 'false');
    await toggle.click();

    await expect(page.locator('html')).toHaveAttribute('data-theme', 'arcade');
    await expect(toggle).toHaveAttribute('aria-checked', 'true');
  });

  test('the choice persists across a reload and applies before any settings are touched', async ({ page }) => {
    await completeOnboarding(page);
    await page.getByRole('button', { name: 'Settings' }).click();
    await page.getByTestId('theme-toggle').click();

    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'arcade');
  });

  test('switching back to Serious Mode restores the original tokens', async ({ page }) => {
    await completeOnboarding(page);
    await page.getByRole('button', { name: 'Settings' }).click();
    const toggle = page.getByTestId('theme-toggle');

    await toggle.click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'arcade');
    await toggle.click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'serious');
    await expect(toggle).toHaveAttribute('aria-checked', 'false');
  });

  test('the plate-loading diagram keeps real plate colors regardless of theme', async ({ page }) => {
    // PlateBar.tsx deliberately uses --plate-color-* (fixed) rather than
    // --plate-red/etc. (re-themed). Checked against every rendered plate,
    // not just one, since which plates actually appear depends on the
    // onboarding weights and isn't worth hardcoding an assumption about.
    await completeOnboarding(page);
    await page.getByRole('button', { name: 'Settings' }).click();
    await page.getByTestId('theme-toggle').click();
    await page.getByRole('button', { name: 'Train' }).click();
    await page.getByTestId('workout-card-Bench Press').click();

    const plates = page.locator('.plate-bar .plate');
    const count = await plates.count();
    if (count === 0) return; // "Bar only" for this particular weight - nothing to check

    const fixedPlateColors = new Set([
      'rgb(200, 52, 46)',  // #c8342e red
      'rgb(44, 110, 158)', // #2c6e9e blue
      'rgb(209, 167, 44)', // #d1a72c yellow
      'rgb(76, 140, 74)',  // #4c8c4a green
      'rgb(216, 216, 208)', // #d8d8d0 white
      'rgb(58, 60, 68)',   // #3a3c44 black (hardcoded, not a token at all)
    ]);
    const arcadeAccentColors = new Set([
      'rgb(198, 40, 26)',  // #C6281A - would mean --plate-red leaked in instead of --plate-color-red
      'rgb(23, 70, 179)',  // #1746B3
      'rgb(255, 199, 44)', // #FFC72C
      'rgb(60, 176, 67)',  // #3CB043
    ]);

    for (let i = 0; i < count; i++) {
      const bg = await plates.nth(i).evaluate((el) => getComputedStyle(el).backgroundColor);
      expect(arcadeAccentColors.has(bg), `plate color ${bg} matches an arcade accent - token boundary leaked`).toBe(false);
      expect(fixedPlateColors.has(bg), `plate color ${bg} isn't one of the fixed literal plate colors`).toBe(true);
    }
  });
});
