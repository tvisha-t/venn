import { NextResponse } from "next/server";
import { requireSession } from "@/server/session";
import { route } from "@/server/http";
import { markIntrosSeen } from "@/server/intros";

export const POST = route(async () => {
  const s = await requireSession();
  await markIntrosSeen(s.profileId);
  return NextResponse.json({ ok: true });
});
