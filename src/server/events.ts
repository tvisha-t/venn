// Events near you. Venues only (never anyone's location); attendee faces only for members who
// claimed and approved their profile; the "you'll know" phrase comes from real overlap or is omitted.
import { sql } from "./db";
import { HttpError } from "./http";
import { findCity, ATLANTA } from "./geo";
import { getOwnProfile } from "./profiles";
import { PUBLIC_COLUMNS, VISIBLE_PREDICATE, toPublicProfile, type PublicProfile } from "./dto";
import { goingPhrase, overlapScore, sharedCount, topOverlaps, type OverlapPerson } from "@/lib/eventPhrase";

export const EVENT_CATEGORIES = ["game_watch", "career", "social", "volunteer", "family", "member_hosted"] as const;
export type EventCategory = (typeof EVENT_CATEGORIES)[number];
export type EventRange = "week" | "month" | "going";

/** Neighborhood centers used for member-hosted venues (no external geocoder). */
export const NEIGHBORHOODS: Record<string, { lat: number; lng: number }> = {
  Midtown: { lat: 33.7838, lng: -84.383 },
  Downtown: { lat: 33.755, lng: -84.39 },
  Buckhead: { lat: 33.8395, lng: -84.3798 },
  Westside: { lat: 33.781, lng: -84.412 },
  "Old Fourth Ward": { lat: 33.764, lng: -84.372 },
  "Inman Park": { lat: 33.759, lng: -84.353 },
  "Virginia-Highland": { lat: 33.781, lng: -84.354 },
  "Tech Square": { lat: 33.777, lng: -84.389 },
  Decatur: { lat: 33.7748, lng: -84.2963 },
};

type Avatar = { id: string; firstName: string; lastName: string };
export type EventItem = {
  id: string; title: string; description: string | null; category: EventCategory; source: "network" | "member";
  hostLabel: string; hostIsMe: boolean; startsAt: string; endsAt: string | null; city: string; neighborhood: string | null;
  venueName: string; venueAddress: string; lat: number; lng: number; externalUrl: string | null;
  isFeatured: boolean; isDemo: boolean; going: number; meGoing: boolean;
  avatars: Avatar[]; phrase: string | null; sharedCount: number; distanceMi: number | null;
};
export type EventDetail = EventItem & {
  youllKnow: (Avatar & { role: string; item: string })[];
  attendees: (Avatar & { role: string })[];
};

let schoolId: string | null = null;
async function gatechId() {
  if (!schoolId) schoolId = ((await sql`select id from schools where slug = 'gatech'`)[0]?.id as string) ?? null;
  return schoolId!;
}

function miles(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 3958.8, rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad, dLng = (b.lng - a.lng) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(h)) * 10) / 10;
}

