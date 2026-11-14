import { NextResponse } from "next/server";
import { requireSession } from "@/server/session";
import { HttpError, route, throttle } from "@/server/http";
import { viewSharedContact } from "@/server/sharedContact";

// The ONLY route that returns contact details: what a claimed member explicitly
// opted to share with signed-in GT users. Every view is audit-logged.
export const GET = route(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  throttle(req);
  const s = await requireSession();
  const { id } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new HttpError(404, "Not found");
  const contact = await viewSharedContact(id, s.userId);
  if (!contact) throw new HttpError(404, "This person hasn't shared contact details. Request an intro instead.");
  return NextResponse.json({ contact }, { headers: { "cache-control": "no-store" } });
});
