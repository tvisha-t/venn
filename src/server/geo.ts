import cities from "../../mock-data/cities.json";

type City = { city: string; state: string; country: string; lat: number; lng: number };
const CITIES = cities as City[];

/** Round to 2 decimals (~1 km). Never store finer location. */
export function roundCoord(x: number): number {
  return Math.round(x * 100) / 100;
}

export function findCity(city?: string | null, state?: string | null): City | undefined {
  if (!city) return undefined;
  const c = city.trim().toLowerCase();
  const s = state?.trim().toLowerCase();
  return (
    CITIES.find((x) => x.city.toLowerCase() === c && (!s || x.state.toLowerCase() === s)) ??
    CITIES.find((x) => x.city.toLowerCase() === c)
  );
}

/** Deterministic PRNG from a string seed so re-imports put people in the same spot. */
function seeded(seed: string): () => number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  return () => {
    h += 0x6d2b79f5;
    let t = h;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** City centroid + up to ~3 km jitter, rounded to 2 decimals (§6 rule 8). */
export function geocode(city: string | null | undefined, state: string | null | undefined, seed: string) {
  const c = findCity(city, state);
  if (!c) return { lat: null, lng: null };
  const rnd = seeded(seed);
  const r = 3 * Math.sqrt(rnd()); // km
  const theta = rnd() * 2 * Math.PI;
  const dLat = (r * Math.cos(theta)) / 111;
  const dLng = (r * Math.sin(theta)) / (111 * Math.cos((c.lat * Math.PI) / 180));
  return { lat: roundCoord(c.lat + dLat), lng: roundCoord(c.lng + dLng) };
}

export const ATLANTA = { lat: 33.7756, lng: -84.3963 };
export { CITIES };
