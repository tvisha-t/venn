// GT Login adapter (§9). MockGtLogin now; GtCasLogin (CAS/SAML) later, pending OIT approval.
import { sql } from "./db";
import { sha256 } from "./crypto";
import { loadDemoPeople } from "./seed";

export type Affiliation = "student" | "faculty" | "staff" | "alum" | "lifetime_learner";
export type Identity = { subject: string; email: string; displayName: string; affiliation: Affiliation };

export interface IdentityProvider {
  /** Resolve the identity the user authenticated as. */
  signIn(input: { identityId: string } | { email: string }): Promise<Identity>;
}

export class SchoolEmailError extends Error {}

/** School and alumni-forwarding domains accepted by the mock (plus the demo's reserved test domains). */
const SCHOOL_EMAIL = /^[^\s@]+@(?:(?:[a-z0-9-]+\.)*gatech\.edu|(?:[a-z0-9-]+\.)*example\.gatech\.test)$/i;

function nameFromEmail(email: string): string {
  const local = email.split("@")[0].replace(/[0-9]+$/, "");
  const parts = local.split(/[._-]+/).filter(Boolean).slice(0, 2);
  const cap = (x: string) => x.charAt(0).toUpperCase() + x.slice(1).toLowerCase();
  return parts.length >= 2 ? `${cap(parts[0])} ${cap(parts[1])}` : `${cap(parts[0] ?? "New")} Member`;
}

function affiliationFromEmail(email: string): Affiliation {
  const d = email.split("@")[1]?.toLowerCase() ?? "";
  if (d.startsWith("alumni.")) return "alum";
  if (d.startsWith("pe.") || d.startsWith("professional.")) return "lifetime_learner";
  return "student";
}

/** What the picker shows. No emails — those are private even in the demo. */
export type DemoIdentity = { id: string; displayName: string; affiliation: Affiliation; detail: string; isNew: boolean };

const NEW_IDENTITIES: (DemoIdentity & { email: string })[] = [
  { id: "new-student", displayName: "Jordan Lee", affiliation: "student", detail: "New student · no profile yet", isNew: true, email: "jordan.lee@student.example.gatech.test" },
  { id: "new-alum", displayName: "Sam Rivera", affiliation: "alum", detail: "New alum · no profile yet", isNew: true, email: "sam.rivera@alumni.example.gatech.test" },
  { id: "new-learner", displayName: "Riley Chen", affiliation: "lifetime_learner", detail: "New lifetime learner · no profile yet", isNew: true, email: "riley.chen@pe.example.gatech.test" },
];

export class MockGtLogin implements IdentityProvider {
  async listIdentities(): Promise<DemoIdentity[]> {
    const rows = await sql`
      (select p.id, p.first_name, p.last_name, p.roles, p.major, p.class_year, p.employer, 'student' k from profiles p
        where p.status = 'claimed' and 'student' = any(p.roles) and not p.ferpa_restricted order by p.last_name limit 3)
      union all
      (select p.id, p.first_name, p.last_name, p.roles, p.major, p.class_year, p.employer, 'alum' from profiles p
        where p.status = 'claimed' and 'alum' = any(p.roles) and p.source = 'self' order by p.last_name limit 2)
      union all
      (select p.id, p.first_name, p.last_name, p.roles, p.major, p.class_year, p.employer, 'faculty' from profiles p
        where p.status = 'claimed' and 'faculty' = any(p.roles) order by p.last_name limit 1)
      union all
      (select p.id, p.first_name, p.last_name, p.roles, p.major, p.class_year, p.employer, 'lifetime_learner' from profiles p
        where p.status = 'claimed' and 'lifetime_learner' = any(p.roles) order by p.last_name limit 1)`;
    const seeded = rows.map((r) => ({
      id: r.id as string,
      displayName: `${r.first_name} ${r.last_name}`,
      affiliation: r.k as Affiliation,
      detail:
        r.k === "student" ? `${r.major} · class of ${r.class_year}`
        : r.k === "alum" ? `${r.employer ?? "Alum"} · '${String(r.class_year ?? "").slice(2)}`
        : r.k === "faculty" ? `Faculty · ${r.major ?? "GT"}`
        : `Lifetime learner · ${r.major ?? "Professional Education"}`,
      isNew: false,
    }));
    const demo = loadDemoPeople();
    const demoRows = demo.length
      ? await sql`select id, first_name, last_name, roles from profiles where id = any(${demo.map((d) => d.id)}) and status = 'claimed'`
      : [];
    const demoIds: DemoIdentity[] = demoRows.map((r) => ({
      id: r.id as string,
      displayName: `${r.first_name} ${r.last_name}`,
      affiliation: ((r.roles as string[])[0] ?? "alum") as Affiliation,
      detail: demo.find((d) => d.id === r.id)?.demo_label ?? "Demo profile",
      isNew: false,
    }));
    return [...seeded.filter((x) => !demoIds.some((d) => d.id === x.id)), ...demoIds, ...NEW_IDENTITIES.map(({ email: _e, ...rest }) => rest)];
  }

  async signIn(input: { identityId: string } | { email: string }): Promise<Identity> {
    if ("email" in input) return signInWithEmail(input.email);
    const { identityId } = input;
    const fresh = NEW_IDENTITIES.find((n) => n.id === identityId);
    if (fresh) return { subject: `mock|${fresh.id}`, email: fresh.email, displayName: fresh.displayName, affiliation: fresh.affiliation };
    const [r] = await sql`
      select p.first_name, p.last_name, p.roles, u.auth_subject, u.login_email from profiles p join users u on u.id = p.user_id
      where p.id = ${identityId} and p.status = 'claimed' and not p.ferpa_restricted`;
    if (!r) throw new Error("Unknown demo identity");
    const roles = r.roles as string[];
    const affiliation = (["student", "alum", "faculty", "staff", "lifetime_learner"] as Affiliation[]).find((a) => roles.includes(a)) ?? "alum";
    return { subject: r.auth_subject, email: r.login_email, displayName: `${r.first_name} ${r.last_name}`, affiliation };
  }
}

/**
 * Demo-only "School email → Continue". A real build sends a one-time link or hands off to GT Login.
 * Existing users sign in as themselves; new GT emails get a fresh demo identity.
 */
async function signInWithEmail(raw: string): Promise<Identity> {
  const email = raw.trim().toLowerCase();
  const [u] = await sql`
    select u.auth_subject, u.login_email, p.first_name, p.last_name, p.roles
    from users u left join profiles p on p.user_id = u.id and p.status = 'claimed'
    where lower(u.login_email) = ${email} limit 1`;
  if (u) {
    const roles = (u.roles as string[] | null) ?? [];
    const affiliation = (["student", "alum", "faculty", "staff", "lifetime_learner"] as Affiliation[]).find((a) => roles.includes(a)) ?? affiliationFromEmail(email);
    return { subject: u.auth_subject, email: u.login_email, displayName: u.first_name ? `${u.first_name} ${u.last_name}` : nameFromEmail(email), affiliation };
  }
  if (!SCHOOL_EMAIL.test(email)) {
    throw new SchoolEmailError("Use your school email (you@gatech.edu) or your alumni / lifetime forwarding email.");
  }
  return { subject: `mock|email|${sha256(email).slice(0, 24)}`, email, displayName: nameFromEmail(email), affiliation: affiliationFromEmail(email) };
}

export const identityProvider = new MockGtLogin();
