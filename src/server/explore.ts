import Supercluster, { type ClusterProperties } from "supercluster";
import { sql } from "./db";
import { PUBLIC_COLUMNS, VISIBLE_PREDICATE, toPublicProfile, type PublicProfile } from "./dto";

export type Filters = {
  industry?: string; city?: string; program?: string; major?: string; role?: string; employer?: string;
  classYearMin?: number; classYearMax?: number; q?: string; claimed?: boolean; openTo?: string;
};

const FILTER_KEYS = ["industry", "city", "program", "major", "role", "employer", "classYearMin", "classYearMax", "q", "claimed", "openTo"] as const;

export function filtersFromSearch(sp: URLSearchParams): Filters {
  const f: Filters = {};
  for (const k of FILTER_KEYS) {
    const v = sp.get(k)?.trim();
    if (!v) continue;
    if (k === "classYearMin" || k === "classYearMax") { const n = Number(v); if (Number.isFinite(n)) f[k] = n; }
    else if (k === "claimed") f.claimed = v === "true";
    else (f as Record<string, string>)[k] = v.slice(0, 100);
  }
  return f;
}

/** Builds a WHERE fragment. `excludeSelf` hides the viewer from their own results. */
export function where(f: Filters, viewerProfileId?: string, omit?: keyof Filters) {
  const has = (k: keyof Filters) => f[k] !== undefined && omit !== k;
  return sql`
    ${sql.unsafe(VISIBLE_PREDICATE)}
    ${viewerProfileId ? sql`and p.id <> ${viewerProfileId}` : sql``}
    ${has("industry") ? sql`and p.industry = ${f.industry!}` : sql``}
    ${has("city") ? sql`and lower(p.city) = lower(${f.city!})` : sql``}
    ${has("program") ? sql`and ${f.program!} = any(p.gt_programs)` : sql``}
    ${has("major") ? sql`and p.major = ${f.major!}` : sql``}
    ${has("role") ? sql`and ${f.role!} = any(p.roles)` : sql``}
    ${has("employer") ? sql`and lower(p.employer) = lower(${f.employer!})` : sql``}
    ${has("classYearMin") ? sql`and p.class_year >= ${f.classYearMin!}` : sql``}
    ${has("classYearMax") ? sql`and p.class_year <= ${f.classYearMax!}` : sql``}
    ${has("claimed") ? sql`and p.status = ${f.claimed ? "claimed" : "unclaimed"}` : sql``}
    ${has("openTo") ? sql`and ${f.openTo!} = any(p.open_to)` : sql``}
    ${has("q") ? sql`and (p.first_name || ' ' || p.last_name || ' ' || coalesce(p.employer,'') || ' ' || coalesce(p.job_title,'') || ' ' || coalesce(p.major,'')) ilike ${"%" + f.q!.replace(/[%_]/g, "") + "%"}` : sql``}
  `;
}

const ACCEPTING = sql`not exists (select 1 from contact_points cp where cp.profile_id = p.id and (cp.do_not_contact or cp.bounced)) as accepting_intros`;

export async function listProfiles(f: Filters, opts: { page?: number; pageSize?: number; viewer?: string } = {}) {
  const pageSize = Math.min(opts.pageSize ?? 24, 60);
  const page = Math.max(1, opts.page ?? 1);
  const rows = await sql`
    select ${sql.unsafe(PUBLIC_COLUMNS)}, ${ACCEPTING}, count(*) over() as total
    from profiles p where ${where(f, opts.viewer)}
    order by (p.status = 'claimed') desc, p.class_year desc nulls last, p.last_name
    limit ${pageSize} offset ${(page - 1) * pageSize}`;
  return {
    total: rows[0] ? Number(rows[0].total) : 0,
    page,
    pageSize,
    profiles: rows.map((r) => toPublicProfile(r)),
  };
}

export type Facet = { value: string; count: number };

