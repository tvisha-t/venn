"use client";
// Display helpers computed in the browser from data the page already has.
import { useEffect, useState } from "react";
import type { PublicProfile } from "@/lib/api";

type Mine = Pick<PublicProfile, "activities" | "gtPrograms" | "csThreads" | "major" | "city" | "industry"> | null | undefined;

const norm = (s: string) => s.trim().toLowerCase();

/** What two people share, most specific first (clubs → programs → major → threads → city). Max 3. */
export function overlap(me: Mine, p: PublicProfile, max = 3): string[] {
  if (!me) return [];
  const out: string[] = [];
  const add = (x: string) => { if (!out.some((o) => norm(o) === norm(x))) out.push(x); };
  const both = (a: string[], b: string[]) => a.filter((x) => b.some((y) => norm(y) === norm(x)));
  both(p.activities, me.activities).forEach(add);
  both(p.gtPrograms, me.gtPrograms).forEach(add);
  if (p.major && me.major && norm(p.major) === norm(me.major)) add(p.major);
  both(p.csThreads, me.csThreads).forEach(add);
  if (p.city && me.city && norm(p.city) === norm(me.city)) add(p.city);
  return out.slice(0, max);
}

/** Plain-language reasons for the detail pane ("You're both in RoboJackets."). */
export function overlapReasons(me: Mine, p: PublicProfile): string[] {
  if (!me) return [];
  const r: string[] = [];
  const shared = (a: string[], b: string[]) => a.filter((x) => b.some((y) => norm(y) === norm(x)));
  const clubs = shared(p.activities, me.activities);
  if (clubs.length) r.push(`You're both in ${clubs.slice(0, 2).join(" and ")}.`);
  const progs = shared(p.gtPrograms, me.gtPrograms);
  if (progs.length) r.push(`You both did ${progs.slice(0, 2).join(" and ")}.`);
  if (p.major && me.major && norm(p.major) === norm(me.major)) r.push(`Same major: ${p.major}.`);
  if (p.city && me.city && norm(p.city) === norm(me.city)) r.push(`You're both in ${p.city}.`);
  return r;
}

// ---------------------------------------------------------------- city-level distance bands
type City = { city: string; state: string; lat: number; lng: number };
let citiesPromise: Promise<City[]> | null = null;
function loadCities() {
  citiesPromise ??= fetch("/api/cities").then((r) => r.json()).then((j: { cities: City[] }) => j.cities).catch(() => []);
  return citiesPromise;
}

function km(a: City, b: City) {
  const R = 6371, rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad, dLng = (b.lng - a.lng) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Distance band between two cities (never exact; city centroids only). */
export function useDistanceBand(fromCity?: string | null, toCity?: string | null, toState?: string | null): string | null {
  const [cities, setCities] = useState<City[] | null>(null);
  useEffect(() => { loadCities().then(setCities); }, []);
  if (!cities || !fromCity || !toCity) return null;
  const find = (c: string, s?: string | null) => cities.find((x) => x.city === c && (!s || x.state === s)) ?? cities.find((x) => x.city === c);
  const a = find(fromCity), b = find(toCity, toState);
  if (!a || !b) return null;
  if (a === b) return "Same city";
  const d = km(a, b);
  if (d < 25) return "<25 km";
  if (d < 100) return "25–100 km";
  if (d < 500) return "100–500 km";
  return "500+ km";
}
