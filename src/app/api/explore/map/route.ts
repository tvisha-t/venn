import { NextResponse } from "next/server";
import { requireSession } from "@/server/session";
import { HttpError, route, throttle } from "@/server/http";
import { clusterPeople, filtersFromSearch, mapClusters } from "@/server/explore";

// Aggregates only: cluster centers + counts. People are returned only for a
// cluster that passes k-anonymity, and never with contact data.
export const GET = route(async (req: Request) => {
  throttle(req);
  const s = await requireSession();
  const sp = new URL(req.url).searchParams;
  const zoom = Number(sp.get("zoom") ?? 3);
  const cluster = sp.get("cluster");
  for (const k of ["zoom", "bbox", "cluster"]) sp.delete(k);
  const f = filtersFromSearch(sp);
  if (cluster) return NextResponse.json({ people: await clusterPeople(f, cluster, zoom, s.profileId) });
  const bbox = (new URL(req.url).searchParams.get("bbox") ?? "-180,-85,180,85").split(",").map(Number);
  if (bbox.length !== 4 || bbox.some((n) => !Number.isFinite(n))) throw new HttpError(400, "bad bbox");
  return NextResponse.json(await mapClusters(f, bbox as [number, number, number, number], zoom, s.profileId));
});