export async function facets(f: Filters, viewer?: string): Promise<Record<string, Facet[]>> {
  // Each facet ignores its own filter so chips show alternatives.
  const [industry, program, major, city, role, decade] = await Promise.all([
    sql`select p.industry v, count(*)::int c from profiles p where ${where(f, viewer, "industry")} and p.industry is not null group by 1 order by 2 desc limit 20`,
    sql`select unnest(p.gt_programs) v, count(*)::int c from profiles p where ${where(f, viewer, "program")} group by 1 order by 2 desc limit 20`,
    sql`select p.major v, count(*)::int c from profiles p where ${where(f, viewer, "major")} and p.major is not null group by 1 order by 2 desc limit 25`,
    sql`select p.city v, count(*)::int c from profiles p where ${where(f, viewer, "city")} and p.city is not null group by 1 order by 2 desc limit 25`,
    sql`select unnest(p.roles) v, count(*)::int c from profiles p where ${where(f, viewer, "role")} group by 1 order by 2 desc`,
    sql`select (p.class_year / 10 * 10)::text v, count(*)::int c from profiles p where ${where(f, viewer, "classYearMin")} and p.class_year is not null group by 1 order by 1 desc`,
  ]);
  const m = (rs: { v: string; c: number }[]) => rs.map((r) => ({ value: String(r.v), count: r.c }));
  return { industry: m(industry as never), program: m(program as never), major: m(major as never), city: m(city as never), role: m(role as never), decade: m(decade as never) };
}

export async function industryGroups(f: Filters, viewer?: string) {
  const rows = await sql`
    select coalesce(p.industry, 'Other') industry, count(*)::int n,
      (array_agg(p.id order by (p.status='claimed') desc, p.class_year desc nulls last))[1:6] ids
    from profiles p where ${where(f, viewer)} group by 1 order by 2 desc`;
  return rows.map((r) => ({ industry: r.industry as string, count: r.n as number, sampleIds: r.ids as string[] }));
}

// ---------------------------------------------------------------- companies
export async function companies(f: Filters, viewer?: string) {
  const rows = await sql`
    select p.employer, count(*)::int n, mode() within group (order by p.industry) industry,
      count(*) filter (where p.status = 'claimed')::int claimed
    from profiles p where ${where(f, viewer)} and p.employer is not null
    group by p.employer order by n desc, p.employer limit 80`;
  return rows.map((r) => ({ employer: r.employer as string, count: r.n as number, industry: r.industry as string | null, claimed: r.claimed as number }));
}

export async function companyPeople(employer: string, f: Filters, viewer?: string) {
  const rows = await sql`
    select ${sql.unsafe(PUBLIC_COLUMNS)}, ${ACCEPTING} from profiles p
    where ${where({ ...f, employer }, viewer)} order by p.job_title nulls last, p.last_name limit 200`;
  const groups = new Map<string, PublicProfile[]>();
  for (const r of rows) {
    const t = (r.job_title as string | null) ?? "Role not listed";
    groups.set(t, [...(groups.get(t) ?? []), toPublicProfile(r)]);
  }
  return [...groups.entries()].map(([title, people]) => ({ title, people })).sort((a, b) => b.people.length - a.people.length);
}

// ---------------------------------------------------------------- map
/** Above city level (zoom > 10), clusters of fewer than K people are hidden (k-anonymity). */
export const K_ANON = 3;
export const CITY_ZOOM = 10;

type PointProps = { pid: string };
const indexCache = new Map<string, { at: number; index: Supercluster<PointProps> }>();

async function mapIndex(f: Filters, viewer?: string) {
  const key = JSON.stringify([f, viewer ?? ""]);
  const hit = indexCache.get(key);
  if (hit && Date.now() - hit.at < 60_000) return hit.index;
  const rows = await sql`select p.id, p.lat, p.lng from profiles p where ${where(f, viewer)} and p.lat is not null`;
  const index = new Supercluster<PointProps>({ radius: 60, maxZoom: 16 });
  index.load(rows.map((r) => ({ type: "Feature", properties: { pid: r.id }, geometry: { type: "Point", coordinates: [Number(r.lng), Number(r.lat)] } })));
  indexCache.set(key, { at: Date.now(), index });
  if (indexCache.size > 200) indexCache.delete(indexCache.keys().next().value!);
  return index;
}

export type MapCluster = { id: string; lat: number; lng: number; count: number };

export function applyKAnonymity(features: { count: number }[], zoom: number) {
  return zoom > CITY_ZOOM ? features.filter((c) => c.count >= K_ANON) : features;
}

