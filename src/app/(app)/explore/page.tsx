"use client";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Building2, ChevronRight, Globe2, Loader2, LocateFixed, MapPin, Search, UserRoundSearch } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ResultRow } from "@/components/ResultRow";
import { ProfileDetail } from "@/components/ProfileDetail";
import { ProfileSheet } from "@/components/ProfileSheet";
import { IntroComposer } from "@/components/IntroComposer";
import { ClusterMap, type Cluster, type MapFocus } from "@/components/ClusterMap";
import { EmptyState, ErrorState, LoadingRows } from "@/components/states";
import { FilterPill, Segmented, SplitView } from "@/components/ui-kit";
import { api, qs, ROLE_LABEL, type PublicProfile } from "@/lib/api";
import { cn } from "@/lib/utils";

type Facet = { value: string; count: number };
type ListResp = { total: number; page: number; pageSize: number; profiles: PublicProfile[]; facets: Record<string, Facet[]> | null };
type View = "list" | "map" | "companies";
const FILTERS = ["industry", "city", "program", "major", "role", "classYearMin", "classYearMax", "q", "claimed"] as const;

function Explore() {
  const sp = useSearchParams();
  const router = useRouter();
  const path = usePathname();
  const view = (sp.get("view") ?? "list") as View;
  const filters = useMemo(() => Object.fromEntries(FILTERS.map((k) => [k, sp.get(k) ?? ""]).filter(([, v]) => v)) as Record<string, string>, [sp]);
  const fq = qs(filters);

  const [profiles, setProfiles] = useState<PublicProfile[] | null>(null);
  const [total, setTotal] = useState(0);
  const [facets, setFacets] = useState<Record<string, Facet[]> | null>(null);
  const [page, setPage] = useState(1);
  const [more, setMore] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [sel, setSel] = useState(0);
  const [compose, setCompose] = useState<PublicProfile | null>(null);
  const [sheet, setSheet] = useState<string | null>(null);
  const [q, setQ] = useState(sp.get("q") ?? "");

  const setParam = useCallback((patch: Record<string, string | null>) => {
    const next = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(patch)) v ? next.set(k, v) : next.delete(k);
    router.replace(`${path}?${next.toString()}`, { scroll: false });
  }, [sp, router, path]);

  const load = useCallback(() => {
    setErr(null); setProfiles(null); setSel(0); setPage(1);
    api<ListResp>(`/api/explore/list${qs({ ...filters, page: 1 })}`)
      .then((r) => { setProfiles(r.profiles); setTotal(r.total); setFacets(r.facets); })
      .catch((e) => setErr(e.message));
  }, [fq]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(load, [load]);

  async function loadMore() {
    setMore(true);
    try {
      const r = await api<ListResp>(`/api/explore/list${qs({ ...filters, page: page + 1, facets: 0 })}`);
      setProfiles((p) => [...(p ?? []), ...r.profiles]); setPage(page + 1);
    } catch (e) { setErr((e as Error).message); }
    setMore(false);
  }

  const f = facets;
  const decadeValue = sp.get("classYearMin");
  const activeCount = Object.keys(filters).length;
  const current = profiles?.[Math.min(sel, (profiles?.length ?? 1) - 1)];

  // Active filters first, so they stay visible when the row scrolls on phones.
  const pills = [
    { label: "Role", value: sp.get("role"), onChange: (v: string | null) => setParam({ role: v }), options: (f?.role ?? []).map((o) => ({ ...o, label: ROLE_LABEL[o.value] ?? o.value })) },
    { label: "Industry", value: sp.get("industry"), onChange: (v: string | null) => setParam({ industry: v }), options: f?.industry ?? [] },
    { label: "Program", value: sp.get("program"), onChange: (v: string | null) => setParam({ program: v }), options: f?.program ?? [] },
    { label: "City", value: sp.get("city"), onChange: (v: string | null) => setParam({ city: v }), options: f?.city ?? [] },
    {
      label: "Class year", value: decadeValue, options: (f?.decade ?? []).map((o) => ({ ...o, label: `${o.value}s` })),
      onChange: (v: string | null) => setParam(v ? { classYearMin: v, classYearMax: String(Number(v) + 9) } : { classYearMin: null, classYearMax: null }),
    },
    { label: "Major", value: sp.get("major"), onChange: (v: string | null) => setParam({ major: v }), options: f?.major ?? [] },
  ].sort((a, b) => Number(!!b.value) - Number(!!a.value));

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-title">Explore</h1>
          <p className="mt-1 text-ink-2">{profiles ? `${total.toLocaleString()} Yellow Jackets${activeCount ? " match your filters" : ""}` : "Browse the GT network"}</p>
        </div>
        <Segmented<View> label="View" value={view} onChange={(v) => setParam({ view: v === "list" ? null : v })}
          options={[{ value: "list", label: "List" }, { value: "map", label: "Map" }, { value: "companies", label: "Companies" }]} />
      </header>

      {/* One row of pill dropdowns; scrolls horizontally on small screens */}
      <div className="-mx-4 flex items-center gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0" aria-label="Filters" role="group">
        <form className="relative shrink-0" role="search" onSubmit={(e) => { e.preventDefault(); setParam({ q: q.trim() || null }); }}>
          <label htmlFor="q" className="sr-only">Search by name, company, title or major</label>
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-ink-3" aria-hidden />
          <input id="q" value={q} onChange={(e) => setQ(e.target.value)} onBlur={() => (q.trim() || null) !== (sp.get("q") || null) && setParam({ q: q.trim() || null })}
            placeholder="Search people" className="h-8 w-44 rounded-full border bg-surface pl-8 pr-3 text-[13px] outline-none focus:border-brand/30" />
        </form>
        {pills.map((pill) => <FilterPill key={pill.label} loading={!f} {...pill} />)}
        {activeCount > 0 && (
          <button className="shrink-0 px-2 text-[13px] font-medium text-brand hover:underline" onClick={() => { setQ(""); router.replace(`${path}${view !== "list" ? `?view=${view}` : ""}`); }}>
            Clear all
          </button>
        )}
      </div>

      {err && <ErrorState message={err} onRetry={load} />}

      {view === "list" && (
        <>
          {!profiles && !err && <LoadingRows />}
          {profiles && (
            <SplitView
              label="People" count={profiles.length} selectedIndex={sel} onSelectIndex={setSel}
              empty={
                <EmptyState title="No one matches all of these filters" icon={UserRoundSearch}
                  action={<Button variant="outline" onClick={() => router.replace(path)}>Clear filters</Button>}>
                  Try removing a filter. The network is bigger than it looks.
                </EmptyState>
              }
              renderRow={(i, ref) => {
                const p = profiles[i];
                return <ResultRow key={p.id} ref={ref} profile={p} selected={i === sel} onSelect={() => setSel(i)} />;
              }}
              detail={current && <ProfileDetail key={current.id} id={current.id} onRequest={setCompose} />}
              footer={profiles.length < total && (
                <div className="border-t p-2">
                  <Button variant="ghost" className="w-full" onClick={loadMore} disabled={more}>{more ? "Loading…" : `Load more (${total - profiles.length} more)`}</Button>
                </div>
              )}
            />
          )}
        </>
      )}
      {view === "map" && <MapView filters={filters} onOpen={setSheet} />}
      {view === "companies" && <CompaniesView filters={filters} onOpen={setSheet} />}

      <ProfileSheet id={sheet} onClose={() => setSheet(null)} onRequest={(p) => { setSheet(null); setCompose(p); }} />
      <IntroComposer recipient={compose} onClose={() => setCompose(null)} />
    </div>
  );
}

