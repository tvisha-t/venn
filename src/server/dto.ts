// Coordinates are deliberately NOT included: per-person locations would defeat map k-anonymity.
// Every profile that leaves the server goes through toPublicProfile().
// It copies an explicit allowlist of fields, so contact fields (login_email,
// email_primary, email_emfl_alias) structurally cannot be included.

export type PublicProfile = {
  id: string;
  status: "claimed" | "unclaimed";
  source: "self" | "alumni_association";
  firstName: string;
  lastName: string;
  roles: string[];
  classYear: number | null;
  degree: string | null;
  major: string | null;
  gtPrograms: string[];
  csThreads: string[];
  activities: string[];
  industry: string | null;
  employer: string | null;
  jobTitle: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  summary: string | null;
  openTo: string[];
  interests: string[];
  acceptingIntros: boolean;
};

/** Columns safe to SELECT for public use. Never add contact columns here. */
export const PUBLIC_COLUMNS = `p.id, p.status, p.source, p.first_name, p.last_name, p.roles, p.class_year, p.degree, p.major,
  p.gt_programs, p.cs_threads, p.activities, p.industry, p.employer, p.job_title, p.city, p.state, p.country,
  p.summary, p.summary_approved, p.open_to, p.interests`;

/** SQL predicate for profiles anyone may see (§13): not removed, not FERPA-restricted,
 *  students only if they claimed + approved, claimed profiles only once approved. */
export const VISIBLE_PREDICATE = `p.status <> 'removed' and not p.ferpa_restricted
  and (p.status = 'unclaimed' or p.summary_approved = true)
  and (not ('student' = any(p.roles)) or (p.status = 'claimed' and p.summary_approved = true))`;

const EMAIL_RE = /[^\s@]+@[^\s@]+/g;
const PHONE_RE = /\+?\d[\d\s().-]{8,}\d/g;
/** Belt and braces: strip anything shaped like an email/phone from free text. */
export function scrubContact(s: string | null | undefined): string | null {
  if (s == null) return null;
  return s.replace(EMAIL_RE, "[removed]").replace(PHONE_RE, "[removed]");
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function toPublicProfile(r: any, acceptingIntros = true): PublicProfile {
  return {
    id: r.id,
    status: r.status === "claimed" ? "claimed" : "unclaimed",
    source: r.source,
    firstName: r.first_name,
    lastName: r.last_name,
    roles: r.roles ?? [],
    classYear: r.class_year ?? null,
    degree: r.degree ?? null,
    major: r.major ?? null,
    gtPrograms: r.gt_programs ?? [],
    csThreads: r.cs_threads ?? [],
    activities: r.activities ?? [],
    industry: r.industry ?? null,
    employer: r.employer ?? null,
    jobTitle: r.job_title ?? null,
    city: r.city ?? null,
    state: r.state ?? null,
    country: r.country ?? null,
    summary: r.status === "claimed" && !r.summary_approved ? null : scrubContact(r.summary),
    openTo: r.open_to ?? [],
    interests: r.interests ?? [],
    acceptingIntros: r.accepting_intros ?? acceptingIntros,
  };
}

/** Trimmed fields for LLM prompts (§7.4 cost guard). No contact data, summary ≤ 300 chars. */
export function toLlmCandidate(p: PublicProfile) {
  return {
    id: p.id,
    name: `${p.firstName} ${p.lastName}`,
    roles: p.roles,
    class_year: p.classYear,
    degree: p.degree,
    major: p.major,
    gt_programs: p.gtPrograms,
    industry: p.industry,
    employer: p.employer,
    job_title: p.jobTitle,
    city: p.city,
    open_to: p.openTo,
    interests: p.interests.slice(0, 5),
    summary: p.summary?.slice(0, 300) ?? null,
    claimed: p.status === "claimed",
  };
}