export async function mapClusters(f: Filters, bbox: [number, number, number, number], zoom: number, viewer?: string) {
  const index = await mapIndex(f, viewer);
  const z = Math.max(0, Math.min(16, Math.floor(zoom)));
  const raw = index.getClusters(bbox, z).map((c) => {
    const props = c.properties as ClusterProperties & PointProps;
    const isCluster = Boolean(props.cluster);
    return {
      id: isCluster ? `c:${props.cluster_id}` : `p:${props.pid}`,
      lng: c.geometry.coordinates[0],
      lat: c.geometry.coordinates[1],
      count: isCluster ? props.point_count : 1,
    };
  });
  const visible = applyKAnonymity(raw, z);
  return { clusters: visible as MapCluster[], hidden: raw.reduce((a, c) => a + c.count, 0) - visible.reduce((a, c) => a + c.count, 0) };
}

/** People inside a cluster, for the side list. Refuses clusters that k-anonymity hides. */
export async function clusterPeople(f: Filters, clusterId: string, zoom: number, viewer?: string) {
  let ids: string[];
  if (clusterId.startsWith("c:")) {
    const index = await mapIndex(f, viewer);
    ids = index.getLeaves(Number(clusterId.slice(2)), 200).map((l) => (l.properties as PointProps).pid);
  } else ids = [clusterId.slice(2)];
  if (applyKAnonymity([{ count: ids.length }], Math.floor(zoom)).length === 0) return [];
  const rows = await sql`select ${sql.unsafe(PUBLIC_COLUMNS)}, ${ACCEPTING} from profiles p where ${where(f, viewer)} and p.id = any(${ids})`;
  return rows.map((r) => toPublicProfile(r));
}

// ---------------------------------------------------------------- near me
export type NearbyOrigin = { lat: number; lng: number; label: string; source: "device" | "profile" | "campus" };

/** Coarse distance bands (never exact distances) so no one can be trilaterated. */
export function distanceBand(km: number): string {
  if (km < 5) return "Within 5 km";
  if (km < 25) return "5–25 km away";
  if (km < 100) return "25–100 km away";
  if (km < 500) return "100–500 km away";
  return "500+ km away";
}

/** Where "near me" is measured from: the device location (rounded to ~1 km), else the viewer's profile city, else campus. */
export async function nearbyOrigin(viewer: string, lat?: number, lng?: number): Promise<NearbyOrigin> {
  if (lat != null && lng != null && Math.abs(lat) <= 90 && Math.abs(lng) <= 180) {
    return { lat: Math.round(lat * 100) / 100, lng: Math.round(lng * 100) / 100, label: "your location", source: "device" };
  }
  const { findCity, ATLANTA } = await import("./geo");
  const [me] = await sql`select city, state from profiles where id = ${viewer}`;
  const c = findCity(me?.city, me?.state);
  if (c) return { lat: c.lat, lng: c.lng, label: `${c.city} (your profile city)`, source: "profile" };
  return { lat: ATLANTA.lat, lng: ATLANTA.lng, label: "Georgia Tech campus", source: "campus" };
}

export async function nearbyPeople(f: Filters, origin: NearbyOrigin, viewer: string, limit = 30) {
  const dist = sql`(6371 * 2 * asin(sqrt(
      power(sin(radians((p.lat::float8 - ${origin.lat}::float8) / 2)), 2)
      + cos(radians(${origin.lat}::float8)) * cos(radians(p.lat::float8)) * power(sin(radians((p.lng::float8 - ${origin.lng}::float8) / 2)), 2))))`;
  const rows = await sql`
    select ${sql.unsafe(PUBLIC_COLUMNS)}, ${ACCEPTING}, ${dist} as km
    from profiles p where ${where(f, viewer)} and p.lat is not null
    order by km asc, (p.status = 'claimed') desc, p.last_name limit ${Math.min(limit, 50)}`;
  const [{ n }] = await sql`select count(*)::int n from profiles p where ${where(f, viewer)} and p.lat is not null and ${dist} < 25`;
  return {
    within25km: n as number,
    people: rows.map((r) => ({ profile: toPublicProfile(r), band: distanceBand(Number(r.km)) })),
  };
}
