import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSession } from "@/server/session";
import { route, throttle } from "@/server/http";
import { answerQuestion } from "@/server/verification";

const Body = z.object({ attemptId: z.string().uuid(), index: z.number().int().min(0).max(10), choice: z.string().max(200).nullable() });

// Checks the answer server-side and returns the next question (or the result). Never the correct answer.
export const POST = route(async (req: Request) => {
  throttle(req, "auth");
  const s = await requireSession();
  const b = Body.parse(await req.json());
  return NextResponse.json(await answerQuestion(s.profileId, b.attemptId, b.index, b.choice), { headers: { "cache-control": "no-store" } });
});