type Nearby = {
  origin: { lat: number; lng: number; label: string; source: "device" | "profile" | "campus" };
  within25km: number;
  people: { profile: PublicProfile; band: string }[];
};
type Locate = "idle" | "locating" | "denied" | "unsupported" | "ok";

function bandGroups<T extends { band: string }>(rows: T[]): [string, T[]][] {
  const out: [string, T[]][] = [];
  for (const r of rows) {
    const last = out[out.length - 1];
    if (last && last[0] === r.band) last[1].push(r); else out.push([r.band, [r]]);
  }
  return out;
}

function MapView({ filters, onOpen }: { filters: Record<string, string>; onOpen: (id: string) => void }) {
  const [nearby, setNearby] = useState<Nearby | null>(null);
  const [nearErr, setNearErr] = useState<string | null>(null);
  const [locate, setLocate] = useState<Locate>("idle");
  const [device, setDevice] = useState<{ lat: number; lng: number } | null>(null);
  const [focus, setFocus] = useState<MapFocus | null>(null);
  const [people, setPeople] = useState<PublicProfile[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [groupSize, setGroupSize] = useState(0);
  const [loading, setLoading] = useState(false);
  const fq = JSON.stringify(filters);

  const loadNearby = useCallback(async (pos?: { lat: number; lng: number }) => {
    setNearErr(null);
    try {
      const r = await api<Nearby>(`/api/explore/nearby${qs({ ...filters, lat: pos?.lat, lng: pos?.lng })}`);
      setNearby(r);
      return r;
    } catch (e) { setNearErr((e as Error).message); return null; }
  }, [fq]); // eslint-disable-line react-hooks/exhaustive-deps

  // Start near the viewer's profile city (no location prompt until they ask).
  useEffect(() => { loadNearby(device ?? undefined); }, [loadNearby]); // eslint-disable-line react-hooks/exhaustive-deps

  function useMyLocation() {
    if (!("geolocation" in navigator)) { setLocate("unsupported"); return; }
    setLocate("locating");
    navigator.geolocation.getCurrentPosition(
      async (p) => {
        // Round to ~1 km in the browser before it goes anywhere.
        const pos = { lat: Math.round(p.coords.latitude * 100) / 100, lng: Math.round(p.coords.longitude * 100) / 100 };
        setDevice(pos);
        setLocate("ok");
        setPeople(null); setSelected(null);
        await loadNearby(pos);
        setFocus({ ...pos, zoom: 10, key: `device-${pos.lat},${pos.lng}` });
      },
      () => setLocate("denied"),
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 5 * 60_000 },
    );
  }

  if (!nearby && !nearErr) return <LoadingRows n={4} label="Finding people near you" />;
  const origin = nearby?.origin ?? { lat: 33.7756, lng: -84.3963, label: "Georgia Tech campus", source: "campus" as const };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <p className="flex items-center gap-1.5 text-[14px]">
          <MapPin className="size-4 text-petal-text" aria-hidden />
          Showing people near <strong className="font-semibold">{origin.label}</strong>
          {nearby && <span className="text-ink-2">· {nearby.within25km} within 25 km</span>}
        </p>
        <div className="ml-auto flex gap-2">
          <Button size="sm" variant="outline" onClick={useMyLocation} disabled={locate === "locating"}>
            {locate === "locating" ? <Loader2 className="animate-spin" /> : <LocateFixed />} {locate === "ok" ? "Update my location" : "Use my location"}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setFocus({ lat: 37.5, lng: -96, zoom: 3.2, key: `all-${Date.now()}` })}>
            <Globe2 /> Show everywhere
          </Button>
        </div>
      </div>
      {locate === "denied" && <p role="status" className="rounded-lg bg-warn-bg px-3 py-2 text-[13px] text-warn">Location is blocked for this site, so we&apos;re using your profile city. You can allow location in your browser settings.</p>}
      {locate === "unsupported" && <p role="status" className="rounded-lg bg-muted px-3 py-2 text-[13px] text-ink-2">This browser can&apos;t share location. Showing people near your profile city.</p>}
      {nearErr && <ErrorState message={nearErr} onRetry={() => loadNearby(device ?? undefined)} />}

      <div className="grid items-start gap-4 min-[900px]:grid-cols-[minmax(0,1fr)_360px]">
        <ClusterMap
          reloadKey={fq} selectedId={selected}
          center={[origin.lng, origin.lat]} initialZoom={9}
          focus={focus} me={device}
          load={(bbox, zoom) => api(`/api/explore/map${qs({ ...filters, bbox: bbox.map((n) => n.toFixed(4)).join(","), zoom: zoom.toFixed(2) })}`)}
          onSelect={async (c: Cluster, zoom) => {
            setSelected(c.id); setGroupSize(c.count); setLoading(true);
            try { setPeople((await api<{ people: PublicProfile[] }>(`/api/explore/map${qs({ ...filters, cluster: c.id, zoom: zoom.toFixed(2) })}`)).people); }
            catch { setPeople([]); }
            setLoading(false);
          }}
        />
        <aside aria-label={people ? "People in the selected group" : "Closest to you"} className="overflow-hidden rounded-lg border bg-surface">
          <div className="flex items-center justify-between gap-2 border-b px-4 py-2.5">
            <p className="text-[13px] font-medium text-ink-2">
              {people
                ? (people.length < groupSize ? `Showing ${people.length} of ${groupSize} in this group` : `${people.length} ${people.length === 1 ? "person" : "people"} in this group`)
                : "Closest to you"}
            </p>
            {people && <button className="text-[13px] font-medium text-brand hover:underline" onClick={() => { setPeople(null); setSelected(null); }}>Closest to you</button>}
          </div>
          {loading && <LoadingRows n={3} />}
          {!loading && people?.length === 0 && <p className="px-4 py-6 text-ink-2">This group is too small to show at this zoom. Zoom out a little.</p>}
          {!loading && people && people.length > 0 && (
            <div role="listbox" aria-label="People" className="max-h-[480px] divide-y overflow-y-auto">
              {people.map((p) => <ResultRow key={p.id} profile={p} onSelect={() => onOpen(p.id)} />)}
            </div>
          )}
          {!loading && !people && nearby && (
            nearby.people.length === 0 ? <p className="px-4 py-6 text-ink-2">No one with a location matches these filters.</p> : (
              <div role="listbox" aria-label="Closest to you" className="max-h-[480px] overflow-y-auto">
                {bandGroups(nearby.people).map(([band, rows]) => (
                  <div key={band} role="group" aria-label={band}>
                    <p className="bg-muted/60 px-4 py-1.5 text-[12px] font-medium text-ink-2" aria-hidden>{band}</p>
                    <div className="divide-y">{rows.map(({ profile: p }) => <ResultRow key={p.id} profile={p} onSelect={() => onOpen(p.id)} />)}</div>
                  </div>
                ))}
              </div>
            )
          )}
        </aside>
      </div>
      <p className="text-meta text-ink-2">Your location stays approximate (about 1 km) and is never saved. Distances are shown as ranges, not exact numbers.</p>
    </div>
  );
}

