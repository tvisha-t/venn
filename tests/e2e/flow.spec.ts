import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";

// The §15 E2E scenarios, in order, sharing one seeded database.
test.describe.configure({ mode: "serial" });

async function signInAs(page: Page, name: string | RegExp) {
  await page.goto("about:blank");
  await page.context().clearCookies();
  await page.goto("/signin");
  await page.getByRole("button", { name: "Continue with school login" }).click();
  await page.getByRole("dialog").getByRole("listitem").getByRole("button", { name }).click();
  await page.waitForURL(/\/(home|profile)/);
}

const GOAL = "GT alumni at Delta who could give advice on ops tech";

/** Select result row i in a split view and return the name shown in the detail pane. */
async function pickRow(page: Page, i: number, list = "Matches") {
  await page.getByRole("list", { name: list }).getByRole("listitem").nth(i).getByRole("button").first().click();
  const h = page.locator("article[aria-label] h2").first();
  await expect(h).toBeVisible();
  return (await h.innerText()).trim();
}

/** First row (from index `from`) whose detail pane offers "Request intro". */
async function pickRequestable(page: Page, from = 0, list = "Matches") {
  for (let i = from; i < from + 12; i++) {
    const name = await pickRow(page, i, list);
    await page.waitForTimeout(150);
    const btn = page.locator("article[aria-label]").getByRole("button", { name: "Request intro" });
    if (await btn.isVisible()) return name;
  }
  throw new Error("no requestable row");
}

test("1. student signs in, builds a profile from a resume, approves", async ({ page }) => {
  await signInAs(page, /Jordan Lee/);
  await expect(page).toHaveURL(/\/profile/);
  await expect(page.getByRole("heading", { name: "Build your profile" })).toBeVisible();
  await page.getByLabel("…or paste the text").fill(
    `Jordan Lee — jordan.lee@student.example.gatech.test — (404) 555-0199\nGeorgia Institute of Technology, B.S. Computer Science, expected May 2028\nCREATE-X Startup Launch participant. VIP team member. Interested in airline operations and logistics software.`,
  );
  await page.getByRole("button", { name: "Extract my profile" }).click();
  await expect(page.getByLabel("Major")).toHaveValue("Computer Science");
  await expect(page.getByLabel("Class year")).toHaveValue("2028");
  await page.getByLabel("City").fill("Atlanta");
  await page.getByLabel("State").fill("GA");
  await page.getByRole("button", { name: "Approve & publish" }).click();
  await expect(page).toHaveURL(/\/home/);
});

test("2. goal → streamed steps → ranked results with reasons", async ({ page }) => {
  await signInAs(page, /Jordan Lee/);
  await expect(page).toHaveURL(/\/home/);
  await page.getByLabel("Your goal").fill(GOAL);
  await page.getByRole("button", { name: "Find people" }).click();
  // Steps stream over SSE in order (the one-line status bar shows them only briefly).
  const sse = await (await page.request.post("/api/goals", { data: { text: GOAL } })).text();
  const steps = [...sse.matchAll(/"id":"(parse|search|rank|ready)","label":"([^"]+)","status":"done"/g)].map((m) => m[1]);
  expect(steps).toEqual(["parse", "search", "rank", "ready"]);
  expect(sse).toMatch(/Searching [\d,]+ Yellow Jackets/);
  expect(sse).toContain("event: result");
  await expect(page.getByRole("heading", { name: /\d+ members? match/ })).toBeVisible();
  await expect(page.getByText(/Understood your goal/)).toBeVisible();
  const first = page.getByRole("list", { name: "Matches" }).getByRole("listitem").first();
  await expect(first).toContainText("Delta Air Lines");
  await expect(first).toContainText("You both:"); // overlap row
  expect(await page.content()).not.toMatch(/[\w.+-]+@example\.com/);
});

test("3. Map and Companies views; Explore filter by CREATE-X", async ({ page }) => {
  await signInAs(page, /Jordan Lee/);
  await page.getByLabel("Your goal").fill(GOAL);
  await page.getByRole("button", { name: "Find people" }).click();
  await expect(page.getByRole("heading", { name: /\d+ members? match/ })).toBeVisible();
  await page.getByRole("radio", { name: "Map" }).click();
  await expect(page.getByText(/groups smaller than 3 people are hidden|same groups as a list/)).toBeVisible();
  await page.getByRole("radio", { name: "Companies" }).click();
  await expect(page.getByRole("listbox", { name: "Companies" }).getByRole("option", { name: /Delta Air Lines\s*\d+ Yellow Jacket/ })).toBeVisible();

  await page.goto("/explore?program=CREATE-X");
  await expect(page.getByRole("button", { name: /Program: CREATE-X/ })).toBeVisible();
  await page.getByRole("radio", { name: "Companies" }).click();
  await expect(page).toHaveURL(/program=CREATE-X/);
  await expect(page).toHaveURL(/view=companies/);
  await expect(page.getByRole("listbox", { name: "Companies" }).getByRole("option").filter({ hasText: /Yellow Jacket/ }).first()).toBeVisible();
});

