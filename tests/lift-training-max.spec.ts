import { test, expect } from "@playwright/test";
import { completeOnboarding } from "./helpers";

test.describe("editing a lift's Training Max after onboarding", () => {
  test("correcting a TM in Settings recalculates pending workouts in the current cycle", async ({
    page,
  }) => {
    await completeOnboarding(page); // default lifts, 100kg x 5 reps each -> TM ~101.26

    await page.getByRole("button", { name: "Settings" }).click();
    const tmInput = page.getByTestId("tm-input-Bench Press");
    await expect(tmInput).toHaveValue("101.26012601260126");

    page.once("dialog", (dialog) => dialog.accept());
    await tmInput.fill("150");
    await tmInput.blur();

    // The saved TM round-trips back into the input once the parent data updates.
    await expect(tmInput).toHaveValue("150");

    await page.getByRole("button", { name: "Train" }).click();
    await page.getByTestId("workout-card-Bench Press").click();

    // Week 1 main work at the corrected TM 150: 65/75/85% -> 97.5/112.5/127.5.
    await expect(page.getByTestId("main-target-weight-0")).toContainText(
      "97.5",
    );
    await expect(page.getByTestId("main-target-weight-1")).toContainText(
      "112.5",
    );
    await expect(page.getByTestId("main-target-weight-2")).toContainText(
      "127.5",
    );
  });

  test("dismissing the confirmation leaves the Training Max unchanged", async ({
    page,
  }) => {
    await completeOnboarding(page);
    await page.getByRole("button", { name: "Settings" }).click();
    const tmInput = page.getByTestId("tm-input-Squat");

    page.once("dialog", (dialog) => dialog.dismiss());
    await tmInput.fill("999");
    await tmInput.blur();

    // Reverted back to the real stored value, not left showing the rejected 999.
    await expect(tmInput).toHaveValue("101.26012601260126");

    await page.getByRole("button", { name: "Train" }).click();
    await page.getByTestId("workout-card-Squat").click();
    // Unaffected - still the original TM's week 1 weights, not a 999-based one.
    await expect(page.getByTestId("main-target-weight-0")).toContainText("65");
  });

  test('the "work it out from a recent lift" calculator suggests a TM the same way onboarding does', async ({
    page,
  }) => {
    await completeOnboarding(page);
    await page.getByRole("button", { name: "Settings" }).click();

    await page.getByTestId("tm-calc-open-Deadlift").click();
    await page.getByTestId("tm-calc-weight-Deadlift").fill("140");
    await page.getByTestId("tm-calc-reps-Deadlift").fill("3");
    await page.getByTestId("tm-calc-apply-Deadlift").click();

    // estimateOneRepMax(140, 3) via Brzycki -> ~148.24, x0.9 -> 133.4 (rounded to 1dp).
    const tmInput = page.getByTestId("tm-input-Deadlift");
    await expect(tmInput).toHaveValue("133.4");

    // The calculator only fills the field - it still requires the normal blur+confirm to save.
    page.once("dialog", (dialog) => dialog.accept());
    await tmInput.blur();

    await page.getByRole("button", { name: "Train" }).click();
    await page.getByTestId("workout-card-Deadlift").click();
    await expect(page.getByTestId("main-target-weight-0")).toContainText(
      "87.5",
    );
    await expect(page.getByTestId("main-target-weight-1")).toContainText("100");
    await expect(page.getByTestId("main-target-weight-2")).toContainText(
      "112.5",
    );
  });

  test('the calculator "Use this Training Max" button stays disabled until weight and reps are both filled', async ({
    page,
  }) => {
    await completeOnboarding(page);
    await page.getByRole("button", { name: "Settings" }).click();
    await page.getByTestId("tm-calc-open-Overhead Press").click();

    const applyBtn = page.getByTestId("tm-calc-apply-Overhead Press");
    await expect(applyBtn).toBeDisabled();

    await page.getByTestId("tm-calc-weight-Overhead Press").fill("60");
    await expect(applyBtn).toBeDisabled(); // reps still empty

    await page.getByTestId("tm-calc-reps-Overhead Press").fill("5");
    await expect(applyBtn).toBeEnabled();
  });

  test("correcting a TM never rewrites sets already logged at the gym, only the still-pending ones", async ({
    page,
  }) => {
    await completeOnboarding(page);

    // Log just the first main set of Bench Press week 1, then save without finishing
    // the session - this leaves the workout status 'pending' with one real, completed
    // set inside it (the exact scenario the fix must not clobber).
    await page.getByTestId("workout-card-Bench Press").click();
    await page.getByTestId("main-check-0").click();
    await page.getByTestId("save-session-btn").click();

    await page.getByRole("button", { name: "Settings" }).click();
    page.once("dialog", (dialog) => dialog.accept());
    const tmInput = page.getByTestId("tm-input-Bench Press");
    await tmInput.fill("150");
    await tmInput.blur();
    await expect(tmInput).toHaveValue("150");

    await page.getByRole("button", { name: "Train" }).click();
    await page.getByTestId("workout-card-Bench Press").click();

    // Set 0 was already logged at the old TM - untouched by the correction.
    await expect(page.getByTestId("main-target-weight-0")).toContainText("65");
    await expect(page.getByTestId("main-check-0")).toHaveClass(/checked/);
    // Sets 1 and 2 were still pending - they picked up the corrected TM.
    await expect(page.getByTestId("main-target-weight-1")).toContainText(
      "112.5",
    );
    await expect(page.getByTestId("main-target-weight-2")).toContainText(
      "127.5",
    );
  });
});
