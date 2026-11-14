// Affinity groups (official GT Alumni Association groups). Alumni-only. Identity-based groups are
// "sensitive": joining is private by default, memberships never show on a profile or in "You both"
// unless the member turns it on, and the member list is visible only to other members.
import { sql } from "./db";
import { audit } from "./audit";
import { HttpError } from "./http";
import { getOwnProfile } from "./profiles";
import { PUBLIC_COLUMNS, VISIBLE_PREDICATE, toPublicProfile } from "./dto";
import { suggestGroups, type GroupMembership } from "@/lib/groupOverlap";

export type GroupCategory = "profession" | "identity" | "campus" | "military" | "college";
export type GroupItem = {
  id: string; slug: string; name: string; category: GroupCategory; sensitive: boolean; description: string; icon: string;
  externalUrl: string; count: number; joined: boolean;
};
type Person = { id: string; firstName: string; lastName: string; role: string };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const toItem = (r: any): GroupItem => ({
  id: r.id, slug: r.slug, name: r.name, category: r.category, sensitive: r.sensitive, description: r.description, icon: r.icon,
  externalUrl: r.external_url, count: r.count, joined: r.joined,
});

export async function listGroups(viewerId: string) {
  const rows = await sql`
    select g.*, (select count(*)::int from group_memberships m where m.group_id = g.id) as count,
      exists (select 1 from group_memberships m where m.group_id = g.id and m.profile_id = ${viewerId}) as joined
    from affinity_groups g order by g.name`;
  const groups = rows.map(toItem);
  const me = await getOwnProfile(viewerId);
  const suggested = suggestGroups({ activities: me.activities, interests: me.interests, gtPrograms: me.gtPrograms, major: me.major, industry: me.industry, jobTitle: me.jobTitle, employer: me.employer })
    .map((s) => ({ ...s, group: groups.find((g) => g.slug === s.slug)! }))
    .filter((s) => s.group && !s.group.joined)
    .slice(0, 1)
    .map((s) => ({ group: s.group, why: s.why }));
  return { groups, suggested };
}

const roleOf = (p: ReturnType<typeof toPublicProfile>) => [p.jobTitle, p.employer].filter(Boolean).join(" · ") || (p.major ?? "Georgia Tech");

export async function getGroup(viewerId: string, slug: string) {
  const [r] = await sql`
    select g.*, (select count(*)::int from group_memberships m where m.group_id = g.id) as count,
      exists (select 1 from group_memberships m where m.group_id = g.id and m.profile_id = ${viewerId}) as joined
    from affinity_groups g where g.slug = ${slug}`;
  if (!r) throw new HttpError(404, "Group not found");
  const group = toItem(r);
  const [mine] = await sql`select role, show_on_profile from group_memberships where group_id = ${group.id} and profile_id = ${viewerId}`;
  // Leaders are shown to everyone only if they opted in (show_on_profile); demo leaders are seeded data.
  const leaderRows = await sql.unsafe(
    `select ${PUBLIC_COLUMNS}, true as accepting_intros, m.is_demo from group_memberships m join profiles p on p.id = m.profile_id
     where m.group_id = $1 and m.role = 'leader' and m.show_on_profile and p.status = 'claimed' and p.summary_approved and ${VISIBLE_PREDICATE}
     order by p.last_name limit 3`, [group.id]);
  const leaders = leaderRows.map((x) => { const p = toPublicProfile(x); return { id: p.id, firstName: p.firstName, lastName: p.lastName, role: roleOf(p), isDemo: Boolean(x.is_demo) }; });
  const [ev] = await sql`select id, title, starts_at from events where group_id = ${group.id} and starts_at >= now() order by starts_at limit 1`;
  // Members only: other members near you (city-level, published members only).
  let nearby: Person[] = [];
  if (mine) {
    const me = await getOwnProfile(viewerId);
    if (me.city) {
      const rows = await sql.unsafe(
        `select ${PUBLIC_COLUMNS}, true as accepting_intros from group_memberships m join profiles p on p.id = m.profile_id
         where m.group_id = $1 and p.id <> $2 and lower(p.city) = lower($3) and p.status = 'claimed' and p.summary_approved and ${VISIBLE_PREDICATE}
         order by p.last_name limit 8`, [group.id, viewerId, me.city]);
      nearby = rows.map((x) => { const p = toPublicProfile(x); return { id: p.id, firstName: p.firstName, lastName: p.lastName, role: roleOf(p) }; });
    }
  }
  return {
    group,
    membership: mine ? { role: mine.role as "member" | "leader", showOnProfile: mine.show_on_profile as boolean } : null,
    leaders,
    nextEvent: ev ? { id: ev.id as string, title: ev.title as string, startsAt: new Date(ev.starts_at).toISOString() } : null,
    nearby,
    nearbyCity: mine ? (await getOwnProfile(viewerId)).city : null,
  };
}

async function groupBySlug(slug: string) {
  const [g] = await sql`select id, sensitive from affinity_groups where slug = ${slug}`;
  if (!g) throw new HttpError(404, "Group not found");
  return g as { id: string; sensitive: boolean };
}

export async function joinGroup(viewerId: string, slug: string) {
  const g = await groupBySlug(slug);
  // Sensitive (identity) groups: private by default. Others show on the profile by default.
  await sql`insert into group_memberships (group_id, profile_id, show_on_profile) values (${g.id}, ${viewerId}, ${!g.sensitive}) on conflict do nothing`;
  await audit(`profile:${viewerId}`, "group.join", viewerId, { sensitive: g.sensitive }); // no group name in the log for sensitive groups
  return { joined: true, showOnProfile: !g.sensitive };
}

/** Leaving deletes the row. No history is kept. */
export async function leaveGroup(viewerId: string, slug: string) {
  const g = await groupBySlug(slug);
  await sql`delete from group_memberships where group_id = ${g.id} and profile_id = ${viewerId}`;
  await audit(`profile:${viewerId}`, "group.leave", viewerId, {});
  return { joined: false };
}

export async function setShowOnProfile(viewerId: string, slug: string, show: boolean) {
  const g = await groupBySlug(slug);
  const [r] = await sql`update group_memberships set show_on_profile = ${show} where group_id = ${g.id} and profile_id = ${viewerId} returning show_on_profile`;
  if (!r) throw new HttpError(404, "Join the group first.");
  return { showOnProfile: r.show_on_profile as boolean };
}

/** Groups a member chose to show on their profile (for the profile view). */
export async function shownGroups(profileId: string): Promise<GroupMembership[]> {
  const rows = await sql`select g.id, g.name, m.show_on_profile from group_memberships m join affinity_groups g on g.id = m.group_id
    where m.profile_id = ${profileId} and m.show_on_profile order by g.name`;
  return rows.map((r) => ({ groupId: r.id as string, name: r.name as string, showOnProfile: true }));
}
