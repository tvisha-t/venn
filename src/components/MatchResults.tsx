"use client";
// Goal results: Handshake-style split view with List · Map · Companies (§12.2).
import { useEffect, useMemo, useState } from "react";
import { Building2, ChevronRight, UserRoundSearch } from "lucide-react";
import { ResultRow } from "@/components/ResultRow";
import { ProfileDetail } from "@/components/ProfileDetail";
import { ProfileSheet } from "@/components/ProfileSheet";
import { IntroComposer } from "@/components/IntroComposer";
import { ClusterMap, type Cluster } from "@/components/ClusterMap";
import { EmptyState } from "@/components/states";
import { FilterPill, Segmented, SplitView } from "@/components/ui-kit";
import { api, type Match, type PublicProfile } from "@/lib/api";
import { cn } from "@/lib/utils";

type View = "list" | "map" | "companies";
let cityCache: Promise<{ cities: { city: string; state: string; lat: number; lng: number }[] }> | null = null;

export function MatchResults({ matches, goalId, onChanged }: { matches: Match[]; goalId: string; onChanged?: () => void }) {
  const [view, setView] = useState<View>("list");
  const [program, setProgram] = useState<string | null>(null);
  const [sel, setSel] = useState(0);
  const [compose, setCompose] = useState<PublicProfile | null>(null);
  const [sheet, setSheet] = useState<string | null>(null);

  const programs = useMemo(() => {
    const c = new Map<string, number>();
    for (const m of matches) for (const p of m.profile.gtPrograms) c.set(p, (c.get(p) ?? 0) + 1);
    return [...c.entries()].sort((a, b) => b[1] - a[1]).map(([value, count]) => ({ value, count }));
  }, [matches]);
  const shown = program ? matches.filter((m) => m.profile.gtPrograms.includes(program)) : matches;
  useEffect(() => setSel(0), [program, matches]);

  if (!matches.length) {
    return <EmptyState title="No matches yet" icon={UserRoundSearch}>Try a broader goal, or browse everyone in Explore.</EmptyState>;
  }

  const current = shown[Math.min(sel, shown.length - 1)];

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Segmented<View> label="Results view" value={view} onChange={setView}
          options={[{ value: "list", label: "List" }, { value: "map", label: "Map" }, { value: "companies", label: "Companies" }]} />
        {programs.length > 0 && <FilterPill label="Program" value={program} onChange={setProgram} options={programs} />}
        <span className="ml-auto text-meta text-ink-2">{shown.length} {shown.length === 1 ? "person" : "people"}</span>
      </div>

      {view === "list" && (
        <SplitView
          label="Matches" count={shown.length} selectedIndex={sel} onSelectIndex={setSel}
          empty={<EmptyState title="No matches in that program" />}
          renderRow={(i, ref) => {
            const m = shown[i];
            return <ResultRow key={m.profile.id} ref={ref} profile={m.profile} reason={m.reason} isNew={m.isNew} selected={i === sel} onSelect={() => setSel(i)} />;
          }}
          detail={current && <ProfileDetail key={current.profile.id} id={current.profile.id} reason={current.reason} onRequest={setCompose} />}
        />
      )}

      {view === "map" && <CityMap matches={shown} onOpen={setSheet} />}
      {view === "companies" && <CompanyGroups matches={shown} onOpen={setSheet} />}

      <ProfileSheet id={sheet} onClose={() => setSheet(null)} onRequest={(p) => { setSheet(null); setCompose(p); }} />
      <IntroComposer recipient={compose} goalId={goalId} onClose={() => setCompose(null)} onSent={onChanged} />
    </div>
  );
}

/** Goal results on the map, grouped by city (per-person coordinates are never sent to the client). */
function CityMap({ matches, onOpen }: { matches: Match[]; onOpen: (id: string) => void }) {
  const [list, setList] = useState<Match[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);

  async function groups() {
    cityCache ??= api("/api/cities");
    const { cities } = await cityCache;
    const g = new Map<string, { c: Cluster; ms: Match[] }>();
    for (const m of matches) {
      const c = cities.find((x) => x.city === m.profile.city && (!m.profile.state || x.state === m.profile.state)) ?? cities.find((x) => x.city === m.profile.city);
      if (!c) continue;
      const k = `${c.city}|${c.state}`;
      const e = g.get(k) ?? { c: { id: k, lat: c.lat, lng: c.lng, count: 0, label: c.city }, ms: [] };
      e.c.count++; e.ms.push(m); g.set(k, e);
    }
    return g;
  }

  return (
    <div className="grid items-start gap-4 min-[900px]:grid-cols-[minmax(0,1fr)_360px]">
      <ClusterMap
        reloadKey={matches.map((m) => m.profile.id).join()}
        selectedId={selected}
        load={async () => ({ clusters: [...(await groups()).values()].map((e) => e.c) })}
        onSelect={async (c) => { setSelected(c.id); setList((await groups()).get(c.id)?.ms ?? []); }}
      />
      <aside aria-label="People in the selected city" className="overflow-hidden rounded-lg border bg-surface">
        <p className="border-b px-4 py-2.5 text-[13px] font-medium text-ink-2">{list ? `${list.length} in ${selected?.split("|")[0]}` : "Select a city on the map"}</p>
        {list ? (
          <div role="listbox" aria-label="People" className="max-h-[420px] divide-y overflow-y-auto">
            {list.map((m) => <ResultRow key={m.profile.id} profile={m.profile} reason={m.reason} onSelect={() => onOpen(m.profile.id)} />)}
          </div>
        ) : <p className="px-4 py-6 text-ink-2">Results are grouped by city.</p>}
      </aside>
    </div>
  );
}

function CompanyGroups({ matches, onOpen }: { matches: Match[]; onOpen: (id: string) => void }) {
  const companies = useMemo(() => {
    const g = new Map<string, Match[]>();
    for (const m of matches) { const k = m.profile.employer ?? "Role not listed"; g.set(k, [...(g.get(k) ?? []), m]); }
    return [...g.entries()].sort((a, b) => b[1].length - a[1].length);
  }, [matches]);
  const [sel, setSel] = useState(0);
  const [name, people] = companies[Math.min(sel, companies.length - 1)] ?? ["", []];

  return (
    <div className="grid items-start gap-4 min-[900px]:grid-cols-[minmax(280px,340px)_minmax(0,1fr)]">
      <ul role="listbox" aria-label="Companies" className="divide-y overflow-hidden rounded-lg border bg-surface">
        {companies.map(([c, ms], i) => (
          <li key={c}>
            <button role="option" aria-selected={i === sel} onClick={() => setSel(i)}
              className={cn("flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-muted/60", i === sel && "bg-brand-tint hover:bg-brand-tint")}>
              <span className="grid size-8 place-items-center rounded-md bg-muted"><Building2 className="size-4 text-ink-2" aria-hidden /></span>
              <span className="min-w-0 flex-1"><span className="block truncate font-medium">{c}</span><span className="text-meta text-ink-2">{ms.length} {ms.length === 1 ? "Yellow Jacket" : "Yellow Jackets"}</span></span>
              <ChevronRight className="size-4 text-ink-3" aria-hidden />
            </button>
          </li>
        ))}
      </ul>
      <section aria-label={name} className="overflow-hidden rounded-lg border bg-surface">
        <h3 className="border-b px-4 py-3 text-cardtitle">{name}</h3>
        <div role="listbox" aria-label={`People at ${name}`} className="divide-y">
          {people.map((m) => <ResultRow key={m.profile.id} profile={m.profile} reason={m.reason} onSelect={() => onOpen(m.profile.id)} />)}
        </div>
      </section>
    </div>
  );
}
