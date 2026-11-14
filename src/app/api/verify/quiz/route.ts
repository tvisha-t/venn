import { NextResponse } from "next/server";
import { requireSession } from "@/server/session";
import { route, throttle } from "@/server/http";
import { startQuiz } from "@/server/verification";

// Starts an attempt and returns ONLY the first question and its shuffled options (no answer key).
export const POST = route(async (req: Request) => {
  throttle(req, "auth");
  const s = await requireSession();
  return NextResponse.json(await startQuiz(s.profileId), { headers: { "cache-control": "no-store" } });
});
