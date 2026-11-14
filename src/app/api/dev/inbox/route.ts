import { NextResponse } from "next/server";
import { route } from "@/server/http";
import { requireSandbox } from "@/server/devGuard";
import { sql } from "@/server/db";

// Sandbox mailbox. Shows recipients by NAME only — mock addresses are never displayed.
export const GET = route(async () => {
  requireSandbox();
  const rows = await sql`
    select e.id, e.intro_id, e.mailbox, e.from_name, e.reply_to_label, e.subject, e.html, e.text_body, e.kind, e.created_at,
      p.first_name || ' ' || p.last_name as to_name, p.status as to_status, i.status as intro_status
    from sandbox_emails e join profiles p on p.id = e.to_profile_id left join intro_requests i on i.id = e.intro_id
    order by e.created_at desc limit 100`;
  return NextResponse.json({
    emails: rows.map((r) => ({
      id: r.id, introId: r.intro_id, mailbox: r.mailbox, fromName: r.from_name, replyToLabel: r.reply_to_label, subject: r.subject,
      html: r.html, text: r.text_body, kind: r.kind, createdAt: r.created_at, toName: r.to_name, toStatus: r.to_status, introStatus: r.intro_status,
    })),
  });
});
