import { NextResponse } from "next/server";
import { z } from "zod";
import { HttpError, route } from "@/server/http";
import { requireSandbox } from "@/server/devGuard";
import { sql } from "@/server/db";
import { randomToken, signWebhook } from "@/server/crypto";
import { relayAddress } from "@/server/email/provider";
import { env } from "@/server/env";

// Simulates the recipient hitting Reply: posts a Postmark-shaped payload to the real inbound webhook.
const Body = z.object({ text: z.string().min(1).max(4000) });

export const POST = route(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  requireSandbox();
  const { id } = await ctx.params;
  const { text } = Body.parse(await req.json());
  const [e] = await sql`select i.relay_token from sandbox_emails e join intro_requests i on i.id = e.intro_id where e.id = ${id}`;
  if (!e) throw new HttpError(404, "Email not found");
  const payload = JSON.stringify({ OriginalRecipient: relayAddress(e.relay_token), MessageID: `sandbox-in-${randomToken(10)}`, TextBody: text });
  const res = await fetch(new URL("/api/email/inbound", env.appUrl.startsWith("http") ? req.url : env.appUrl), {
    method: "POST", headers: { "content-type": "application/json", "x-venn-signature": signWebhook(payload) }, body: payload,
  });
  if (!res.ok) throw new HttpError(502, "Inbound webhook failed");
  return NextResponse.json(await res.json());
});
