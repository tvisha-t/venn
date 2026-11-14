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

// Main metro per US state (+ DC). A city that isn't in cities.json is placed at its state's metro,
// so every member with a US city/state shows up on the map and in "near you" (city-level only).
const STATE_METRO: Record<string, [string, number, number]> = {
  AL: ["Alabama", 33.52, -86.8], AK: ["Alaska", 61.22, -149.9], AZ: ["Arizona", 33.45, -112.07], AR: ["Arkansas", 34.75, -92.29],
  CA: ["California", 34.05, -118.24], CO: ["Colorado", 39.74, -104.99], CT: ["Connecticut", 41.76, -72.69], DE: ["Delaware", 39.74, -75.55],
  DC: ["District of Columbia", 38.91, -77.04], FL: ["Florida", 25.76, -80.19], GA: ["Georgia", 33.75, -84.39], HI: ["Hawaii", 21.31, -157.86],
  ID: ["Idaho", 43.62, -116.2], IL: ["Illinois", 41.88, -87.63], IN: ["Indiana", 39.77, -86.16], IA: ["Iowa", 41.59, -93.62],
  KS: ["Kansas", 37.69, -97.34], KY: ["Kentucky", 38.25, -85.76], LA: ["Louisiana", 29.95, -90.07], ME: ["Maine", 43.66, -70.26],
  MD: ["Maryland", 39.29, -76.61], MA: ["Massachusetts", 42.36, -71.06], MI: ["Michigan", 42.33, -83.05], MN: ["Minnesota", 44.98, -93.27],
  MS: ["Mississippi", 32.3, -90.18], MO: ["Missouri", 38.63, -90.2], MT: ["Montana", 45.78, -108.5], NE: ["Nebraska", 41.26, -95.93],
  NV: ["Nevada", 36.17, -115.14], NH: ["New Hampshire", 42.99, -71.46], NJ: ["New Jersey", 40.74, -74.17], NM: ["New Mexico", 35.08, -106.65],
  NY: ["New York", 40.71, -74.01], NC: ["North Carolina", 35.23, -80.84], ND: ["North Dakota", 46.88, -96.79], OH: ["Ohio", 39.96, -83.0],
  OK: ["Oklahoma", 35.47, -97.52], OR: ["Oregon", 45.52, -122.68], PA: ["Pennsylvania", 39.95, -75.17], RI: ["Rhode Island", 41.82, -71.41],
  SC: ["South Carolina", 34.0, -81.03], SD: ["South Dakota", 43.55, -96.73], TN: ["Tennessee", 36.16, -86.78], TX: ["Texas", 29.76, -95.37],
  UT: ["Utah", 40.76, -111.89], VT: ["Vermont", 44.48, -73.21], VA: ["Virginia", 37.54, -77.44], WA: ["Washington", 47.61, -122.33],
  WV: ["West Virginia", 38.35, -81.63], WI: ["Wisconsin", 43.04, -87.91], WY: ["Wyoming", 41.14, -104.82],
};

/** Coordinates for a city/state: the city if we know it, otherwise its state's main metro. */
export function placeFor(city: string | null | undefined, state: string | null | undefined): { lat: number; lng: number } | undefined {
  const c = findCity(city, state);
  if (c) return c;
  const s = state?.trim();
  if (!s) return undefined;
  const hit = STATE_METRO[s.toUpperCase()] ?? Object.values(STATE_METRO).find((v) => v[0].toLowerCase() === s.toLowerCase());
  return hit ? { lat: hit[1], lng: hit[2] } : undefined;
}

/** City centroid + up to ~3 km jitter, rounded to 2 decimals (§6 rule 8). */
export function geocode(city: string | null | undefined, state: string | null | undefined, seed: string) {
  const c = placeFor(city, state);
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
