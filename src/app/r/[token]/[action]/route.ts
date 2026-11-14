import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifyLink, signSession, type LinkAction } from "@/server/crypto";
import { claimTargetByLink, declineByLink, removeByLink } from "@/server/intros";
import { optOutOfInvites } from "@/server/invites";
import { throttle } from "@/server/http";

const ACTIONS: LinkAction[] = ["decline", "claim", "remove", "noinvite"];

function page(title: string, body: string, status = 200) {
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title} · venn</title><link rel="preconnect" href="https://fonts.googleapis.com"><link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;600;700;800&display=swap" rel="stylesheet"><style>
body{margin:0;background:#f6f8fa;color:#0d1b2a;font:16px/1.55 'Plus Jakarta Sans',system-ui,sans-serif;display:grid;place-items:center;min-height:100vh;padding:16px}
main{max-width:460px;width:100%;background:#fff;border:1px solid #e1e7ed;border-radius:28px;overflow:hidden;padding:0;padding:28px}
h1{font-size:22px;line-height:1.3;font-weight:700;letter-spacing:-.02em;margin:0 0 10px}p{margin:0 0 16px;color:#4f5559}
button{background:#003057;color:#fff;height:48px;padding:0 20px;border:0;border-radius:12px;font-family:inherit;font-size:15px;font-weight:600;cursor:pointer}
button:focus-visible{outline:2px solid #003057;outline-offset:2px}.band{background:#003057;color:#fff;height:72px;display:flex;align-items:center;padding:0 28px;font-size:26px;font-weight:800;letter-spacing:-.04em}.body{padding:28px}
</style></head><body><main><div class="band">venn</div><div class="body">${body}</div></main></body></html>`;
  return new NextResponse(html, { status, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "x-robots-tag": "noindex" } });
}

const CONFIRM: Record<LinkAction, { title: string; text: string; button: string }> = {
  decline: { title: "Not interested?", text: "We'll let them know you're not available right now. Nothing about you is shared.", button: "Confirm — not interested" },
  remove: { title: "Remove me from Venn", text: "We'll delete your listing and never list or contact you again.", button: "Remove me" },
  claim: { title: "Claim your profile", text: "", button: "" },
  noinvite: { title: "Stop invites", text: "We'll never send this address another Venn invite. We don't keep your email, only a one-way fingerprint so we can recognize it.", button: "Don't send me invites" },
};

const BAD = (reason: string) =>
  page("Link problem", `<h1>This link ${reason === "expired" ? "has expired" : "isn't valid"}</h1><p>${reason === "expired" ? "Links in Venn emails work for 60 days." : "It may have been copied incompletely."} Nothing was changed.</p>`, 400);

// GET shows a confirm page (so email link scanners can't trigger actions); POST performs it.
export async function GET(req: Request, ctx: { params: Promise<{ token: string; action: string }> }) {
  try { throttle(req); } catch { return page("Slow down", "<h1>Too many requests</h1><p>Please try again in a minute.</p>", 429); }
  const { token, action } = await ctx.params;
  if (!ACTIONS.includes(action as LinkAction)) return BAD("invalid");
  const v = verifyLink(token, action as LinkAction);
  if (!v.ok) return BAD(v.reason);

  if (action === "claim") {
    const r = await claimTargetByLink(token);
    if ("error" in r) return page("Not available", "<h1>This profile can't be claimed</h1><p>It may have been removed.</p>", 410);
    if (r.alreadyClaimed) return NextResponse.redirect(new URL("/signin", req.url));
    const jar = await cookies();
    jar.set("venn_claim", signSession({ userId: "claim", profileId: r.profileId }), { httpOnly: true, sameSite: "lax", path: "/", maxAge: 1800, secure: process.env.NODE_ENV === "production" });
    return NextResponse.redirect(new URL("/signin?claim=1", req.url));
  }
  const c = CONFIRM[action as LinkAction];
  return page(c.title, `<h1>${c.title}</h1><p>${c.text}</p><form method="post"><button type="submit">${c.button}</button></form>`);
}

export async function POST(req: Request, ctx: { params: Promise<{ token: string; action: string }> }) {
  try { throttle(req); } catch { return page("Slow down", "<h1>Too many requests</h1><p>Please try again in a minute.</p>", 429); }
  const { token, action } = await ctx.params;
  if (action === "decline") {
    const r = await declineByLink(token);
    if ("error" in r) return BAD(r.error!);
    return page("Thanks for letting us know", "<h1>Got it — thanks for letting us know</h1><p>We've told them you're not available. Nothing about you was shared.</p>");
  }
  if (action === "remove") {
    const r = await removeByLink(token);
    if ("error" in r) return BAD(r.error!);
    return page("Removed", "<h1>You've been removed from Venn.</h1><p>We won't list or contact you again.</p>");
  }
  if (action === "noinvite") {
    const v = verifyLink(token, "noinvite");
    if (!v.ok) return BAD(v.reason);
    await optOutOfInvites(v.relayToken);
    return page("Done", "<h1>You won't get any more Venn invites.</h1><p>Nothing else was stored about you.</p>");
  }
  return BAD("invalid");
}
