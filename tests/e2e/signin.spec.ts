import { expect, test } from "@playwright/test";

test("school-email sign-in: rejects non-school email, creates a new GT member, signs the same person back in", async ({ page }) => {
  await page.goto("/signin");
  await expect(page.getByRole("heading", { name: /Find your\s+people/ })).toBeVisible();
  await expect(page.getByText(/Your email and phone are never shown/)).toBeVisible();

  await page.getByLabel("School email").fill("someone@gmail.com");
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(page.locator("#email-err")).toContainText("Use your school email");

  await page.getByLabel("School email").fill("casey.ng@gatech.edu");
  await page.getByRole("button", { name: "Continue", exact: true }).click();
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
  await page.waitForURL(/\/profile/);
  await expect(page.getByRole("heading", { name: "Build your profile" })).toBeVisible();
  await page.getByRole("button", { name: "Skip — fill it in myself" }).click();
  await expect(page.getByLabel("First name")).toHaveValue("Casey");

  // Terms and Privacy pages exist
  await page.goto("/privacy");
  await expect(page.getByRole("heading", { name: "Privacy Policy" })).toBeVisible();
});
