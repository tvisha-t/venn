// "You both" for affinity groups. A shared group counts ONLY when BOTH people chose to show it on
// their profile. Private memberships (the default for identity-based groups) never count.
export type GroupMembership = { groupId: string; name: string; showOnProfile: boolean };

export function sharedGroups(mine: GroupMembership[], theirs: GroupMembership[]): string[] {
  const shownByThem = new Map(theirs.filter((g) => g.showOnProfile).map((g) => [g.groupId, g.name]));
  return mine.filter((g) => g.showOnProfile && shownByThem.has(g.groupId)).map((g) => g.name);
}

/** Only things the member typed themself (never names, photos, clubs-as-identity or language). */
export type OwnFields = { activities: string[]; interests: string[]; gtPrograms: string[]; major: string | null; industry: string | null; jobTitle: string | null; employer: string | null };

const RULES: { slug: string; test: (f: OwnFields) => string | null }[] = [
  { slug: "band", test: (f) => hit(f.activities, /\bband\b|marching/i) ?? hit(f.interests, /\bband\b|marching/i) },
  { slug: "crew", test: (f) => hit(f.activities, /\bcrew\b|rowing/i) },
  { slug: "lacrosse", test: (f) => hit(f.activities, /lacrosse/i) },
  { slug: "rotc", test: (f) => hit(f.activities, /\brotc\b/i) },
  { slug: "military", test: (f) => hit(f.activities, /military|veteran|army|navy|air force|marine corps|national guard/i) ?? hit(f.interests, /military|veteran/i) ?? field("job title", f.jobTitle, /military|army|navy|air force|marine/i) },
  { slug: "realestate", test: (f) => field("industry", f.industry, /real estate/i) ?? hit(f.interests, /real estate/i) },
  { slug: "scl", test: (f) => field("industry", f.industry, /logistics|supply chain/i) ?? hit(f.interests, /supply chain|logistics/i) },
  { slug: "bar", test: (f) => field("job title", f.jobTitle, /attorney|lawyer|counsel|\blaw\b/i) ?? hit(f.interests, /\blaw\b|legal/i) },
  { slug: "iac", test: (f) => field("major", f.major, /public policy|international affairs|history|literature|media|economics|modern languages|applied languages|sociology/i) },
  // Identity groups: only an explicit statement the member typed about themself.
  { slug: "firstgen", test: (f) => hit(f.activities, /first[- ]?gen/i) ?? hit(f.interests, /first[- ]?gen/i) },
];

function hit(list: string[], re: RegExp): string | null {
  const x = list.find((v) => re.test(v));
  return x ? `You listed “${x}” on your profile.` : null;
}
function field(label: string, v: string | null, re: RegExp): string | null {
  return v && re.test(v) ? `Your ${label} is “${v}”.` : null;
}

/** Suggestions from the member's own profile fields, with the private "why". */
export function suggestGroups(f: OwnFields): { slug: string; why: string }[] {
  return RULES.map((r) => ({ slug: r.slug, why: r.test(f) })).filter((x): x is { slug: string; why: string } => Boolean(x.why));
}
