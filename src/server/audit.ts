import { sql as defaultSql, type Sql } from "./db";

export type AuditAction =
  | "contact.read" | "intro.send" | "intro.reminder" | "intro.reply_forward" | "profile.remove"
  | "profile.claim" | "profile.approve" | "aa.import" | "intro.decline" | "email.bounce"
  | "shared_contact.view" | "shared_contact.update" | "invite.send" | "invite.optout"
  | "intro.connect" | "email.inbound_rejected"
  | "auth.code_requested" | "auth.code_verified" | "auth.code_failed" | "auth.wrong_domain" | "auth.rate_limited";

export async function audit(
  actor: string,
  action: AuditAction,
  targetId: string | null,
  meta: Record<string, unknown> = {},
  db: Sql = defaultSql,
) {
  await db`insert into audit_log (actor, action, target_id, meta) values (${actor}, ${action}, ${targetId}, ${db.json(meta as never)})`;
}