const toOverlap = (p: PublicProfile): OverlapPerson => ({
  id: p.id, firstName: p.firstName, activities: p.activities, gtPrograms: p.gtPrograms, csThreads: p.csThreads, major: p.major, interests: p.interests,
});
const roleOf = (p: PublicProfile) => [p.jobTitle, p.employer].filter(Boolean).join(" · ") || (p.major ? `${p.major}${p.classYear ? ` '${String(p.classYear).slice(2)}` : ""}` : "Georgia Tech");

// Phrase cache (10 min), keyed by viewer + event + attendee count so an RSVP refreshes it.
const phraseCache = new Map<string, { at: number; phrase: string | null; shared: number; order: string[] }>();

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function baseItem(r: any, viewerId: string): Omit<EventItem, "avatars" | "phrase" | "sharedCount" | "distanceMi"> {
  return {
    id: r.id, title: r.title, description: r.description, category: r.category, source: r.source, hostLabel: r.host_label,
    hostIsMe: r.host_profile_id === viewerId, startsAt: new Date(r.starts_at).toISOString(), endsAt: r.ends_at ? new Date(r.ends_at).toISOString() : null,
    city: r.city, neighborhood: r.neighborhood, venueName: r.venue_name, venueAddress: r.venue_address, lat: Number(r.lat), lng: Number(r.lng),
    externalUrl: r.external_url, isFeatured: r.is_featured, isDemo: r.is_demo, going: r.going, meGoing: r.me_going,
  };
}

/** Discoverable attendees (claimed + approved + visible) for a set of events. One query. */
async function attendeesFor(eventIds: string[]) {
  if (!eventIds.length) return new Map<string, PublicProfile[]>();
  const rows = await sql.unsafe(
    `select r.event_id, ${PUBLIC_COLUMNS}, true as accepting_intros from event_rsvps r join profiles p on p.id = r.profile_id
     where r.event_id = any($1::uuid[]) and p.status = 'claimed' and p.summary_approved and ${VISIBLE_PREDICATE}
     order by r.created_at`,
    [eventIds],
  );
  const by = new Map<string, PublicProfile[]>();
  for (const r of rows) {
    const list = by.get(r.event_id as string) ?? [];
    list.push(toPublicProfile(r));
    by.set(r.event_id as string, list);
  }
  return by;
}

export async function listEvents(viewerId: string, opts: { city?: string | null; range?: EventRange; category?: string | null }) {
  const me = await getOwnProfile(viewerId);
  const school = await gatechId();
  const city = (opts.city?.trim() || me.city || "Atlanta").slice(0, 60);
  const range = opts.range ?? "month";
  const days = range === "week" ? 7 : 30;
  const cat = opts.category && opts.category !== "all" ? opts.category : null;
  const rows = await sql`
    select e.*, (select count(*)::int from event_rsvps r where r.event_id = e.id) as going,
      exists (select 1 from event_rsvps r where r.event_id = e.id and r.profile_id = ${viewerId}) as me_going
    from events e
    where e.school_id = ${school} and e.starts_at >= now() - interval '3 hours'
      ${range === "going"
        ? sql`and exists (select 1 from event_rsvps r where r.event_id = e.id and r.profile_id = ${viewerId})`
        : sql`and lower(e.city) = lower(${city}) and e.starts_at < now() + make_interval(days => ${days})`}
      ${cat === "member_hosted" ? sql`and e.source = 'member'` : cat ? sql`and e.category = ${cat}` : sql``}
    order by e.starts_at`;
  const [{ n: goingCount }] = await sql`select count(*)::int n from event_rsvps r join events e on e.id = r.event_id
    where r.profile_id = ${viewerId} and e.starts_at >= now() - interval '3 hours'`;

  const att = await attendeesFor(rows.map((r) => r.id as string));
  const origin = findCity(me.city, me.state) ?? findCity(city) ?? { ...ATLANTA };
  const meO = toOverlap(me as unknown as PublicProfile);
  const events: EventItem[] = rows.map((r) => {
    const people = att.get(r.id as string) ?? [];
    const key = `${viewerId}:${r.id}:${r.going}:${people.length}`;
    let c = phraseCache.get(key);
    if (!c || Date.now() - c.at > 10 * 60_000) {
      const ov = people.map(toOverlap);
      const order = [...people].sort((a, b) => overlapScore(meO, toOverlap(b)) - overlapScore(meO, toOverlap(a))).map((p) => p.id);
      c = { at: Date.now(), phrase: goingPhrase(meO, ov), shared: sharedCount(meO, ov), order };
      phraseCache.set(key, c);
      if (phraseCache.size > 2000) phraseCache.delete(phraseCache.keys().next().value!);
    }
    const byId = new Map(people.map((p) => [p.id, p]));
    const avatars = c.order.filter((id) => id !== viewerId).slice(0, 5).map((id) => { const p = byId.get(id)!; return { id, firstName: p.firstName, lastName: p.lastName }; });
    return { ...baseItem(r, viewerId), avatars, phrase: c.phrase, sharedCount: c.shared, distanceMi: miles(origin, { lat: Number(r.lat), lng: Number(r.lng) }) };
  });
  return { city, range, goingCount: goingCount as number, events };
}

export async function getEvent(viewerId: string, id: string): Promise<EventDetail> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new HttpError(404, "Event not found");
  const me = await getOwnProfile(viewerId);
  const [r] = await sql`
    select e.*, (select count(*)::int from event_rsvps r where r.event_id = e.id) as going,
      exists (select 1 from event_rsvps r where r.event_id = e.id and r.profile_id = ${viewerId}) as me_going
    from events e where e.id = ${id} and e.school_id = ${await gatechId()}`;
  if (!r) throw new HttpError(404, "Event not found");
  const people = (await attendeesFor([id])).get(id) ?? [];
  const meO = toOverlap(me as unknown as PublicProfile);
  const ov = people.map(toOverlap);
  const byId = new Map(people.map((p) => [p.id, p]));
  const tops = topOverlaps(meO, ov, 3);
  const origin = findCity(me.city, me.state) ?? findCity(r.city) ?? { ...ATLANTA };
  const others = people.filter((p) => p.id !== viewerId);
  return {
    ...baseItem(r, viewerId),
    avatars: others.slice(0, 5).map((p) => ({ id: p.id, firstName: p.firstName, lastName: p.lastName })),
    phrase: goingPhrase(meO, ov), sharedCount: sharedCount(meO, ov),
    distanceMi: miles(origin, { lat: Number(r.lat), lng: Number(r.lng) }),
    youllKnow: tops.map((t) => { const p = byId.get(t.id)!; return { id: p.id, firstName: p.firstName, lastName: p.lastName, role: roleOf(p), item: t.item }; }),
    attendees: others.map((p) => ({ id: p.id, firstName: p.firstName, lastName: p.lastName, role: roleOf(p) })),
  };
}

