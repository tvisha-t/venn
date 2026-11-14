import { beforeAll, describe, expect, it } from "vitest";
import { sql } from "@/server/db";
import { resetDatabase, seedAll } from "@/server/seed";
import { SharedContactInput, setOwnSharedContact, viewSharedContact, hasSharedContact } from "@/server/sharedContact";
import { getPublicProfile } from "@/server/profiles";
import { listProfiles } from "@/server/explore";

let member: string;
let viewerUser: string;

beforeAll(async () => {
  await resetDatabase();
  await seedAll();
  const [m] = await sql`select id from profiles where status='claimed' and 'alum' = any(roles) and summary_approved limit 1`;
  const [v] = await sql`select user_id from profiles where status='claimed' and 'student' = any(roles) and not ferpa_restricted limit 1`;
  member = m.id; viewerUser = v.user_id;
});

describe("opt-in contact sharing (product decision 2026-11-14)", () => {
  it("is off by default: nothing to view", async () => {
    expect(await hasSharedContact(member)).toBe(false);
    expect(await viewSharedContact(member, viewerUser)).toBeNull();
  });

  it("validates input", () => {
    expect(SharedContactInput.safeParse({ preferredEmail: "nope", phone: null, linkedinUrl: null, websiteUrl: null }).success).toBe(false);
    expect(SharedContactInput.safeParse({ preferredEmail: null, phone: null, linkedinUrl: "https://evil.com/x", websiteUrl: null }).success).toBe(false);
    expect(SharedContactInput.safeParse({ preferredEmail: null, phone: null, linkedinUrl: null, websiteUrl: "http://insecure.example" }).success).toBe(false);
    expect(SharedContactInput.safeParse({ preferredEmail: "", phone: "+1 404 555 0100", linkedinUrl: "https://www.linkedin.com/in/x", websiteUrl: "" }).success).toBe(true);
  });

  it("shares only opted-in fields, logs every view, and never adds them to PublicProfile", async () => {
    const input = SharedContactInput.parse({ preferredEmail: "me@example.org", phone: "", linkedinUrl: "https://www.linkedin.com/in/me", websiteUrl: "" });
    await setOwnSharedContact(member, input, "user:test");
    const seen = await viewSharedContact(member, viewerUser);
    expect(seen).toEqual({ preferredEmail: "me@example.org", phone: null, linkedinUrl: "https://www.linkedin.com/in/me", websiteUrl: null });
    const [log] = await sql`select actor, action from audit_log where action = 'shared_contact.view' and target_id = ${member} order by id desc limit 1`;
    expect(log.actor).toBe(`user:${viewerUser}`);
    const [upd] = await sql`select meta from audit_log where action = 'shared_contact.update' and target_id = ${member} order by id desc limit 1`;
    expect(JSON.stringify(upd.meta)).not.toContain("@"); // logs field names, not values
    expect(JSON.stringify(await getPublicProfile(member))).not.toContain("@");
    expect(JSON.stringify((await listProfiles({}, { pageSize: 60 })).profiles)).not.toContain("@");
  });

  it("clearing every field revokes sharing", async () => {
    await setOwnSharedContact(member, SharedContactInput.parse({ preferredEmail: "", phone: "", linkedinUrl: "", websiteUrl: "" }), "user:test");
    expect(await hasSharedContact(member)).toBe(false);
  });

  it("unclaimed (AA) profiles can never share contact details", async () => {
    const [u] = await sql`select id from profiles where status = 'unclaimed' limit 1`;
    await expect(setOwnSharedContact(u.id, SharedContactInput.parse({ preferredEmail: "x@example.org", phone: "", linkedinUrl: "", websiteUrl: "" }), "user:x")).rejects.toThrow();
  });
});
