import { beforeAll, describe, expect, it } from "vitest";
import { sql } from "@/server/db";
import { resetDatabase, seedAll } from "@/server/seed";
import { MAX_WRONG_TRIES, requestCode, verifyCode } from "@/server/signinCodes";
import { completeSignIn } from "@/server/auth";

const latestCode = async () => {
  const [e] = await sql`select text_body from sandbox_emails where kind = 'signin_code' order by created_at desc limit 1`;
  return (e.text_body as string).match(/\b(\d{6})\b/)![1];
};

beforeAll(async () => {
  await resetDatabase();
  await seedAll();
});

describe("school-email sign-in codes", () => {
  it("rejects non-school and lookalike domains before sending anything", async () => {
    for (const bad of ["x@gmail.com", "x@evilgatech.edu", "x@gatech.edu.evil.com"]) {
      await expect(requestCode(bad, "1.1.1.1")).rejects.toThrow(/Georgia Tech email/);
    }
    expect((await sql`select count(*)::int n from signin_codes`)[0].n).toBe(0);
  });

  it("stores only hashes, verifies the right code once, and rejects reuse", async () => {
    await requestCode("Pat.Lee@gatech.edu", "1.1.1.2");
    const [row] = await sql`select * from signin_codes order by created_at desc limit 1`;
    expect(JSON.stringify(row)).not.toMatch(/pat\.lee/i);
    const code = await latestCode();
    expect(JSON.stringify(row)).not.toContain(code);
    expect(await verifyCode("pat.lee@gatech.edu", code)).toBe("pat.lee@gatech.edu");
    await expect(verifyCode("pat.lee@gatech.edu", code)).rejects.toThrow(/expired|used/);
  });

  it("locks a code after too many wrong tries and enforces the resend cooldown", async () => {
    await requestCode("sam.ko@gatech.edu", "1.1.1.3");
    await expect(requestCode("sam.ko@gatech.edu", "1.1.1.3")).rejects.toThrow(/Wait \d+s/);
    const good = await latestCode();
    for (let i = 0; i < MAX_WRONG_TRIES; i++) await expect(verifyCode("sam.ko@gatech.edu", good === "000000" ? "111111" : "000000")).rejects.toThrow();
    await expect(verifyCode("sam.ko@gatech.edu", good)).rejects.toThrow(/Too many wrong tries/);
  });

  it("the database refuses accounts outside a school domain, whatever the code path", async () => {
    await expect(sql`insert into users (auth_subject, login_email) values ('t|1', 'someone@gmail.com')`).rejects.toThrow(/school email/);
    await expect(sql`insert into users (auth_subject, login_email) values ('t|2', 'x@evilgatech.edu')`).rejects.toThrow(/school email/);
    const r = await completeSignIn({ email: "new.person@cc.gatech.edu" });
    expect(r.needsProfile).toBe(true);
  });
});
