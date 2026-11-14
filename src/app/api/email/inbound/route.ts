import { NextResponse } from "next/server";
import { HttpError, route, throttle } from "@/server/http";
import { verifyWebhook } from "@/server/crypto";
import { env } from "@/server/env";
import { processInbound } from "@/server/intros";

// Provider inbound webhook (Postmark inbound JSON shape). Verified by either an
// HMAC of the raw body in `x-venn-signature`, or a shared secret in `?secret=` (Postmark basic-auth URL style).
export const POST = route(async (req: Request) => {
  throttle(req, "webhook");
  const raw = await req.text();
  const url = new URL(req.url);
  const ok = verifyWebhook(raw, req.headers.get("x-venn-signature")) || (url.searchParams.get("secret") ?? "") === env.inboundSecret;
  if (!ok) throw new HttpError(401, "bad signature");
  const body = JSON.parse(raw) as { To?: string; OriginalRecipient?: string; ToFull?: { Email: string }[]; MessageID?: string; TextBody?: string; StrippedTextReply?: string };
  const to = body.OriginalRecipient || body.ToFull?.map((t) => t.Email).join(",") || body.To || "";
  if (!body.MessageID) throw new HttpError(400, "missing MessageID");
  const r = await processInbound({ to, providerMessageId: body.MessageID, text: body.StrippedTextReply || body.TextBody || "" });
  // Never echo addresses back.
  return NextResponse.json({ ok: r.ok, duplicate: "duplicate" in r ? r.duplicate : undefined });
});
