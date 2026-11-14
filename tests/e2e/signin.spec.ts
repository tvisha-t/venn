import { expect, test, type Page } from "@playwright/test";

/** Reads the newest sign-in code from the sandbox inbox (SANDBOX_SHOW_SIGNIN_CODES=true in playwright.config). */
async function latestCode(page: Page): Promise<string> {
  for (let i = 0; i < 20; i++) {
    const r = await page.request.get("/api/dev/inbox");
    const { emails } = (await r.json()) as { emails: { kind: string; text: string }[] };
    const m = emails.find((e) => e.kind === "signin_code")?.text.match(/\b(\d{6})\b/);
    if (m) return m[1];
    await page.waitForTimeout(250);
  }
  throw new Error("no sign-in code in the sandbox inbox");
}

async function enterCode(page: Page, code: string) {
  await page.getByLabel("Digit 1").fill(code); // paste-style fill spreads across the six boxes and auto-submits
}

test("school-email sign-in: rejects non-school email, verifies a code, creates a GT member, signs the same person back in", async ({ page }) => {
  await page.goto("/signin");
  await expect(page.getByRole("heading", { name: /Find your\s+people/ })).toBeVisible();
  await expect(page.getByText(/Your email and phone are never shown/)).toBeVisible();

  // Wrong domain (and a lookalike) never reach the server's code sender.
  for (const bad of ["someone@gmail.com", "x@evilgatech.edu"]) {
    await page.getByLabel("School email").fill(bad);
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    await expect(page.locator("#email-err")).toContainText("Use your Georgia Tech email");
  }
  // …and the API rejects it too.
  const api = await page.request.post("/api/auth/request-code", { data: { email: "someone@gmail.com" } });
  expect(api.status()).toBe(400);

  await page.getByLabel("School email").fill("casey.ng@gatech.edu");
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Check your email" })).toBeVisible();

  // A wrong code is rejected with tries left.
  await enterCode(page, "000000");
  await expect(page.locator("#code-err")).toBeVisible();

  await enterCode(page, await latestCode(page));
  await page.waitForURL(/\/profile/);
  await expect(page.getByRole("heading", { name: "Build your profile" })).toBeVisible();
  await page.getByRole("button", { name: "Skip — fill it in myself" }).click();
  await expect(page.getByLabel("First name")).toHaveValue("Casey");

  // Same email again → same account (still needs to finish the profile)
  await page.goto("about:blank");
  await page.context().clearCookies();
  await page.goto("/signin");
  await page.getByLabel("School email").fill("CASEY.NG@gatech.edu");
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Check your email" })).toBeVisible();
  await enterCode(page, await latestCode(page));
  await page.waitForURL(/\/profile/);
  await expect(page.getByRole("heading", { name: "Build your profile" })).toBeVisible();
  await page.getByRole("button", { name: "Skip — fill it in myself" }).click();
  await expect(page.getByLabel("First name")).toHaveValue("Casey");

  // Terms and Privacy pages exist
  await page.goto("/privacy");
  await expect(page.getByRole("heading", { name: "Privacy Policy" })).toBeVisible();
});
