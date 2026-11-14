import { NextResponse } from "next/server";
import { clearSession } from "@/server/session";
import { route } from "@/server/http";

export const POST = route(async () => {
  await clearSession();
  return NextResponse.json({ ok: true });
});
