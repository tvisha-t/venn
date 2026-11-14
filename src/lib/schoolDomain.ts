// School-email rules (one function, used by the client, the server and mirrored by a DB trigger).
// A school is decided by the email's domain, never by what the user claims.
export type SchoolDomains = { slug: string; name: string; domains: string[]; allowSubdomains: boolean };

export const GATECH: SchoolDomains = { slug: "gatech", name: "Georgia Tech", domains: ["gatech.edu"], allowSubdomains: true };

export function normalizeEmail(raw: string): string | null {
  const email = raw.trim().toLowerCase();
  // one @, non-empty local part, a domain with a dot, no spaces
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;
  return email;
}

export function domainOf(email: string): string {
  return email.slice(email.lastIndexOf("@") + 1);
}

/** Exact domain or a true subdomain. Blocks lookalikes like "evilgatech.edu" and "gatech.edu.evil.com". */
export function domainMatches(domain: string, allowed: string, allowSub: boolean): boolean {
  if (domain === allowed) return true;
  return allowSub && domain.endsWith("." + allowed);
}

export function schoolForEmail(rawEmail: string, schools: SchoolDomains[] = [GATECH]): SchoolDomains | null {
  const email = normalizeEmail(rawEmail);
  if (!email) return null;
  const d = domainOf(email);
  return schools.find((s) => s.domains.some((a) => domainMatches(d, a, s.allowSubdomains))) ?? null;
}

/** Masks an address for display/logs: "olivia@gatech.edu" → "o•••a@gatech.edu". */
export function maskEmail(email: string): string {
  const [local, domain] = [email.slice(0, email.lastIndexOf("@")), domainOf(email)];
  const m = local.length <= 2 ? `${local[0] ?? ""}•` : `${local[0]}•••${local[local.length - 1]}`;
  return `${m}@${domain}`;
}
