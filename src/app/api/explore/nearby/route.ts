import { NextResponse } from "next/server";
import { requireSession } from "@/server/session";
import { route, throttle } from "@/server/http";
import { filtersFromSearch, nearbyOrigin, nearbyPeople } from "@/server/explore";

// People closest to the viewer. The device location (if sent) is rounded to ~1 km,
// used for this one query and never stored or logged. Results carry distance BANDS only.
export const GET = route(async (req: Request) => {
  throttle(req);
  const s = await requireSession();
  const sp = new URL(req.url).searchParams;
  const lat = sp.get("lat") != null ? Number(sp.get("lat")) : undefined;
  const lng = sp.get("lng") != null ? Number(sp.get("lng")) : undefined;
  for (const k of ["lat", "lng"]) sp.delete(k);
  const origin = await nearbyOrigin(s.profileId, Number.isFinite(lat) ? lat : undefined, Number.isFinite(lng) ? lng : undefined);
  const r = await nearbyPeople(filtersFromSearch(sp), origin, s.profileId);
  return NextResponse.json({ origin, ...r }, { headers: { "cache-control": "no-store" } });
});
