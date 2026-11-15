import { NextResponse } from "next/server";
import { HttpError, route, throttle } from "@/server/http";
import { requireSession, clearSession } from "@/server/session";
import { canResetDemo, eraseDemoAccounts } from "@/server/demoReset";

// "Reset demo": only for a member signed in as one of DEMO_RESET_EMAILS. Erases those accounts and signs out.
export const POST = route(async (req: Request) => {
  throttle(req, "auth");
  const s = await requireSession();
  if (!(await canResetDemo(s.userId))) throw new HttpError(403, "Not allowed.");
  const erased = await eraseDemoAccounts();
  await clearSession();
  return NextResponse.json({ ok: true, erased });
});
