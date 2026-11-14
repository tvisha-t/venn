import { NextResponse } from "next/server";
import { requireSession } from "@/server/session";
import { route, throttle } from "@/server/http";
import { nearbyOrigin, nearbyPeople } from "@/server/explore";
import { OPEN_TO } from "@/server/agent/vocab";

// Home intent tiles in ONE request: for each "open to" value, how many people are within 25 km
// and the 3 closest (for the avatar stack). Distance bands only, as in /api/explore/nearby.
export const GET = route(async (req: Request) => {
  throttle(req);
  const s = await requireSession();
  const wanted = new URL(req.url).searchParams.getAll("openTo").filter((o) => OPEN_TO.includes(o)).slice(0, 8);
  const origin = await nearbyOrigin(s.profileId);
  const results = await Promise.all(wanted.map((openTo) => nearbyPeople({ openTo }, origin, s.profileId, 3)));
  return NextResponse.json(
    { intents: Object.fromEntries(wanted.map((o, i) => [o, results[i]])) },
    { headers: { "cache-control": "private, max-age=60" } },
  );
});
