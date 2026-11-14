import { NextResponse } from "next/server";
import { CITIES } from "@/server/geo";

// Public city centroids (not people) for grouping results on the map by city.
export function GET() {
  return NextResponse.json({ cities: CITIES.map((c) => ({ city: c.city, state: c.state, lat: c.lat, lng: c.lng })) }, { headers: { "cache-control": "public, max-age=86400" } });
}
