import { NextResponse } from "next/server";
import { HttpError, route, throttle } from "@/server/http";
import { safeEq, verifyWebhook } from "@/server/crypto";
import { env } from "@/server/env";
import { processInbound } from "@/server/intros";

type PostmarkInbound = {
  To?: string; OriginalRecipient?: string; ToFull?: { Email: string }[]; MailboxHash?: string;
  From?: string; FromFull?: { Email?: string }; Subject?: string; Headers?: { Name: string; Value: string }[];
  MessageID?: string; TextBody?: string; StrippedTextReply?: string;
};

function isAutoReply(b: PostmarkInbound): boolean {
  const h = (name: string) => b.Headers?.find((x) => x.Name.toLowerCase() === name)?.Value?.toLowerCase();
  const auto = h("auto-submitted");
  if (auto && auto !== "no") return true;
  if (h("x-autoreply") || h("x-autorespond") || h("precedence") === "auto_reply") return true;
  return /^(automatic reply|auto(matic)?[- ]?reply|out of (the )?office)/i.test((b.Subject ?? "").trim());
}

// Provider inbound webhook (Postmark inbound JSON). Two ways in:
// - Postmark: shared secret in ?token= (or legacy ?secret=). The reply must come FROM the recipient's address.
// - Internal (sandbox "Reply as…"): HMAC of the raw body in `x-venn-signature`.
export const POST = route(async (req: Request) => {
  throttle(req, "webhook");
  const raw = await req.text();
  const url = new URL(req.url);
  const internal = verifyWebhook(raw, req.headers.get("x-venn-signature"));
  const secret = url.searchParams.get("token") ?? url.searchParams.get("secret") ?? "";
  const provider = !internal && secret.length > 0 && safeEq(secret, env.inboundSecret);
  if (!internal && !provider) throw new HttpError(401, "bad signature");

  const body = JSON.parse(raw) as PostmarkInbound;
  if (!body.MessageID) throw new HttpError(400, "missing MessageID");
  const to = body.MailboxHash
    ? `x+${body.MailboxHash}@relay`
    : body.OriginalRecipient || body.ToFull?.map((t) => t.Email).join(",") || body.To || "";
  const r = await processInbound({
    to,
    providerMessageId: body.MessageID,
    text: body.StrippedTextReply || body.TextBody || "",
    fromAddress: body.FromFull?.Email ?? body.From,
    requireFrom: provider,
    autoReply: isAutoReply(body),
  });
  // Never echo addresses back. Always 200 for well-formed webhooks so Postmark doesn't retry ignored mail.
  return NextResponse.json({ ok: r.ok });
});
