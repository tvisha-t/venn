import { NextResponse } from "next/server";
import { z } from "zod";
import { route } from "@/server/http";
import { requireSandbox } from "@/server/devGuard";
import { sql } from "@/server/db";
import { runReminders } from "@/server/intros";
import { rerunStandingGoals } from "@/server/agent/orchestrator";

// Demo helper: pretend N days passed for sent intros, then run the hourly job.
const Body = z.object({ days: z.number().int().min(1).max(30).default(5) });

export const POST = route(async (req: Request) => {
  requireSandbox();
  const { days } = Body.parse(await req.json().catch(() => ({})));
  const shift = `${days} days`;
  await sql`update intro_requests set sent_at = sent_at - ${shift}::interval,
    reminder_sent_at = reminder_sent_at - ${shift}::interval where status = 'sent'`;
  const reminders = await runReminders();
  const standing = await rerunStandingGoals();
  return NextResponse.json({ reminders, standing });
});
