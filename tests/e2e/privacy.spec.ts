import { expect, test } from "@playwright/test";

// §15 Privacy: crawl every API route with seeded data and assert no response contains an
// email address or phone-number pattern. The one exception is the opt-in contact route,
// which must 404 for anyone who hasn't opted in.
const EMAIL = /[\w.+-]+@[\w-]+\.[\w.-]+/;
const PHONE = /\+?\(?\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}/;

test("no API response leaks contact data", async ({ page }) => {
  await page.goto("/signin");
  await page.getByRole("button", { name: "Continue with school login" }).click();
  const ids = await (await page.request.get("/api/auth/identities")).json();
  expect(JSON.stringify(ids)).not.toMatch(EMAIL);
  await page.getByRole("dialog").getByRole("listitem").first().getByRole("button").click();
  await page.waitForURL(/\/(home|profile)/);

  const list = await (await page.request.get("/api/explore/list")).json();
  const someone = list.profiles[0].id;
  const companies = await (await page.request.get("/api/explore/companies")).json();
  const goals = await (await page.request.get("/api/goals")).json();

  const routes = [
    "/api/me", "/api/auth/identities", "/api/explore/list", "/api/explore/list?industry=Fintech&page=2", "/api/explore/industries",
    "/api/explore/companies", `/api/explore/companies?company=${encodeURIComponent(companies.companies[0].employer)}`,
    "/api/explore/map?bbox=-180,-85,180,85&zoom=3", "/api/explore/map?bbox=-84.6,33.6,-84.2,33.95&zoom=13",
    `/api/profiles/${someone}`, "/api/goals", "/api/intros", "/api/vocab", "/api/cities", "/api/admin/dashboard", "/api/me/contact",
    ...goals.goals.slice(0, 3).map((g: { id: string }) => `/api/goals/${g.id}/matches`),
  ];
  for (const r of routes) {
    const res = await page.request.get(r);
    const body = await res.text();
    expect(body, r).not.toMatch(EMAIL);
    expect(body, r).not.toMatch(PHONE);
    expect(body, r).not.toMatch(/email_primary|emfl|login_email/);
    // Only the map returns coordinates, and only for aggregate clusters.
    if (!r.startsWith("/api/explore/map") && r !== "/api/cities") expect(body, r).not.toMatch(/"lat"|"lng"/);
  }

  // The only contact route: 404 unless that member opted in.
  const c = await page.request.get(`/api/profiles/${someone}/contact`);
  expect(c.status()).toBe(404);

  // Unauthenticated API access is refused.
  await page.context().clearCookies();
  for (const r of ["/api/explore/list", `/api/profiles/${someone}`, `/api/profiles/${someone}/contact`, "/api/intros"]) {
    expect((await page.request.get(r)).status(), r).toBe(401);
  }
});

test("FERPA-restricted and unapproved students never appear", async ({ page }) => {
  await page.goto("/signin");
  await page.getByRole("button", { name: "Continue with school login" }).click();
  await page.getByRole("dialog").getByRole("listitem").first().getByRole("button").click();
  await page.waitForURL(/\/(home|profile)/);
  const all: { firstName: string; lastName: string; roles: string[] }[] = [];
  for (let p = 1; p <= 30; p++) {
    const r = await (await page.request.get(`/api/explore/list?role=student&facets=0&page=${p}`)).json();
    all.push(...r.profiles);
    if (r.profiles.length < r.pageSize) break;
  }
  expect(all.length).toBeGreaterThan(0);
  expect(all.find((p) => p.firstName === "Arjun")).toBeUndefined(); // the seeded FERPA-restricted student
});
