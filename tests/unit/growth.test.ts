import { beforeAll, describe, expect, it } from "vitest";
import { strToU8, zipSync } from "fflate";
import { sql } from "@/server/db";
import { resetDatabase, seedAll } from "@/server/seed";
import { LINKEDIN_ALLOWED, LinkedInExportError, extractFromLinkedIn, readLinkedInZip } from "@/server/linkedinExport";
import { maskEmail, optOutOfInvites, sendInvite } from "@/server/invites";
import { emailHash, signLink, verifyLink } from "@/server/crypto";
import { introEmail } from "@/server/email/templates";

const MAJORS = ["Computer Science", "Industrial Engineering", "Mechanical Engineering"];

function exportZip(extra: Record<string, string> = {}) {
  return zipSync({
    "Profile.csv": strToU8(`First Name,Last Name,Headline,Summary,Industry,Geo Location
Riya,Shah,Product Manager at Stripe,"Product manager working on payments infrastructure. Reach me at riya@example.com or 404-555-0123. I love mentoring GT students.",Financial Services,"Atlanta, Georgia, United States"`),
    "Positions.csv": strToU8(`Company Name,Title,Description,Location,Started On,Finished On
Stripe,Product Manager,Payments infra,Atlanta,Mar 2022,
NCR,Software Engineer (Co-op),Georgia Tech co-op,Atlanta,Jan 2017,Aug 2017`),
    "Education.csv": strToU8(`School Name,Start Date,End Date,Notes,Degree Name,Activities
Georgia Institute of Technology,2015,2019,Computer Science,Bachelor of Science - BS,"CREATE-X, VIP, RoboJackets"`),
    "Skills.csv": strToU8(`Name\nProduct Management\nSQL\nPayments`),
    // Other people's data / private contact data: must never be read.
    "Connections.csv": strToU8(`First Name,Last Name,Email Address\nSecret,Person,secret.person@example.com`),
    "Email Addresses.csv": strToU8(`Email Address,Confirmed\nriya.private@example.com,Yes`),
    "messages.csv": strToU8(`FROM,TO,CONTENT\nA,B,private message`),
    ...Object.fromEntries(Object.entries(extra).map(([k, v]) => [k, strToU8(v)])),
  });
}

beforeAll(async () => {
  await resetDatabase();
  await seedAll();
});

describe("LinkedIn data-export import", () => {
  it("opens only the allowlisted files", () => {
    const files = readLinkedInZip(exportZip());
    expect(Object.keys(files).sort()).toEqual([...LINKEDIN_ALLOWED].sort());
    expect(JSON.stringify(files)).not.toContain("secret.person@example.com");
    expect(JSON.stringify(files)).not.toContain("private message");
  });

  it("maps profile, current role, GT education, programs and skills", () => {
    const x = extractFromLinkedIn(readLinkedInZip(exportZip()), MAJORS, new Date("2026-11-14"));
    expect(x).toMatchObject({
      roles: ["alum"], classYear: 2019, degree: "BS", major: "Computer Science",
      employer: "Stripe", jobTitle: "Product Manager", industry: "Fintech", city: "Atlanta", state: "GA", source: "linkedin_export",
    });
    expect(x.gtPrograms).toEqual(expect.arrayContaining(["CREATE-X", "VIP", "Co-op"]));
    expect(x.interests).toEqual(["Product Management", "SQL", "Payments"]);
  });

  it("strips contact details from the summary", () => {
    const x = extractFromLinkedIn(readLinkedInZip(exportZip()), MAJORS);
    expect(x.summary).not.toMatch(/@|555|\[email\]|\[phone\]/);
    expect(x.summary.length).toBeGreaterThan(10);
  });

  it("detects current students from a future GT end date", () => {
    const zip = zipSync({
      "Education.csv": strToU8(`School Name,Start Date,End Date,Notes,Degree Name,Activities\nGeorgia Tech,2024,2028,Industrial Engineering,Bachelor's degree,`),
      "Positions.csv": strToU8(`Company Name,Title,Description,Location,Started On,Finished On\nDelta,Intern,,Atlanta,May 2026,Aug 2026`),
    });
    const x = extractFromLinkedIn(readLinkedInZip(zip), MAJORS, new Date("2026-11-14"));
    expect(x.roles).toEqual(["student"]);
    expect(x.classYear).toBe(2028);
    expect(x.employer).toBeNull();
  });

  it("rejects files that aren't a LinkedIn export", () => {
    expect(() => readLinkedInZip(strToU8("not a zip"))).toThrow(LinkedInExportError);
    expect(() => readLinkedInZip(zipSync({ "Connections.csv": strToU8("a,b") }))).toThrow(LinkedInExportError);
  });
});

describe("intro emails invite unclaimed alumni to claim with LinkedIn", () => {
  it("includes the LinkedIn claim prompt only for unclaimed recipients", () => {
    const base = { senderFirstName: "Jordan", senderContext: "CS '28 · Georgia Tech", subject: "Hi", message: "Hello there, quick question about your work.", links: { decline: "/r/x/decline", claim: "/r/x/claim", remove: "/r/x/remove" } };
    expect(introEmail({ ...base, unclaimed: true }).html).toContain("import it from LinkedIn");
    expect(introEmail({ ...base, unclaimed: false }).html).not.toContain("import it from LinkedIn");
  });
});

describe("member invites", () => {
  let inviter: { id: string; user: string };
  beforeAll(async () => {
    const [p] = await sql`select id, user_id from profiles where status = 'claimed' and summary_approved and 'alum' = any(roles) limit 1`;
    inviter = { id: p.id, user: p.user_id };
  });

  it("sends one email and stores only a hash of the address", async () => {
    const out = await sendInvite(inviter.id, inviter.user, "New.Friend@gatech.edu", "Join us! Email me at me@example.com");
    expect(out).toBe("sent");
    const rows = await sql`select * from invites`;
    expect(rows.length).toBe(1);
    expect(rows[0].email_hash).toBe(emailHash("new.friend@gatech.edu"));
    expect(JSON.stringify(rows)).not.toContain("@");
    const [mail] = await sql`select * from sandbox_emails where kind = 'invite'`;
    expect(mail.to_label).toBe(maskEmail("new.friend@gatech.edu"));
    expect(mail.html).not.toContain("new.friend@gatech.edu");
    expect(mail.html).not.toContain("me@example.com"); // contact info stripped from the note
    const [a] = await sql`select meta from audit_log where action = 'invite.send' order by id desc limit 1`;
    expect(JSON.stringify(a.meta)).not.toMatch(/@|[0-9a-f]{64}/);
  });

  it("doesn't re-invite within 30 days, doesn't email members, honors opt-out", async () => {
    expect(await sendInvite(inviter.id, inviter.user, "new.friend@gatech.edu")).toBe("skipped_recent");
    const [u] = await sql`select login_email from users limit 1`;
    expect(await sendInvite(inviter.id, inviter.user, u.login_email)).toBe("skipped_member");
    const hash = emailHash("someone.else@gatech.edu")!;
    const link = signLink(hash, "noinvite");
    const v = verifyLink(link, "noinvite");
    expect(v.ok).toBe(true);
    expect(await optOutOfInvites(hash)).toBe(true);
    expect(await sendInvite(inviter.id, inviter.user, "someone.else@gatech.edu")).toBe("skipped_optout");
    const [{ n }] = await sql`select count(*)::int n from sandbox_emails where kind = 'invite'`;
    expect(n).toBe(1);
  });
});
