import { NextResponse } from "next/server";
import { requireAlum } from "@/server/roles";
import { route, throttle } from "@/server/http";
import { eventCities, NEIGHBORHOODS } from "@/server/events";

export const GET = route(async (req: Request) => {
  throttle(req);
  await requireAlum();
  return NextResponse.json({ cities: await eventCities(), neighborhoods: Object.keys(NEIGHBORHOODS) });
});