test("4–5. request intro → Shorter → Send; recipient replies in sandbox → Replied", async ({ page }) => {
  await signInAs(page, /Jordan Lee/);
  await page.getByLabel("Your goal").fill(GOAL);
  await page.getByRole("button", { name: "Find people" }).click();
  await expect(page.getByRole("heading", { name: /\d+ members? match/ })).toBeVisible();
  const name = await pickRequestable(page);
  await page.locator("article[aria-label]").getByRole("button", { name: "Request intro" }).click();
  const body = page.getByLabel("Message");
  await expect(body).not.toBeEmpty();
  const before = (await body.inputValue()).length;
  await page.getByRole("button", { name: "Shorter" }).click();
  await expect.poll(async () => (await body.inputValue()).length).toBeLessThan(before);
  await page.getByRole("button", { name: "Send request" }).click();
  await expect(page.getByText(/Request sent to/)).toBeVisible();

  await page.goto("/dev/inbox");
  await page.getByRole("button", { name: new RegExp(`To: ${name}`) }).first().click();
  await page.getByRole("button", { name: "Send reply" }).click();
  await expect(page.getByText("Reply sent through the relay")).toBeVisible();
  await expect(page.getByRole("button", { name: /To: Jordan Lee/ }).first()).toBeVisible(); // forwarded to sender

  await page.goto("/requests");
  const row = page.locator("[data-intro-row]:visible").filter({ hasText: name });
  await expect(row.getByText("Replied", { exact: true })).toBeVisible();
  await expect(row.getByText(/Happy to help/)).toBeVisible();
});

