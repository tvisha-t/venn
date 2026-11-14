import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifyLink, signSession, type LinkAction } from "@/server/crypto";
import { claimTargetByLink, declineByLink, removeByLink } from "@/server/intros";
import { throttle } from "@/server/http";

const ACTIONS: LinkAction[] = ["decline", "claim", "remove"];

function page(title: string, body: string, status = 200) {
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title} · venn</title><link rel="preconnect" href="https://fonts.googleapis.com"><link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;600;700&display=swap" rel="stylesheet"><style>
body{margin:0;background:#F8F4F7;color:#17131A;font:16px/1.55 'Plus Jakarta Sans',system-ui,sans-serif;display:grid;place-items:center;min-height:100vh;padding:16px}
main{max-width:460px;width:100%;background:#fff;border:1px solid #ECE3E9;border-top:3px solid #7A3E6A;border-radius:16px;padding:28px}
h1{font-size:22px;line-height:1.3;font-weight:700;letter-spacing:-.02em;margin:0 0 10px}p{margin:0 0 16px;color:#625A66}
button{background:#7A3E6A;color:#fff;border:0;border-radius:8px;padding:10px 16px;font-family:inherit;font-size:15px;font-weight:600;cursor:pointer}
button:focus-visible{outline:2px solid #C0699B;outline-offset:2px}
</style></head><body><main><p style="font-size:22px;line-height:1;font-weight:700;color:#7A3E6A;letter-spacing:-.03em;margin:0 0 20px">venn</p>${body}</main></body></html>`;
  return new NextResponse(html, { status, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "x-robots-tag": "noindex" } });
}

const CONFIRM: Record<LinkAction, { title: string; text: string; button: string }> = {
  decline: { title: "Not interested?", text: "We'll let them know you're not available right now. Nothing about you is shared.", button: "Confirm — not interested" },
  remove: { title: "Remove me from Venn", text: "We'll delete your listing and never list or contact you again.", button: "Remove me" },
  claim: { title: "Claim your profile", text: "", button: "" },
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
  return BAD("invalid");
}