type Company = { employer: string; count: number; industry: string | null; claimed: number };

function CompaniesView({ filters, onOpen }: { filters: Record<string, string>; onOpen: (id: string) => void }) {
  const [rows, setRows] = useState<Company[] | null>(null);
  const [sel, setSel] = useState<string | null>(null);
  const [groups, setGroups] = useState<{ title: string; people: PublicProfile[] }[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const fq = JSON.stringify(filters);
  const peopleRef = useRef<HTMLElement>(null);
  const pick = (employer: string) => {
    setSel(employer);
    if (window.matchMedia("(max-width: 899px)").matches) setTimeout(() => peopleRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
  };

  useEffect(() => {
    setRows(null); setErr(null);
    api<{ companies: Company[] }>(`/api/explore/companies${qs(filters)}`)
      .then((r) => { setRows(r.companies); setSel(r.companies[0]?.employer ?? null); })
      .catch((e) => setErr(e.message));
  }, [fq]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!sel) return;
    setGroups(null);
    api<{ groups: { title: string; people: PublicProfile[] }[] }>(`/api/explore/companies${qs({ ...filters, company: sel })}`)
      .then((r) => setGroups(r.groups)).catch((e) => setErr(e.message));
  }, [sel, fq]); // eslint-disable-line react-hooks/exhaustive-deps

  if (err) return <ErrorState message={err} />;
  if (!rows) return <LoadingRows />;
  if (!rows.length) return <EmptyState title="No companies match these filters" icon={Building2} />;
  return (
    <div className="grid items-start gap-4 min-[900px]:grid-cols-[minmax(280px,360px)_minmax(0,1fr)]">
      <ul role="listbox" aria-label="Companies" className="divide-y overflow-hidden rounded-lg border bg-surface min-[900px]:max-h-[calc(100vh-260px)] min-[900px]:overflow-y-auto">
        {rows.map((c) => (
          <li key={c.employer}>
            <button role="option" aria-selected={c.employer === sel} onClick={() => pick(c.employer)}
              className={cn("flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-muted/60", c.employer === sel && "bg-brand-tint hover:bg-brand-tint")}>
              <span className="grid size-8 shrink-0 place-items-center rounded-md bg-muted"><Building2 className="size-4 text-ink-2" aria-hidden /></span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{c.employer}</span>
                <span className="text-meta text-ink-2">{c.count} {c.count === 1 ? "Yellow Jacket" : "Yellow Jackets"}{c.industry ? ` · ${c.industry}` : ""}</span>
              </span>
              <ChevronRight className="size-4 shrink-0 text-ink-3" aria-hidden />
            </button>
          </li>
        ))}
      </ul>
      <section ref={peopleRef} aria-label={sel ?? "Company"} className="scroll-mt-20 overflow-hidden rounded-lg border bg-surface">
        <header className="border-b px-5 py-4">
          <h2 className="text-cardtitle">{sel}</h2>
          {groups && <p className="text-meta text-ink-2">{groups.reduce((a, g) => a + g.people.length, 0)} people · grouped by title</p>}
        </header>
        {!groups && <div className="p-4"><LoadingRows n={3} /></div>}
        {groups?.map((g) => (
          <div key={g.title}>
            <h3 className="bg-muted/50 px-5 py-2 text-[13px] font-medium text-ink-2">{g.title} · {g.people.length}</h3>
            <div role="listbox" aria-label={g.title} className="divide-y">
              {g.people.map((p) => <ResultRow key={p.id} profile={p} onSelect={() => onOpen(p.id)} />)}
            </div>
          </div>
        ))}
      </section>
    </div>
  );
}

export default function Page() {
  return <Suspense fallback={<LoadingRows />}><Explore /></Suspense>;
}
