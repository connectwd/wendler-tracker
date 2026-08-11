import { test, expect } from "@playwright/test";
import {
  completeOnboarding,
  attachGitHubMock,
  createFakeGitHubRemote,
  configureGitHubSync,
} from "./helpers";

test.describe("GitHub sync connection code", () => {
  test("before connecting, only the paste-code option is offered (not the generate/export option)", async ({
    page,
  }) => {
    const remote = createFakeGitHubRemote();
    await attachGitHubMock(page, remote);
    await completeOnboarding(page);

    await page.getByRole("button", { name: "Settings" }).click();

    await expect(page.getByTestId("sync-code-input")).toBeVisible();
    await expect(page.getByTestId("sync-code-apply-btn")).toBeVisible();
    await expect(page.getByTestId("sync-show-code-btn")).toHaveCount(0);
  });

  test("after connecting, only the generate/export option is offered (not the paste-code option)", async ({
    page,
  }) => {
    const remote = createFakeGitHubRemote();
    await attachGitHubMock(page, remote);
    await completeOnboarding(page);

    await page.getByRole("button", { name: "Settings" }).click();
    await configureGitHubSync(page, {
      owner: "jake",
      repo: "wendler-data",
      token: "fake-token",
    });
    await expect(page.getByTestId("sync-status-pill")).toHaveText(/Synced/, {
      timeout: 6000,
    });

    await expect(page.getByTestId("sync-code-input")).toHaveCount(0);
    await expect(page.getByTestId("sync-show-code-btn")).toBeVisible();
  });

  test("generating a code on device A and pasting it on device B fills in the same fields and connects", async ({
    browser,
  }) => {
    const remote = createFakeGitHubRemote();
    const contextA = await browser.newContext();
    const contextB = await browser.newContext();
    const pageA = await contextA.newPage();
    const pageB = await contextB.newPage();
    await attachGitHubMock(pageA, remote);
    await attachGitHubMock(pageB, remote);

    // Device A: onboard and connect manually - this is the "already set up" device.
    await completeOnboarding(pageA);
    await pageA.getByRole("button", { name: "Settings" }).click();
    await configureGitHubSync(pageA, {
      owner: "jake",
      repo: "wendler-data",
      token: "fake-token-xyz",
      path: "wendler-data.json",
    });
    await expect(pageA.getByTestId("sync-status-pill")).toHaveText(/Synced/, {
      timeout: 6000,
    });

    // Generate the connection code.
    await pageA.getByTestId("sync-show-code-btn").click();
    const code = await pageA.getByTestId("sync-code-output").inputValue();
    expect(code.length).toBeGreaterThan(0);

    // Sanity-check it decodes to what was entered - this is what device B will paste.
    const decoded = JSON.parse(Buffer.from(code, "base64").toString("utf-8"));
    expect(decoded).toEqual({
      owner: "jake",
      repo: "wendler-data",
      path: "wendler-data.json",
      token: "fake-token-xyz",
    });

    // Device B: fresh onboarding, no sync connected yet. Paste A's code instead of typing fields manually.
    await completeOnboarding(pageB);
    await pageB.getByRole("button", { name: "Settings" }).click();
    await pageB.getByTestId("sync-code-input").fill(code);
    await pageB.getByTestId("sync-code-apply-btn").click();

    // The manual fields should now be pre-filled from the pasted code.
    await expect(pageB.getByTestId("sync-owner-input")).toHaveValue("jake");
    await expect(pageB.getByTestId("sync-repo-input")).toHaveValue(
      "wendler-data",
    );
    await expect(pageB.getByTestId("sync-path-input")).toHaveValue(
      "wendler-data.json",
    );
    await expect(pageB.getByTestId("sync-token-input")).toHaveValue(
      "fake-token-xyz",
    );

    // Connecting from here uses the same flow as manual entry - no code changes needed on B's side.
    await pageB.getByTestId("sync-connect-btn").click();
    await expect(pageB.getByTestId("sync-status-pill")).toHaveText(/Synced/, {
      timeout: 6000,
    });
    // B had no local changes to lose, so it should silently adopt A's data rather than conflict.
    await expect(pageB.getByText("Two versions to choose from")).toHaveCount(0);

    await contextA.close();
    await contextB.close();
  });

  test("pasting a garbage code shows an inline error and leaves the manual fields untouched", async ({
    page,
  }) => {
    const remote = createFakeGitHubRemote();
    await attachGitHubMock(page, remote);
    await completeOnboarding(page);

    await page.getByRole("button", { name: "Settings" }).click();
    await page
      .getByTestId("sync-code-input")
      .fill("this-is-not-a-valid-connection-code!!!");
    await page.getByTestId("sync-code-apply-btn").click();

    await expect(page.getByTestId("sync-code-error")).toBeVisible();
    await expect(page.getByTestId("sync-owner-input")).toHaveValue("");
    await expect(page.getByTestId("sync-repo-input")).toHaveValue("");
    await expect(page.getByTestId("sync-token-input")).toHaveValue("");
  });

  test("pasting well-formed base64/JSON that is missing a required field also shows an inline error", async ({
    page,
  }) => {
    const remote = createFakeGitHubRemote();
    await attachGitHubMock(page, remote);
    await completeOnboarding(page);

    await page.getByRole("button", { name: "Settings" }).click();
    const incompleteCode = Buffer.from(
      JSON.stringify({ owner: "jake", repo: "wendler-data" }),
      "utf-8",
    ).toString("base64");
    await page.getByTestId("sync-code-input").fill(incompleteCode);
    await page.getByTestId("sync-code-apply-btn").click();

    await expect(page.getByTestId("sync-code-error")).toBeVisible();
    await expect(page.getByTestId("sync-owner-input")).toHaveValue("");
  });

  test("applying a valid code clears the paste field so a stale code isn't left sitting there", async ({
    page,
  }) => {
    const remote = createFakeGitHubRemote();
    await attachGitHubMock(page, remote);
    await completeOnboarding(page);

    await page.getByRole("button", { name: "Settings" }).click();
    const code = Buffer.from(
      JSON.stringify({
        owner: "jake",
        repo: "wendler-data",
        path: "wendler-data.json",
        token: "fake-token",
      }),
      "utf-8",
    ).toString("base64");
    await page.getByTestId("sync-code-input").fill(code);
    await page.getByTestId("sync-code-apply-btn").click();

    await expect(page.getByTestId("sync-owner-input")).toHaveValue("jake");
    await expect(page.getByTestId("sync-code-input")).toHaveValue("");
  });

  test("copy to clipboard button copies the exact connection code shown in the textarea", async ({
    page,
    context,
  }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    const remote = createFakeGitHubRemote();
    await attachGitHubMock(page, remote);
    await completeOnboarding(page);

    await page.getByRole("button", { name: "Settings" }).click();
    await configureGitHubSync(page, {
      owner: "jake",
      repo: "wendler-data",
      token: "fake-token-copy",
    });
    await expect(page.getByTestId("sync-status-pill")).toHaveText(/Synced/, {
      timeout: 6000,
    });

    await page.getByTestId("sync-show-code-btn").click();
    const code = await page.getByTestId("sync-code-output").inputValue();

    await page.getByTestId("sync-code-copy-btn").click();
    await expect(page.getByTestId("sync-code-copy-btn")).toHaveText(/Copied/);

    const clipboardText = await page.evaluate(() =>
      navigator.clipboard.readText(),
    );
    expect(clipboardText).toBe(code);
  });

  test("the connection-code warning about it not being encrypted is shown alongside the generated code", async ({
    page,
  }) => {
    const remote = createFakeGitHubRemote();
    await attachGitHubMock(page, remote);
    await completeOnboarding(page);

    await page.getByRole("button", { name: "Settings" }).click();
    await configureGitHubSync(page, {
      owner: "jake",
      repo: "wendler-data",
      token: "fake-token",
    });
    await expect(page.getByTestId("sync-status-pill")).toHaveText(/Synced/, {
      timeout: 6000,
    });

    await page.getByTestId("sync-show-code-btn").click();
    await expect(page.getByText(/encoded, not encrypted/i)).toBeVisible();
  });

  test("disabling sync hides a previously shown connection code", async ({
    page,
  }) => {
    const remote = createFakeGitHubRemote();
    await attachGitHubMock(page, remote);
    await completeOnboarding(page);

    await page.getByRole("button", { name: "Settings" }).click();
    await configureGitHubSync(page, {
      owner: "jake",
      repo: "wendler-data",
      token: "fake-token",
    });
    await expect(page.getByTestId("sync-status-pill")).toHaveText(/Synced/, {
      timeout: 6000,
    });

    await page.getByTestId("sync-show-code-btn").click();
    await expect(page.getByTestId("sync-code-output")).toBeVisible();

    await page.getByTestId("sync-disable-btn").click();
    await expect(page.getByTestId("sync-code-output")).toHaveCount(0);
    // Back to the disconnected state, so the paste-code option should be offered again.
    await expect(page.getByTestId("sync-code-input")).toBeVisible();
  });
});