export async function setRsvp(viewerId: string, eventId: string, going: boolean) {
  if (!/^[0-9a-f-]{36}$/i.test(eventId)) throw new HttpError(404, "Event not found");
  const [e] = await sql`select id from events where id = ${eventId} and school_id = ${await gatechId()} and starts_at >= now() - interval '3 hours'`;
  if (!e) throw new HttpError(404, "This event has ended or doesn't exist.");
  if (going) await sql`insert into event_rsvps (event_id, profile_id) values (${eventId}, ${viewerId}) on conflict do nothing`;
  else await sql`delete from event_rsvps where event_id = ${eventId} and profile_id = ${viewerId}`;
  const [{ n }] = await sql`select count(*)::int n from event_rsvps where event_id = ${eventId}`;
  return { going, count: n as number };
}

export type NewEvent = { title: string; category: EventCategory; startsAt: string; venueName: string; venueAddress: string; neighborhood?: string | null; city?: string | null; description?: string | null };

export async function createMemberEvent(viewerId: string, e: NewEvent) {
  const me = await getOwnProfile(viewerId);
  if (!me.summaryApproved) throw new HttpError(403, "Publish your profile before hosting an event.", "profile_unapproved");
  const starts = new Date(e.startsAt);
  if (!Number.isFinite(starts.getTime()) || starts.getTime() < Date.now() - 3600_000) throw new HttpError(400, "Pick a date and time in the future.");
  if (starts.getTime() > Date.now() + 365 * 86400_000) throw new HttpError(400, "Pick a date within the next year.");
  const city = (e.city?.trim() || me.city || "Atlanta").slice(0, 60);
  const hood = e.neighborhood && NEIGHBORHOODS[e.neighborhood] && city.toLowerCase() === "atlanta" ? e.neighborhood : null;
  const at = hood ? NEIGHBORHOODS[hood] : findCity(city) ?? ATLANTA;
  const [row] = await sql`
    insert into events (school_id, title, description, category, source, host_label, host_profile_id, starts_at, ends_at, city, neighborhood,
      venue_name, venue_address, lat, lng)
    values (${await gatechId()}, ${e.title.trim().slice(0, 80)}, ${e.description?.trim().slice(0, 600) || null}, ${e.category}, 'member',
      ${`${me.firstName} ${me.lastName}`}, ${viewerId}, ${starts}, ${new Date(starts.getTime() + 2 * 3600_000)}, ${city}, ${hood},
      ${e.venueName.trim().slice(0, 120)}, ${e.venueAddress.trim().slice(0, 200)}, ${at.lat}, ${at.lng})
    returning id`;
  await sql`insert into event_rsvps (event_id, profile_id) values (${row.id}, ${viewerId}) on conflict do nothing`; // hosts go to their own event
  return { id: row.id as string };
}

export async function eventCities() {
  const rows = await sql`select city, count(*)::int n from events where school_id = ${await gatechId()} and starts_at >= now() group by city order by n desc, city`;
  return rows.map((r) => ({ city: r.city as string, count: r.n as number }));
}

/** RFC 5545 calendar file for one event. */
export function eventIcs(e: Pick<EventItem, "id" | "title" | "description" | "startsAt" | "endsAt" | "venueName" | "venueAddress" | "externalUrl">) {
  const stamp = (iso: string) => iso.replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
  const end = e.endsAt ?? new Date(new Date(e.startsAt).getTime() + 2 * 3600_000).toISOString();
  return [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Venn//Events//EN", "CALSCALE:GREGORIAN", "BEGIN:VEVENT",
    `UID:${e.id}@venn`, `DTSTAMP:${stamp(new Date().toISOString())}`, `DTSTART:${stamp(e.startsAt)}`, `DTEND:${stamp(end)}`,
    `SUMMARY:${esc(e.title)}`, `LOCATION:${esc(`${e.venueName}, ${e.venueAddress}`)}`,
    `DESCRIPTION:${esc([e.description ?? "", e.externalUrl ? `Register: ${e.externalUrl}` : ""].filter(Boolean).join("\n\n"))}`,
    "END:VEVENT", "END:VCALENDAR", "",
  ].join("\r\n");
}
