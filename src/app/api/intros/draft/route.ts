import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSession } from "@/server/session";
import { route, throttle } from "@/server/http";
import { createDraft } from "@/server/intros";

const Body = z.object({ recipientId: z.string().uuid(), goalId: z.string().uuid().nullable().optional() });

export const POST = route(async (req: Request) => {
  throttle(req, "agent");
  const s = await requireSession();
  const { recipientId, goalId } = Body.parse(await req.json());
  return NextResponse.json(await createDraft(s.profileId, recipientId, goalId ?? null));
});
