import { requireSession } from "@/server/session";
import { route, throttle } from "@/server/http";
import { eventIcs, getEvent } from "@/server/events";

// Calendar file for one event (the only "reminder" Venn offers).
export const GET = route(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  throttle(req);
  const s = await requireSession();
  const e = await getEvent(s.profileId, (await ctx.params).id);
  const name = e.title.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase() || "event";
  return new Response(eventIcs(e), {
    headers: { "content-type": "text/calendar; charset=utf-8", "content-disposition": `attachment; filename="${name}.ics"`, "cache-control": "no-store" },
  });
});
