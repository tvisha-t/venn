import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSession } from "@/server/session";
import { route, throttle } from "@/server/http";
import { setPassword } from "@/server/passwords";

const Body = z.object({ password: z.string().max(200) });

// Set or change the signed-in member's password (right after a code sign-in, or from "forgot password").
export const POST = route(async (req: Request) => {
  throttle(req, "auth");
  const s = await requireSession();
  const { password } = Body.parse(await req.json());
  await setPassword(s.userId, password);
  return NextResponse.json({ ok: true });
});