test("6. Not interested → status updates → next best is suggested", async ({ page, request }) => {
  await signInAs(page, /Jordan Lee/);
  await page.getByLabel("Your goal").fill(GOAL);
  await page.getByRole("button", { name: "Find people" }).click();
  await expect(page.getByRole("heading", { name: /\d+ members? match/ })).toBeVisible();
  const name = await pickRequestable(page, 1);
  await page.locator("article[aria-label]").getByRole("button", { name: "Request intro" }).click();
  await page.getByRole("button", { name: "Send request" }).click();
  await expect(page.getByText(/Request sent to/)).toBeVisible();

  const inbox = await (await request.get("/api/dev/inbox")).json();
  const mail = inbox.emails.find((e: { toName: string; kind: string }) => e.toName === name && e.kind === "intro");
  const href = mail.html.match(/href="([^"]+\/decline)"/)[1].replace(/&amp;/g, "&");
  await page.goto(href);
  await page.getByRole("button", { name: "Confirm — not interested" }).click();
  await expect(page.getByText("Got it — thanks for letting us know")).toBeVisible();

  await signInAs(page, /Jordan Lee/);
  await page.goto("/requests");
  await expect(page.locator("[data-intro-row]:visible").filter({ hasText: name }).getByText("Not interested", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Suggest the next best person" }).first().click();
  await expect(page.getByText("Next best:").first()).toBeVisible();
});

test("7. unclaimed recipient clicks Remove me → gone from search; re-import does not bring them back", async ({ page, request }) => {
  await signInAs(page, /Jordan Lee/);
  await page.goto("/explore?claimed=false&industry=Aerospace");
  const name = await pickRequestable(page, 0, "People");
  const before = await (await page.request.get("/api/explore/list?claimed=false&industry=Aerospace&facets=0")).json();
  const targetId: string = before.profiles.find((p: { firstName: string; lastName: string }) => `${p.firstName} ${p.lastName}` === name).id;
  await page.locator("article[aria-label]").getByRole("button", { name: "Request intro" }).click();
  await page.getByRole("button", { name: "Send request" }).click();
  await expect(page.getByText(/Request sent to|We don't have a way/)).toBeVisible();

  const inbox = await (await page.request.get("/api/dev/inbox")).json();
  const mail = inbox.emails.find((e: { toName: string; kind: string }) => e.toName === name && e.kind === "intro");
  test.skip(!mail, "picked recipient had no email on file");
  const href = mail.html.match(/href="([^"]+\/remove)"/)[1];
  await page.goto(href);
  await page.getByRole("button", { name: "Remove me" }).click();
  await expect(page.getByText("You've been removed from Venn.")).toBeVisible();

  await signInAs(page, /Jordan Lee/);
  const q = encodeURIComponent(name);
  const res = await (await page.request.get(`/api/explore/list?q=${q}&facets=0`)).json();
  expect(res.profiles.filter((p: { id: string }) => p.id === targetId)).toHaveLength(0);
  expect((await page.request.get(`/api/profiles/${targetId}`)).status()).toBe(404);

  // re-run the AA import through the admin endpoint
  const csv = readFileSync("mock-data/alumni_association_export.csv");
  const imp = await page.request.post("/api/admin/import-aa", { multipart: { file: { name: "aa.csv", mimeType: "text/csv", buffer: csv } } });
  expect(imp.ok()).toBe(true);
  expect((await imp.json()).counts.suppressed).toBeGreaterThanOrEqual(1);
  const after = await (await page.request.get(`/api/explore/list?q=${q}&facets=0`)).json();
  expect(after.profiles.filter((p: { id: string }) => p.id === targetId)).toHaveLength(0);
  expect((await page.request.get(`/api/profiles/${targetId}`)).status()).toBe(404);
  void request;
});

test("8. a standing goal gets a new match after a new member joins", async ({ page }) => {
  await signInAs(page, /Jordan Lee/);
  await page.getByLabel("Your goal").fill("Fintech product managers in Atlanta open to mentoring");
  await page.getByLabel(/Keep this goal active/).check();
  await page.getByRole("button", { name: "Find people" }).click();
  await expect(page.getByRole("heading", { name: /\d+ members? match/ })).toBeVisible();
  const goalUrl = await page.getByRole("link", { name: "Open goal page" }).getAttribute("href");

  await signInAs(page, /Riley Chen/);
  await page.getByRole("button", { name: "Skip — fill it in myself" }).click();
  await page.getByLabel("Last name").fill("Chen");
  await page.getByLabel("Job title").fill("Product Manager");
  await page.getByLabel("Employer").fill("Ledgerline Payments");
  await page.getByLabel("Industry").fill("Fintech");
  await page.getByLabel("City").fill("Atlanta");
  await page.getByLabel("State").fill("GA");
  await page.getByRole("button", { name: "mentoring students" }).click();
  await page.getByLabel(/Summary/).fill("Fintech product manager in Atlanta building payments products; open to mentoring students.");
  await page.getByRole("button", { name: "Approve & publish" }).click();
  await expect(page).toHaveURL(/\/home/);

  await signInAs(page, /Jordan Lee/);
  await page.goto(goalUrl!);
  const riley = page.getByRole("listitem").filter({ hasText: "Riley Chen" });
  await expect(riley).toBeVisible();
  await expect(riley.getByText("New", { exact: true })).toBeVisible();
});

test("claim link → sign in → prefilled profile → approve", async ({ page }) => {
  await signInAs(page, /Jordan Lee/);
  const inbox = await (await page.request.get("/api/dev/inbox")).json();
  const mail = inbox.emails.find((e: { toStatus: string; kind: string; html: string }) => e.kind === "intro" && e.toStatus === "unclaimed" && /\/claim"/.test(e.html));
  test.skip(!mail, "no unclaimed intro available");
  const href = mail.html.match(/href="([^"]+\/claim)"/)[1];
  await page.goto("about:blank"); // leave the app so its 401 → /signin redirect can't race this navigation
  await page.context().clearCookies();
  await page.goto(href);
  await expect(page).toHaveURL(/signin\?claim=1/);
  await expect(page.getByText("Claim your profile")).toBeVisible();
  await page.getByRole("button", { name: "Continue with school login" }).click();
  await page.getByRole("dialog").getByRole("button", { name: /Sam Rivera/ }).click();
  await expect(page).toHaveURL(/\/profile\?import=linkedin/);
  await expect(page.getByText("Your Alumni Association record is prefilled")).toBeVisible();
  await expect(page.getByText("LinkedIn data export (.zip)")).toBeVisible();
  await page.getByRole("button", { name: "Skip — fill it in myself" }).click();
  await expect(page.getByLabel("First name")).toHaveValue(mail.toName.split(" ")[0]);
});


test("invite a Yellow Jacket: one masked sandbox email, generic response, no address stored", async ({ page }) => {
  await signInAs(page, /Jordan Lee/);
  await page.getByRole("button", { name: "Account menu" }).click();
  await page.getByRole("menuitem", { name: "Invite a Yellow Jacket" }).click();
  await page.getByLabel("Their email").fill("taylor.brooks@gatech.edu");
  await page.getByLabel(/Add a note/).fill("You should join, it's great for finding mentors.");
  await page.getByRole("button", { name: "Send invite" }).click();
  await expect(page.getByText("Invite sent if they're not already on Venn.")).toBeVisible();

  const inbox = await (await page.request.get("/api/dev/inbox")).json();
  const invite = inbox.emails.find((e: { kind: string }) => e.kind === "invite");
  expect(invite.toName).toBe("t•••@gatech.edu");
  expect(invite.html).toContain("Jordan invited you to venn");
  expect(invite.html).not.toContain("taylor.brooks@gatech.edu");
  expect(invite.html).toContain("/noinvite");
});

test("regression: request intro works for seeded claimed members (non-RFC uuid ids)", async ({ page }) => {
  await signInAs(page, /Jordan Lee/);
  // Seeded members use ids like 1ef540d6-…-7085-… that fail strict RFC 4122 checks.
  const list = await (await page.request.get("/api/explore/list?claimed=true&role=alum&facets=0")).json();
  const target = list.profiles.find((p: { id: string; acceptingIntros: boolean }) => p.acceptingIntros && !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab]/i.test(p.id));
  expect(target, "need a seeded member with a non-RFC id").toBeTruthy();
  const r = await page.request.post("/api/intros/draft", { data: { recipientId: target.id, goalId: null } });
  expect(r.status()).toBe(200);
  const d = await r.json();
  expect(d.body.length).toBeGreaterThan(20);
  const rw = await page.request.post("/api/intros/rewrite", { data: { introId: d.introId, mode: "shorter" } });
  expect(rw.status()).toBe(200);
});
