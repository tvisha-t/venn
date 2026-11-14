"use client";
import { useEffect, useState } from "react";
import { ChevronDown, MapPin, Search } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { CATEGORY_CHIPS } from "./format";

export type Range = "week" | "month" | "going";

export function CategoryChips({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div role="radiogroup" aria-label="Event type" className="-mx-5 flex gap-2 overflow-x-auto px-5 pb-1 sm:mx-0 sm:px-0 [scrollbar-width:none]">
      {CATEGORY_CHIPS.map((c) => {
        const on = value === c.key;
        return (
          <button
            key={c.key} type="button" role="radio" aria-checked={on} onClick={() => onChange(c.key)}
            className={cn(
              "inline-flex h-10 shrink-0 items-center rounded-full px-4 text-body-sm font-semibold transition-colors",
              on ? "bg-primary text-on-primary" : "border border-line bg-surface text-text hover:bg-surface-raised",
            )}
          >
            {c.label}
          </button>
        );
      })}
    </div>
  );
}

export function RangeToggle({ value, onChange, goingCount }: { value: Range; onChange: (v: Range) => void; goingCount: number }) {
  const opts: { key: Range; label: React.ReactNode }[] = [
    { key: "week", label: "This week" },
    { key: "month", label: "This month" },
    { key: "going", label: <>Going <span className="font-mono">{goingCount}</span></> },
  ];
  return (
    <div role="radiogroup" aria-label="When" className="inline-flex rounded-md bg-surface-raised p-1">
      {opts.map((o) => (
        <button
          key={o.key} type="button" role="radio" aria-checked={value === o.key} onClick={() => onChange(o.key)}
          className={cn("h-9 rounded-sm px-3 text-body-sm font-semibold transition-colors sm:px-4",
            value === o.key ? "bg-surface text-text shadow-card" : "text-text-muted hover:text-text")}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** City pill: cities that have events, plus a free-text "Search a city…". */
export function CitySwitcher({ city, onChange }: { city: string; onChange: (c: string) => void }) {
  const [open, setOpen] = useState(false);
  const [cities, setCities] = useState<{ city: string; count: number }[] | null>(null);
  const [q, setQ] = useState("");
  useEffect(() => {
    if (open && !cities) api<{ cities: { city: string; count: number }[] }>("/api/events/cities").then((r) => setCities(r.cities)).catch(() => setCities([]));
  }, [open, cities]);
  const pick = (c: string) => { onChange(c); setOpen(false); setQ(""); };
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button type="button" className="inline-flex h-10 items-center gap-1.5 rounded-full border border-line bg-surface px-3.5 text-body-sm font-semibold text-text hover:bg-surface-raised" aria-label={`City: ${city}. Change city`}>
          <MapPin className="size-4 text-text-muted" aria-hidden /> {city} <ChevronDown className="size-4 text-text-muted" aria-hidden />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 rounded-md p-2 shadow-pop">
        <ul className="max-h-60 overflow-y-auto">
          {(cities ?? []).map((c) => (
            <li key={c.city}>
              <button type="button" onClick={() => pick(c.city)} className="flex h-11 w-full items-center justify-between rounded-sm px-3 text-left text-body-sm hover:bg-surface-raised">
                <span className={c.city === city ? "font-semibold" : undefined}>{c.city}</span>
                <span className="font-mono text-[12px] text-text-subtle">{c.count}</span>
              </button>
            </li>
          ))}
          {cities && cities.length === 0 && <li className="px-3 py-2 text-body-sm text-text-muted">No cities with events yet.</li>}
        </ul>
        <form className="mt-1 flex items-center gap-2 border-t border-line px-2 pt-2" onSubmit={(e) => { e.preventDefault(); if (q.trim()) pick(q.trim()); }}>
          <Search className="size-4 text-text-subtle" aria-hidden />
          <label htmlFor="city-search" className="sr-only">Search a city</label>
          <input id="city-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search a city…" className="h-10 min-w-0 flex-1 bg-transparent text-body-sm outline-none" />
        </form>
      </PopoverContent>
    </Popover>
  );
}
