"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarDays } from "lucide-react";
import { api } from "@/lib/api";
import { useMe } from "@/components/AppShell";
import { ErrorState, LoadingRows } from "@/components/states";
import { Skeleton } from "@/components/ui/skeleton";
import type { EventItem } from "@/server/events";
import { EventRow } from "@/components/events/EventRow";
import { FeaturedEventCard } from "@/components/events/FeaturedEventCard";
import { CategoryChips, CitySwitcher, RangeToggle, type Range } from "@/components/events/Filters";
import { EventsMap } from "@/components/events/EventsMap";
import { HostCard } from "@/components/events/HostCard";
import { rsvpToggle } from "@/components/events/useRsvp";

type Data = { city: string; range: Range; goingCount: number; events: EventItem[] };

export default function EventsPage() {
  const { me } = useMe();
  const [city, setCity] = useState<string | null>(null);
  const [range, setRange] = useState<Range>("month");
  const [category, setCategory] = useState("all");
  const [data, setData] = useState<Data | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [hover, setHover] = useState<string | null>(null);

  const load = useCallback(() => {
    setErr(null);
    const qs = new URLSearchParams({ range, category });
    if (city) qs.set("city", city);
    api<Data>(`/api/events?${qs}`).then((d) => { setData(d); if (!city) setCity(d.city); }).catch((e) => setErr((e as Error).message));
  }, [city, range, category]);
  useEffect(load, [load]);

  // Optimistic RSVP: flip state and counts locally; useRsvp reverts on failure.
  const toggle = useCallback((ev: EventItem) => {
    rsvpToggle(ev, (going, delta) => setData((d) => d && ({
      ...d,
      goingCount: Math.max(0, d.goingCount + delta),
      events: d.events.map((e) => (e.id === ev.id ? { ...e, meGoing: going, going: Math.max(0, e.going + delta) } : e)),
    })));
  }, []);

  const featured = useMemo(() => {
    if (!data || range === "going" || data.events.length === 0) return null;
    return data.events.find((e) => e.isFeatured) ?? [...data.events].sort((a, b) => b.going - a.going)[0];
  }, [data, range]);
  const list = useMemo(() => (data?.events ?? []).filter((e) => e.id !== featured?.id), [data, featured]);
  const shownCity = city ?? me?.profile.city ?? "Atlanta";
  const heading = range === "going" ? "You're going" : range === "week" ? "This week" : "Coming up";
  const featuredLabel = range === "week" ? "Biggest this week" : "Biggest this month";

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h1 className="text-[28px] font-extrabold leading-[34px] tracking-[-0.03em] md:text-[30px] md:leading-9">
            <span className="md:hidden">Events</span><span className="hidden md:inline">Events near you</span>
          </h1>
          <CitySwitcher city={shownCity} onChange={(c) => { setData(null); setCity(c); }} />
        </div>
        <RangeToggle value={range} onChange={(r) => { setRange(r); }} goingCount={data?.goingCount ?? 0} />
      </div>

      <CategoryChips value={category} onChange={setCategory} />

      {err && <ErrorState message={err} onRetry={load} />}

      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0 space-y-5">
          {!data && !err && (
            <>
              <Skeleton className="h-44 w-full rounded-xl" />
              <LoadingRows n={4} label="Loading events" />
            </>
          )}
          {data && featured && <FeaturedEventCard event={featured} label={featuredLabel} onToggle={toggle} />}
          {data && data.events.length === 0 && (
            <div className="rounded-lg border border-line bg-surface p-6 text-center shadow-card">
              <CalendarDays className="mx-auto size-6 text-text-subtle" aria-hidden />
              <p className="mt-2 text-title-3">
                {range === "going" ? "You haven't RSVP'd to anything yet" : `No Jacket events in ${shownCity} ${range === "week" ? "this week" : "this month"}`}
              </p>
              {range !== "going" && <HostCard city={shownCity} compact className="mx-auto mt-4 max-w-xs border-0 p-0" />}
            </div>
          )}
          {data && list.length > 0 && (
            <section aria-labelledby="list-h" className="space-y-3">
              <h2 id="list-h" className="text-title-2">{heading}</h2>
              <ol className="space-y-3">
                {list.map((e, i) => (
                  <EventRow key={e.id} event={e} index={i} active={hover === e.id} onHover={setHover} onToggle={toggle} />
                ))}
              </ol>
            </section>
          )}
        </div>

        <aside className="space-y-5" aria-label="Map and hosting">
          <div className="hidden lg:block">
            {data && data.events.length > 0 && <EventsMap events={data.events} featuredId={featured?.id ?? null} activeId={hover} onHover={setHover} />}
          </div>
          {data && data.events.length > 0 && <HostCard city={shownCity} />}
        </aside>
      </div>
    </div>
  );
}
