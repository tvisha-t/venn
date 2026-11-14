import { beforeAll, describe, expect, it } from "vitest";
import { sql } from "@/server/db";
import { resetDatabase, seedAll } from "@/server/seed";
import { CODE_RE, applyReferralCookie, getOrCreateInviteLink, inviterForCode, recordReferral, resetInviteLink } from "@/server/referrals";
import { fetchLinkedInUser, linkLinkedIn, readPending, signPending, userForLinkedIn } from "@/server/linkedin";

let inviter: { profileId: string; userId: string };
let joiner: { profileId: string; userId: string };
let unapproved: { profileId: string; userId: string };

beforeAll(async () => {
  await resetDatabase();
  await seedAll();
  const rows = await sql`select id, user_id from profiles where status = 'claimed' and summary_approved and not ferpa_restricted
    and user_id is not null order by id limit 2`;
  inviter = { profileId: rows[0].id, userId: rows[0].user_id };
  joiner = { profileId: rows[1].id, userId: rows[1].user_id };
  const [u] = await sql`select id, user_id from profiles where status = 'claimed' and user_id is not null and id <> ${inviter.profileId} limit 1`;
  await sql`update profiles set summary_approved = false where id = ${u.id}`;
  unapproved = { profileId: u.id, userId: u.user_id };
  await sql`update profiles set summary_approved = true where id = ${joiner.profileId}`;
});

describe("personal invite links", () => {
  it("creates one readable code per member and reuses it", async () => {
    const a = await getOrCreateInviteLink(inviter.profileId, inviter.userId);
    const b = await getOrCreateInviteLink(inviter.profileId, inviter.userId);
    expect(a.code).toBe(b.code);
    expect(a.code).toMatch(CODE_RE);
    expect(a.url).toMatch(new RegExp(`/join/${a.code}$`));
    expect(a.joined).toBe(0);
  });

  it("requires an approved profile", async () => {
    await expect(getOrCreateInviteLink(unapproved.profileId, unapproved.userId)).rejects.toThrow(/Approve your profile/);
  });

  it("the public landing page gets only first name, last initial and a GT line", async () => {
    const { code } = await getOrCreateInviteLink(inviter.profileId, inviter.userId);
    const who = await inviterForCode(code);
    expect(who).not.toBeNull();
    expect(Object.keys(who!).sort()).toEqual(["context", "firstName", "lastInitial", "profileId"]);
    expect(who!.lastInitial).toHaveLength(1);
    const { profileId: _id, ...shown } = who!; // the id stays server-side; the page renders only these
    expect(JSON.stringify(shown)).not.toMatch(/@|\d{3}[\s.-]\d{4}/);
    expect(await inviterForCode("nope")).toBeNull();
    expect(await inviterForCode("'; drop table users; --")).toBeNull();
  });

  it("credits a join once, never self-referral, and cookie only on a real join", async () => {
    const { code } = await getOrCreateInviteLink(inviter.profileId, inviter.userId);
    expect(await recordReferral(inviter.profileId, code)).toBe(false);

    const jar = new Map<string, string>([["venn_ref", code]]);
    const fakeJar = { get: (k: string) => (jar.has(k) ? { value: jar.get(k)! } : undefined), delete: (k: string) => jar.delete(k) };
    await applyReferralCookie(fakeJar, { profileId: joiner.profileId, joined: false }); // ordinary sign-in: no credit
    expect((await getOrCreateInviteLink(inviter.profileId, inviter.userId)).joined).toBe(0);
    expect(jar.has("venn_ref")).toBe(false);

    jar.set("venn_ref", code);
    await applyReferralCookie(fakeJar, { profileId: joiner.profileId, joined: true });
    expect(await recordReferral(joiner.profileId, code)).toBe(false); // already credited
    expect((await getOrCreateInviteLink(inviter.profileId, inviter.userId)).joined).toBe(1);
  });

  it("reset retires the old link and keeps the count", async () => {
    const before = await getOrCreateInviteLink(inviter.profileId, inviter.userId);
    const after = await resetInviteLink(inviter.profileId, inviter.userId);
    expect(after.code).not.toBe(before.code);
    expect(await inviterForCode(before.code)).toBeNull();
    expect(await inviterForCode(after.code)).not.toBeNull();
    expect(after.joined).toBe(before.joined);
  });
});

describe("Continue with LinkedIn", () => {
  const fakeFetch = (userinfo: Record<string, unknown>) =>
    (async (url: string | URL | Request) => {
      const u = String(url);
      if (u.includes("accessToken")) return new Response(JSON.stringify({ access_token: "tok" }), { status: 200 });
      if (u.includes("userinfo")) return new Response(JSON.stringify(userinfo), { status: 200 });
      return new Response("", { status: 404 });
    }) as typeof fetch;

  it("keeps only a hash of LinkedIn's id and a cleaned name", async () => {
    const li = await fetchLinkedInUser("code", fakeFetch({ sub: "abc123", given_name: "Sam<script>", family_name: "Rivera", email: "Sam@Gmail.com", email_verified: true }));
    expect(li.subHash).toMatch(/^[0-9a-f]{64}$/);
    expect(li.subHash).not.toContain("abc123");
    expect(li.firstName).toBe("Samscript");
    expect(li.email).toBe("sam@gmail.com");
    expect(li.emailVerified).toBe(true);
  });

  it("fails cleanly when LinkedIn errors", async () => {
    const bad = (async () => new Response("", { status: 500 })) as unknown as typeof fetch;
    await expect(fetchLinkedInUser("code", bad)).rejects.toThrow(/LinkedIn sign-in didn't finish/);
  });

  it("links a member so the next LinkedIn sign-in finds them", async () => {
    const li = await fetchLinkedInUser("code", fakeFetch({ sub: "member-1", given_name: "Pat", family_name: "Lee" }));
    expect(await userForLinkedIn(li.subHash)).toBeNull();
    await linkLinkedIn(joiner.userId, joiner.profileId, li, false);
    expect((await userForLinkedIn(li.subHash))?.profileId).toBe(joiner.profileId);
    const [p] = await sql`select first_name from profiles where id = ${joiner.profileId}`;
    expect(p.first_name).not.toBe("Pat"); // existing profile names are never overwritten
  });

  it("the pending-LinkedIn cookie can't be forged", () => {
    const c = signPending({ subHash: "h", firstName: "Sam", lastName: "R" });
    expect(readPending(c)?.firstName).toBe("Sam");
    const [payload, sig] = c.split(".");
    const forged = Buffer.from(JSON.stringify({ subHash: "other", firstName: "X", lastName: "Y", iat: Date.now() })).toString("base64url");
    expect(readPending(`${forged}.${sig}`)).toBeNull();
    expect(readPending(`${payload}.bad`)).toBeNull();
    expect(readPending(undefined)).toBeNull();
  });
});
