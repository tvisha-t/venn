import { NextResponse } from "next/server";
import { HttpError, route, throttle } from "@/server/http";
import { verifyWebhook } from "@/server/crypto";
import { env } from "@/server/env";
import { processBounce } from "@/server/intros";

// Bounce / spam-complaint webhook (Postmark RecordType: Bounce | SpamComplaint).
export const POST = route(async (req: Request) => {
  throttle(req, "webhook");
  const raw = await req.text();
  const ok = verifyWebhook(raw, req.headers.get("x-venn-signature")) || (new URL(req.url).searchParams.get("secret") ?? "") === env.inboundSecret;
  if (!ok) throw new HttpError(401, "bad signature");
  const body = JSON.parse(raw) as { RecordType?: string; MessageID?: string };
  if (body.MessageID && (body.RecordType === "Bounce" || body.RecordType === "SpamComplaint")) await processBounce(body.MessageID);
  return NextResponse.json({ ok: true });
});
