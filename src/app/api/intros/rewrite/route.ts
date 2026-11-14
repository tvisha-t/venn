import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSession } from "@/server/session";
import { route, throttle, zId } from "@/server/http";
import { rewriteDraft } from "@/server/intros";

const Body = z.object({
  introId: zId,
  mode: z.enum(["shorter", "warmer"]),
  subject: z.string().max(120).optional(),
  body: z.string().max(3000).optional(),
});

export const POST = route(async (req: Request) => {
  throttle(req, "agent");
  const s = await requireSession();
  const b = Body.parse(await req.json());
  const current = b.subject != null && b.body != null ? { subject: b.subject, body: b.body } : undefined;
  return NextResponse.json(await rewriteDraft(s.profileId, b.introId, b.mode, current));
});
