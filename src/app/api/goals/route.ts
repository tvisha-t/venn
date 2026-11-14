import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSession } from "@/server/session";
import { route, throttle } from "@/server/http";
import { runGoal, type AgentEvent } from "@/server/agent/orchestrator";
import { sql } from "@/server/db";

const Body = z.object({ text: z.string().trim().min(2).max(500), standing: z.boolean().optional() });

// POST /api/goals — Server-Sent Events stream of agent steps, ending in a result.
export const POST = route(async (req: Request) => {
  throttle(req, "agent");
  const s = await requireSession();
  const { text, standing } = Body.parse(await req.json());
  const enc = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const emit = (e: AgentEvent) => controller.enqueue(enc.encode(`event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`));
      try {
        await runGoal(text, s.profileId, emit, { standing });
      } catch (err) {
        console.error("[agent]", err);
        emit({ type: "error", message: "The agent hit a problem. Please try again." });
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, {
    headers: { "content-type": "text/event-stream; charset=utf-8", "cache-control": "no-cache, no-transform", connection: "keep-alive" },
  });
});

// GET /api/goals — the user's goals (active/standing first) with new-match counts.
export const GET = route(async (req: Request) => {
  throttle(req);
  const s = await requireSession();
  const goals = await sql`
    select g.id, g.raw_text, g.standing, g.created_at,
      (select count(*)::int from goal_matches m where m.goal_id = g.id) matches,
      (select count(*)::int from goal_matches m where m.goal_id = g.id and m.is_new) new_matches
    from goals g where g.owner_profile_id = ${s.profileId}
    order by g.standing desc, g.created_at desc limit 20`;
  return NextResponse.json({
    goals: goals.map((g) => ({ id: g.id, rawText: g.raw_text, standing: g.standing, createdAt: g.created_at, matches: g.matches, newMatches: g.new_matches })),
  });
});
