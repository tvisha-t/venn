import { NextResponse } from "next/server";
import { requireSession } from "@/server/session";
import { route, throttle } from "@/server/http";
import { SharedContactInput, getOwnSharedContact, setOwnSharedContact } from "@/server/sharedContact";

export const GET = route(async (req: Request) => {
  throttle(req);
  const s = await requireSession();
  return NextResponse.json({ contact: await getOwnSharedContact(s.profileId) }, { headers: { "cache-control": "no-store" } });
});

export const PUT = route(async (req: Request) => {
  throttle(req);
  const s = await requireSession();
  const input = SharedContactInput.parse(await req.json());
  const contact = await setOwnSharedContact(s.profileId, input, `user:${s.userId}`);
  return NextResponse.json({ contact }, { headers: { "cache-control": "no-store" } });
});
