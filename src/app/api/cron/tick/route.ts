import { NextResponse } from "next/server";
import { HttpError, route } from "@/server/http";
import { runReminders } from "@/server/intros";
import { rerunStandingGoals } from "@/server/agent/orchestrator";
import { runRetention } from "@/server/retention";

// Daily job (Vercel Cron; Hobby plans allow daily only): reminders, no-response, standing goals, retention.
export const GET = route(async (req: Request) => {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  if (process.env.NODE_ENV === "production" && (!secret || auth !== `Bearer ${secret}`)) throw new HttpError(401, "unauthorized");
  const reminders = await runReminders();
  const standing = await rerunStandingGoals();
  const retention = await runRetention();
  return NextResponse.json({ reminders, standing, retention });
});
